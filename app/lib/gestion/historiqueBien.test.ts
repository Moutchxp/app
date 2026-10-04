import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  grouperParCategorie, grouperParConversation, jourParis, libelleOrdreFil, messagesDuFil, motAucunResultat,
  motDeuxCompteurs, motLocataireDeLaPeriode, ordreFilSuivant, periodeDeLEvenement, periodeDeLOccupation,
  reglagesActifs, REGLAGES_DEFAUT, reglagesEnFiltres, reglagesEnParametres, replierLesCartes,
  SEUIL_REPLI_CARTES, trierFil, type CategoriePartie, type Reglages,
} from './historiqueBien';
import { INTERLOCUTEURS_MAX, type Interlocuteur, type LigneHistorique } from './historique';
/** 🔴 LA SOURCE DU SEUIL : on vérifie l'IDENTITÉ, pas une égalité de valeur recopiée. */
import {
  replierLesCartes as replierPartie, SEUIL_REPLI_CARTES as SEUIL_PARTIE,
} from './partieCategorie';

/**
 * LOT HISTORIQUE-BIEN-1 — LES DÉCISIONS DU BLOC « HISTORIQUE DU BIEN », ÉPROUVÉES SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE EN PREMIER, ET POURQUOI IL EXISTE : **« EN PLACE » NE PEUT PAS S'ÉCRIRE SUR UN
 * LOGEMENT VACANT.** Une maquette de l'étude annonçait « locataire en place depuis le 08/06/2025 » sur un logement
 * vacant depuis le 28/09/2026, avec une date d'entrée DEVINÉE (la vraie était le 01/05/2025). Ces dates-là sont
 * reprises telles quelles dans l'épreuve ③, pour que ce défaut-ci ne puisse pas revenir.
 *
 * ⚠️ POURQUOI UNE PHRASE MÉRITE UNE ÉPREUVE. Celle-là est lue, crue, et sert à agir : on écrit « au locataire en
 * place » pour un état des lieux ou une régularisation de charges. Une phrase fausse fait écrire à quelqu'un qui
 * est parti — ce qui est pire qu'un écran qui ne dirait rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le 4 octobre 2026, 10 h à Paris — le « maintenant » de toutes les épreuves qui en ont besoin. */
const MAINTENANT = new Date('2026-10-04T08:00:00Z');

const inter = (o: Partial<Interlocuteur> = {}): Interlocuteur => ({
  adresse: 'qui@fictif.test', nom: null, nbMails: 1, aEcrit: 1, enCopie: 0, interne: false, ...o,
});

const ligne = (o: Partial<LigneHistorique> = {}): LigneHistorique => ({
  messageId: 1, filId: 10, messageIdRfc: null, recuLe: '2026-02-01T09:00:00Z', sens: 'recu',
  de: 'qui@fictif.test', deNom: null, destinataires: [], objet: 'Objet', extrait: null, pieces: [],
  parCible: { sorte: 'lot', cle: '155', id: null }, cibleLibelle: 'Lot 155', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null, ...o,
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA PÉRIODE D'UN ÉVÉNEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① la période d’un événement', () => {
  it('🔴 un événement CLOS borne les deux côtés', () => {
    expect(periodeDeLEvenement(
      { ouvertLe: '2026-02-03T07:15:00Z', closLe: '2026-03-21T16:00:00Z' }, MAINTENANT,
    )).toEqual({ du: '2026-02-03', au: '2026-03-21' });
  });

  it('🔴 un événement EN COURS court jusqu’à maintenant', () => {
    expect(periodeDeLEvenement({ ouvertLe: '2026-09-28T07:15:00Z', closLe: null }, MAINTENANT))
      .toEqual({ du: '2026-09-28', au: '2026-10-04' });
  });

  /**
   * ⚠️ UN ÉVÉNEMENT MARQUÉ TRAITÉ MAIS SANS DATE DE CLÔTURE (reprises anciennes) court jusqu'à aujourd'hui, et
   * n'invente pas une clôture. Une date de clôture devinée aurait coupé le fil avant les derniers mails.
   */
  it('⚠️ pas de date de clôture ⇒ jusqu’à aujourd’hui, jamais une date inventée', () => {
    expect(periodeDeLEvenement({ ouvertLe: '2026-01-05T00:00:00Z', closLe: '' }, MAINTENANT).au)
      .toBe('2026-10-04');
  });

  /** ⚠️ UNE OUVERTURE INCONNUE RESTE `null` : « pas de borne de ce côté », jamais « aujourd'hui ». */
  it('⚠️ une ouverture inconnue ou abîmée ne devient pas une date', () => {
    expect(periodeDeLEvenement({ ouvertLe: null, closLe: null }, MAINTENANT).du).toBeNull();
    expect(periodeDeLEvenement({ ouvertLe: '03/07/2024', closLe: null }, MAINTENANT).du).toBeNull();
  });

  it('⚠️ le jour civil est celui de PARIS, pas celui d’UTC', () => {
    // 23 h 30 UTC le 3 octobre = déjà le 4 octobre à Paris (UTC+2 en octobre).
    expect(jourParis(new Date('2026-10-03T23:30:00Z'))).toBe('2026-10-04');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES QUATRE GROUPES DE PARTIES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② les parties, en trois groupes PLUS « À répartir »', () => {
  const liste = [
    inter({ adresse: 'proprio@fictif.test', nbMails: 40, aEcrit: 12, enCopie: 28 }),
    inter({ adresse: 'locataire@fictif.test', nbMails: 20, aEcrit: 20, enCopie: 0 }),
    inter({ adresse: 'plombier@fictif.test', nbMails: 7, aEcrit: 4, enCopie: 3 }),
    inter({ adresse: 'assureur@fictif.test', nbMails: 5, aEcrit: 2, enCopie: 3 }),
  ];
  const categories = new Map<string, CategoriePartie>([
    ['proprio@fictif.test', 'proprietaire'],
    ['locataire@fictif.test', 'locataire'],
    ['plombier@fictif.test', 'independant'],
  ]);

  it('🔴 quatre groupes, toujours, et dans le même ordre', () => {
    const g = grouperParCategorie(liste, categories);
    expect(g.map((x) => x.cle)).toEqual(['proprietaire', 'locataire', 'independant', 'a_repartir']);
    expect(g.map((x) => x.titre)).toEqual(['Propriétaire', 'Locataire', 'Indépendant', 'À répartir']);
  });

  it('🔴 chaque groupe porte son compte, et l’inconnu tombe dans « À répartir »', () => {
    const g = grouperParCategorie(liste, categories);
    expect(g.map((x) => x.nb)).toEqual([1, 1, 1, 1]);
    expect(g[3].interlocuteurs.map((i) => i.adresse)).toEqual(['assureur@fictif.test']);
  });

  /** 🔴 LES QUATRE SONT RENDUS MÊME VIDES : des cases qui se déplacent d'un bien à l'autre se cochent de travers. */
  it('🔴 aucune catégorie connue ⇒ les quatre groupes existent quand même, tout « à répartir »', () => {
    const g = grouperParCategorie(liste, new Map());
    expect(g).toHaveLength(4);
    expect(g.map((x) => x.nb)).toEqual([0, 0, 0, 4]);
  });

  it('⚠️ la casse ne range personne « à répartir » par erreur', () => {
    const g = grouperParCategorie([inter({ adresse: 'Proprio@Fictif.Test' })], categories);
    expect(g[0].nb).toBe(1);
    expect(g[3].nb).toBe(0);
  });

  /** ⚠️ L'ORDRE REÇU EST CONSERVÉ : la route rend du plus bavard au moins bavard, et c'est la seule vérité. */
  it('⚠️ l’ordre à l’intérieur d’un groupe est celui reçu, jamais retrié', () => {
    const g = grouperParCategorie([
      inter({ adresse: 'b@fictif.test', nbMails: 9 }),
      inter({ adresse: 'a@fictif.test', nbMails: 3 }),
    ], new Map());
    expect(g[3].interlocuteurs.map((i) => i.adresse)).toEqual(['b@fictif.test', 'a@fictif.test']);
  });

  /**
   * 🔴🔴 LE SEUIL N'EST PAS REDÉFINI ICI : c'est CELUI de `partieCategorie.ts`, réexporté. On le prouve par
   * l'identité des deux valeurs ET par celle de la fonction de comparaison — un `6` recopié aurait passé le
   * premier contrôle et pas le second.
   */
  it('🔴🔴 le seuil de repli vaut 6, et c’est LE MÊME que celui de `partieCategorie`', () => {
    expect(SEUIL_REPLI_CARTES).toBe(6);
    expect(SEUIL_REPLI_CARTES).toBe(SEUIL_PARTIE);
    expect(replierLesCartes).toBe(replierPartie);
    // La borne est STRICTE : six personnes se déplient, sept se replient.
    expect(replierLesCartes(6)).toBe(false);
    expect(replierLesCartes(7)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE VERROU : « LOGEMENT VACANT », AVEC LES DATES DU DÉFAUT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ 🔴🔴 « en place » ne s’écrit JAMAIS sur un logement vacant', () => {
  /**
   * 🔴🔴 LES DATES SONT CELLES DU DÉFAUT MESURÉ. La maquette annonçait « locataire en place depuis le
   * 08/06/2025 » pour un logement vacant depuis le 28/09/2026, dont le dernier locataire était entré le
   * 01/05/2025. Les trois dates sont ici, et les trois sont vérifiées.
   */
  const VACANT = [{ libelle: 'MARTY Jean-François', depuis: '2025-05-01', jusqua: '2026-09-28' }];

  it('🔴🔴 il dit « Logement vacant depuis le 28/09/2026 », et le mot « en place » n’y est PAS', () => {
    const mot = motLocataireDeLaPeriode(VACANT, MAINTENANT);
    expect(mot).toContain('Logement vacant depuis le 28/09/2026');
    expect(mot).not.toContain('en place');
  });

  it('🔴🔴 il nomme le dernier locataire ET sa VRAIE date d’entrée — jamais celle qui avait été devinée', () => {
    const mot = motLocataireDeLaPeriode(VACANT, MAINTENANT);
    expect(mot).toContain('dernier locataire MARTY Jean-François');
    expect(mot).toContain('entré le 01/05/2025');
    // 🔴 LA DATE DEVINÉE DE LA MAQUETTE N'APPARAÎT NULLE PART.
    expect(mot).not.toContain('08/06/2025');
  });

  it('🔴 un bail OUVERT, lui, dit bien « en place » — et avec sa vraie date', () => {
    const mot = motLocataireDeLaPeriode(
      [{ libelle: 'NGUYEN Linh', depuis: '2025-05-01', jusqua: null }], MAINTENANT);
    expect(mot).toBe('Locataire en place : NGUYEN Linh (entré le 01/05/2025)');
  });

  /** ⚠️ LE JOUR DE LA SORTIE, IL A ENCORE LES CLÉS : même convention de borne haute incluse que tout le module. */
  it('⚠️ une sortie encore à venir (ou aujourd’hui) laisse le bail ouvert', () => {
    expect(motLocataireDeLaPeriode(
      [{ libelle: 'NGUYEN Linh', depuis: '2025-05-01', jusqua: '2026-10-04' }], MAINTENANT,
    )).toContain('en place');
    expect(motLocataireDeLaPeriode(
      [{ libelle: 'NGUYEN Linh', depuis: '2025-05-01', jusqua: '2026-12-31' }], MAINTENANT,
    )).toContain('en place');
  });

  /** 🔴 AUCUNE OCCUPATION N'EST PAS « VACANT » : c'est « on ne sait pas » (piège du lot 71). */
  it('🔴 aucune occupation connue ⇒ « aucun locataire connu », ni « vacant » ni « en place »', () => {
    const mot = motLocataireDeLaPeriode([], MAINTENANT);
    expect(mot).toBe('Aucun locataire connu pour ce logement.');
    expect(mot).not.toContain('en place');
    expect(mot).not.toContain('vacant');
  });

  it('🔴 une entrée non renseignée se DIT, elle ne se devine pas', () => {
    expect(motLocataireDeLaPeriode([{ libelle: 'X', depuis: null, jusqua: null }], MAINTENANT))
      .toBe('Locataire en place : X (date d’entrée non renseignée)');
    expect(motLocataireDeLaPeriode([{ libelle: 'X', depuis: null, jusqua: '2026-01-01' }], MAINTENANT))
      .toContain('date d’entrée non renseignée');
  });

  /** ⚠️ UNE SORTIE RENSEIGNÉE MAIS ILLISIBLE N'OUVRE PAS LE BAIL : « il y a eu une sortie » reste un fait. */
  it('⚠️ une sortie abîmée ne fait pas écrire « en place »', () => {
    expect(motLocataireDeLaPeriode([{ libelle: 'X', depuis: '2025-05-01', jusqua: '28/09/2026' }], MAINTENANT))
      .not.toContain('en place');
  });

  it('🔴 plusieurs occupants d’un même bail s’écrivent ensemble, au pluriel', () => {
    const mot = motLocataireDeLaPeriode([
      { libelle: 'A', depuis: '2025-05-01', jusqua: null },
      { libelle: 'B', depuis: '2025-05-01', jusqua: null },
    ], MAINTENANT);
    expect(mot).toContain('Locataires en place');
    expect(mot).toContain('A (entré le 01/05/2025)');
    expect(mot).toContain('B (entré le 01/05/2025)');
  });

  /** ⚠️ LE « DERNIER » EST CELUI DONT LA SORTIE EST LA PLUS RÉCENTE, pas le premier du tableau. */
  it('⚠️ entre deux baux terminés, c’est le plus récemment sorti qui est nommé', () => {
    const mot = motLocataireDeLaPeriode([
      { libelle: 'ANCIEN', depuis: '2020-01-01', jusqua: '2024-06-30' },
      { libelle: 'RECENT', depuis: '2024-07-01', jusqua: '2026-09-28' },
    ], MAINTENANT);
    expect(mot).toContain('dernier locataire RECENT');
    expect(mot).not.toContain('ANCIEN');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES ANCIENS LOCATAIRES SONT SÉLECTIONNABLES, CHACUN AVEC SA PÉRIODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ les anciens locataires, chacun avec sa période', () => {
  it('🔴 choisir un ancien locataire règle les deux dates sur SON bail', () => {
    expect(periodeDeLOccupation({ libelle: 'MARTY', depuis: '2025-05-01', jusqua: '2026-09-28' }))
      .toEqual({ du: '2025-05-01', au: '2026-09-28' });
  });

  it('🔴 un bail en cours ne borne que le début', () => {
    expect(periodeDeLOccupation({ libelle: 'NGUYEN', depuis: '2025-05-01', jusqua: null }))
      .toEqual({ du: '2025-05-01', au: null });
  });

  /** ⚠️ UNE OCCUPATION SANS DATE RESTE PROPOSÉE : l'écarter ferait disparaître un locataire réel. */
  it('⚠️ une occupation sans aucune date reste proposée, et ne règle rien', () => {
    expect(periodeDeLOccupation({ libelle: 'X', depuis: null, jusqua: null }))
      .toEqual({ du: null, au: null });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LES DEUX COMPTEURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ les deux compteurs d’une personne', () => {
  it('🔴 ils sont écrits dans les mots d’Arno', () => {
    expect(motDeuxCompteurs({ aEcrit: 3, enCopie: 2 })).toBe('a écrit : 3 · en copie : 2');
  });

  /** 🔴 LES DEUX SONT ÉCRITS MÊME À ZÉRO : « a écrit : 0 · en copie : 23 » est le voisin qui n'a jamais répondu. */
  it('🔴 un compteur à zéro est écrit, pas effacé', () => {
    expect(motDeuxCompteurs({ aEcrit: 0, enCopie: 23 })).toBe('a écrit : 0 · en copie : 23');
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 UN MAIL NE COMPTE QU'UNE FOIS PAR ADRESSE — LA RÈGLE VIT EN SQL, ET ELLE EST VÉRIFIÉE SUR SA FORME
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     ⚠️ POURQUOI UNE ÉPREUVE SUR LE SQL ET NON SUR UNE FONCTION PURE. Les deux compteurs sont calculés EN BASE, en
     UNE requête (règle du module : jamais une requête par adresse — le lot 155 en compte 76). Il n'y a donc pas de
     fonction pure à appeler ; ce qui peut régresser, c'est la FORME de l'agrégat. On vérifie donc les trois
     fragments SÉMANTIQUES qui portent la règle, sur une chaîne normalisée (convention d'AGENTS.md), et JAMAIS la
     forme complète du WHERE.

     ⚠️ CE QUI SE CASSERAIT SANS LE PALIER `par_mail` : `gestion_message_adresse` porte une ligne par (message,
     adresse, RÔLE). Une adresse à la fois expéditeur et destinataire d'un même mail y a DEUX lignes, et deux
     `count(DISTINCT …)` séparés la compteraient dans les deux colonnes. MESURÉ EN BASE LE 04/10/2026 :
     **248 couples (adresse, message)** portent les deux rôles, sur **61 adresses distinctes**.
  */
  const REPO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8').replace(/\s+/g, ' ');

  it('🔴🔴 la requête réduit d’abord à un couple (adresse, message) avant de compter', () => {
    expect(REPO).toContain('par_mail AS ( SELECT adresse, interne, message_id,');
    expect(REPO).toContain("bool_or(role = 'expediteur') AS a_ecrit");
    expect(REPO).toContain("bool_or(role IN ('destinataire', 'copie')) AS en_copie");
  });

  it('🔴🔴 « a écrit » l’emporte : « en copie » exclut les mails où l’adresse a aussi écrit', () => {
    expect(REPO).toContain('count(*) FILTER (WHERE p.en_copie AND NOT p.a_ecrit)::text AS n_copie');
    expect(REPO).toContain('count(*) FILTER (WHERE p.a_ecrit)::text AS n_ecrit');
  });

  /** 🔴 UNE SEULE REQUÊTE POUR TOUTE LA LISTE : le plafond est lié une fois, et il n'y a pas de boucle. */
  it('🔴 le total est inchangé par rapport à avant le lot (un enregistrement par message)', () => {
    expect(REPO).toContain('count(*)::text AS n');
    expect(REPO).toContain('GROUP BY adresse, interne, message_id');
  });

  /** 🔴🔴 LE PLAFOND MESURÉ : 76 adresses sur le lot 155. 60 en perdait 16, SANS les nommer. */
  it('🔴🔴 le plafond d’interlocuteurs couvre le cas réel mesuré (76)', () => {
    expect(INTERLOCUTEURS_MAX).toBe(120);
    expect(INTERLOCUTEURS_MAX).toBeGreaterThan(76);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LES RÉGLAGES, RENDUS EN PARAMÈTRES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑥ les réglages, traduits pour la route existante', () => {
  it('🔴 les défauts ne filtrent RIEN : la chaîne est vide', () => {
    expect(reglagesEnParametres(REGLAGES_DEFAUT)).toBe('');
    expect(reglagesActifs(REGLAGES_DEFAUT)).toBe(false);
  });

  it('🔴 les trois filtres de pièces passent par `pieces=`', () => {
    expect(reglagesEnParametres({ ...REGLAGES_DEFAUT, pieces: 'avec' })).toBe('?pieces=avec');
    expect(reglagesEnParametres({ ...REGLAGES_DEFAUT, pieces: 'sans' })).toBe('?pieces=sans');
    // « toutes » est le défaut : il ne s'écrit pas, sinon toute adresse porterait un paramètre inutile.
    expect(reglagesEnParametres({ ...REGLAGES_DEFAUT, pieces: 'toutes' })).toBe('');
  });

  it('🔴 une période écrit ses deux bornes', () => {
    expect(reglagesEnParametres({
      ...REGLAGES_DEFAUT, periode: { sorte: 'dates', du: '2026-02-01', au: '2026-03-21' },
    })).toBe('?du=2026-02-01&au=2026-03-21');
  });

  it('🔴 un événement choisi écrit la période qu’il a réglée, pas son identifiant', () => {
    const p = periodeDeLEvenement({ ouvertLe: '2026-02-03T07:15:00Z', closLe: null }, MAINTENANT);
    const r: Reglages = { ...REGLAGES_DEFAUT, periode: { sorte: 'evenement', evenementId: 42, du: p.du, au: p.au } };
    expect(reglagesEnParametres(r)).toBe('?du=2026-02-03&au=2026-10-04');
    expect(reglagesEnParametres(r)).not.toContain('42');
  });

  /** 🔴 « TOUS LES MAILS DU BIEN » IGNORE LES PARTIES SANS LES EFFACER (demande d'Arno). */
  it('🔴🔴 l’interrupteur « tous les mails » n’envoie aucun `avec`, mais garde les cases cochées', () => {
    const r: Reglages = { ...REGLAGES_DEFAUT, toutesLesParties: true, parties: ['a@fictif.test'] };
    expect(reglagesEnParametres(r)).toBe('');
    expect(reglagesEnFiltres(r).interlocuteurs).toEqual([]);
    // Les cases, elles, sont toujours là — on les retrouve en relevant l'interrupteur.
    expect(r.parties).toEqual(['a@fictif.test']);
    expect(reglagesEnFiltres({ ...r, toutesLesParties: false }).interlocuteurs).toEqual(['a@fictif.test']);
  });

  it('⚠️ les adresses cochées sont normalisées et dédoublonnées', () => {
    expect(reglagesEnFiltres({
      ...REGLAGES_DEFAUT, toutesLesParties: false, parties: [' A@Fictif.test ', 'a@fictif.test', ''],
    }).interlocuteurs).toEqual(['a@fictif.test']);
  });

  /**
   * 🔴🔴 « REGROUPER PAR CONVERSATION » N'EST **PAS** LE `grouper=1` DE LA ROUTE. Celui de la route regroupe par
   * CIBLE (l'historique d'un propriétaire, séparé par logement) : sur un bien il n'aurait rien regroupé, et il
   * aurait transformé le `DISTINCT ON (message_id)` en `DISTINCT` — un mail arrivant par deux axes aurait alors
   * été listé deux fois.
   */
  it('🔴🔴 « regrouper par conversation » ne part JAMAIS dans l’adresse', () => {
    const r: Reglages = { ...REGLAGES_DEFAUT, grouper: true };
    expect(reglagesEnParametres(r)).toBe('');
    expect(reglagesEnFiltres(r).grouper).toBe(false);
    expect(reglagesActifs(r)).toBe(true);
  });

  it('⚠️ une date abîmée est ÉCARTÉE, pas devinée', () => {
    expect(reglagesEnFiltres({
      ...REGLAGES_DEFAUT, periode: { sorte: 'dates', du: '03/07/2024', au: null },
    }).du).toBeNull();
  });

  it('⚠️ l’ordre n’est pas un paramètre de route : il ne part pas dans l’adresse', () => {
    expect(reglagesEnParametres({ ...REGLAGES_DEFAUT, ordre: 'ancien' })).toBe('');
  });

  it('la page se transporte, le défaut ne s’écrit pas', () => {
    expect(reglagesEnParametres(REGLAGES_DEFAUT, 2)).toBe('?page=2');
    expect(reglagesEnParametres(REGLAGES_DEFAUT, 0)).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ L'ORDRE DU FIL, ET SON INVERSION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑦ l’ordre du fil', () => {
  const LIGNES = [
    ligne({ messageId: 1, recuLe: '2026-02-01T09:00:00Z' }),
    ligne({ messageId: 2, recuLe: '2026-03-15T09:00:00Z' }),
    ligne({ messageId: 3, recuLe: '2026-01-10T09:00:00Z' }),
  ];

  it('🔴 le plus récent en haut est le DÉFAUT', () => {
    expect(REGLAGES_DEFAUT.ordre).toBe('recent');
    expect(trierFil(LIGNES, 'recent').map((l) => l.messageId)).toEqual([2, 1, 3]);
  });

  it('🔴 le bouton inverse, et il DIT l’ordre en cours (pas celui qu’il donnerait)', () => {
    expect(ordreFilSuivant('recent')).toBe('ancien');
    expect(ordreFilSuivant('ancien')).toBe('recent');
    expect(libelleOrdreFil('recent')).toBe('Plus récent en haut');
    expect(libelleOrdreFil('ancien')).toBe('Plus ancien en haut');
    expect(trierFil(LIGNES, 'ancien').map((l) => l.messageId)).toEqual([3, 1, 2]);
  });

  /** ⚠️ DEUX MAILS À LA MÊME SECONDE : l'identifiant tranche, sinon l'ordre changerait d'un affichage à l'autre. */
  it('⚠️ l’égalité à la seconde est tranchée par l’identifiant, jamais par le hasard', () => {
    const memeSeconde = [
      ligne({ messageId: 9, recuLe: '2026-02-01T09:00:00Z' }),
      ligne({ messageId: 4, recuLe: '2026-02-01T09:00:00Z' }),
    ];
    expect(trierFil(memeSeconde, 'recent').map((l) => l.messageId)).toEqual([9, 4]);
    expect(trierFil(memeSeconde, 'ancien').map((l) => l.messageId)).toEqual([4, 9]);
  });

  it('⚠️ une date illisible se comporte comme la plus ancienne, jamais comme « maintenant »', () => {
    const abime = [ligne({ messageId: 1, recuLe: 'pas une date' }), ligne({ messageId: 2 })];
    expect(trierFil(abime, 'recent').map((l) => l.messageId)).toEqual([2, 1]);
  });

  it('⚠️ elle ne modifie pas le tableau reçu', () => {
    const avant = LIGNES.map((l) => l.messageId);
    trierFil(LIGNES, 'ancien');
    expect(LIGNES.map((l) => l.messageId)).toEqual(avant);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑧ LE REGROUPEMENT PAR CONVERSATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑧ regrouper par conversation', () => {
  it('🔴 un groupe par échange, dans l’ordre d’apparition du fil', () => {
    const c = grouperParConversation([
      ligne({ messageId: 2, filId: 20, objet: 'Dégât des eaux' }),
      ligne({ messageId: 1, filId: 10, objet: 'Quittance' }),
      ligne({ messageId: 3, filId: 20, objet: 'Dégât des eaux — suite' }),
    ]);
    expect(c.map((x) => x.filId)).toEqual([20, 10]);
    expect(c[0].lignes.map((l) => l.messageId)).toEqual([2, 3]);
    expect(c[0].objet).toBe('Dégât des eaux');
  });

  it('⚠️ elle ne retrie rien : elle découpe le fil qu’on lui donne', () => {
    const fil = trierFil([
      ligne({ messageId: 1, filId: 10, recuLe: '2026-01-01T00:00:00Z' }),
      ligne({ messageId: 2, filId: 20, recuLe: '2026-05-01T00:00:00Z' }),
    ], 'ancien');
    expect(grouperParConversation(fil).map((x) => x.filId)).toEqual([10, 20]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑨ LES PIÈCES, PAR LE MODULE EXISTANT — ET « AUCUN RÉSULTAT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑨ les pièces du fil, et le mot quand il n’y a rien', () => {
  /** 🔴 `empreinte` VOYAGE : sans elle, deux documents de même nom et de même taille fondraient en un. */
  it('🔴 les lignes sont rendues au module des pièces, empreinte comprise', () => {
    const m = messagesDuFil([ligne({
      pieces: [{
        pieceId: 7, nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 1200,
        disponible: true, motifNonStocke: null, empreinte: 'sha-7',
      }],
    })]);
    expect(m[0].pieces[0].empreinte).toBe('sha-7');
  });

  it('⚠️ une pièce d’une réponse plus ancienne que ce lot (sans empreinte) passe en `null`, pas en `undefined`', () => {
    const m = messagesDuFil([ligne({
      pieces: [{
        pieceId: 8, nomFichier: 'x.pdf', typeMime: null, tailleOctets: null,
        disponible: false, motifNonStocke: 'non conservée',
      }],
    })]);
    expect(m[0].pieces[0].empreinte).toBeNull();
  });

  it('🔴 « aucun résultat » ACCUSE les réglages, jamais le bien', () => {
    expect(motAucunResultat(REGLAGES_DEFAUT)).toBe('Aucun mail rattaché à ce bien.');
    const filtre = motAucunResultat({ ...REGLAGES_DEFAUT, pieces: 'avec' });
    expect(filtre).toContain('ce sont les réglages qui cachent');
  });

  /** ⚠️ LE CAS « AUCUNE PARTIE COCHÉE » A SON PROPRE REMÈDE, et le mot le donne. */
  it('⚠️ aucune personne cochée ⇒ le mot dit quoi faire', () => {
    const mot = motAucunResultat({ ...REGLAGES_DEFAUT, toutesLesParties: false, parties: [] });
    expect(mot).toContain('Aucune personne n’est cochée');
    expect(mot).toContain('Tous les mails du bien pendant la période');
  });
});
