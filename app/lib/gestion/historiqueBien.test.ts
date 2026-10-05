import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  grouperParCategorie, grouperParConversation, jourParis, libelleOrdreFil, messagesDuFil, motAucunResultat,
  motDeuxCompteurs, motLocataireDeLaPeriode, ordreFilSuivant, periodeDeLEvenement, periodeDeLOccupation,
  reglagesActifs, REGLAGES_DEFAUT, reglagesEnFiltres, reglagesEnParametres, replierLesCartes,
  SEUIL_REPLI_CARTES, trierFil, type CategoriePartie, type Reglages,
  bornesDuChoix, ciblesDeplacement, compteCacheesEnBas, compteCacheesEnHaut, dernierLocataire,
  GROUPES_EN_BANDE, GROUPES_EN_ENCART, LEGENDE_BARRES, motAgenceEcartee, motCacheesEnBas, motCacheesEnHaut,
  decouperPourSurligner, etatRetourDepuisBrut, filtrerParMots, motCompteurRecherche, motDeplacement,
  MOTIF_NON_DEPLACABLE, motPeriodeEffective, motsRecherches, MS_SURLIGNE_RETOUR, normaliserRecherche,
  occupationOuverte, partieDeplacable,
  periodeDuDernierLocataire, SANS_LOCATAIRE_CONNU, SECONDES_ANNULER_DEPLACEMENT, tonDeLExpediteur, tonDuGroupe,
  clientConnuPour, completerAvecLesClients, motEncartVide,
  BUT_DU_PLUS, motPastille, pastilleDeCapsule, sorteDeCapsule,
  adresseACorriger, MOT_ADRESSE_A_CORRIGER, motifNonSelectionnable,
  type ClientDuBien, type CleGroupeParties, type OccupationPeriode, type PositionCapsule,
} from './historiqueBien';
import { INTERLOCUTEURS_MAX, type Interlocuteur, type LigneHistorique } from './historique';
/** 🔴 LA SOURCE DU SEUIL : on vérifie l'IDENTITÉ, pas une égalité de valeur recopiée. */
import {
  coteDeLaCategorie, replierLesCartes as replierPartie, SEUIL_REPLI_CARTES as SEUIL_PARTIE,
  sertALAutomatisation,
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

describe('② les parties — quatre groupes, l’agence écartée, le vocabulaire d’Arno', () => {
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — CE GROUPE A ÉTÉ RÉÉCRIT ; VOICI CE QU'IL DISAIT ET CE QUI A CHANGÉ ════════════
   *
   * ═══ CE QU'IL ATTENDAIT ══════════════════════════════════════════════════════════════════════════════════════
   * Que `grouperParCategorie` rende un TABLEAU de quatre groupes, titrés « Propriétaire · Locataire ·
   * Indépendant · À répartir », et que TOUS les interlocuteurs y tombent — notre agence comprise, qui portait
   * alors une pastille « nous » dans les listes.
   *
   * ═══ 🔴 CE QU'ARNO A TRANCHÉ LE 04/10/2026, ET QUI CHANGE DEUX CHOSES ═════════════════════════════════════════
   * ① LE VOCABULAIRE : « “Tiers indépendant” REMPLACE le libellé “Indépendant” partout », et le quatrième groupe
   *   devient « Non affectés ». Les CLÉS ne changent pas — `independant` et `a_repartir` sont écrites en base
   *   (640 lignes, migration 304) et dans la contrainte CHECK de la table ; renommer la clé aurait demandé une
   *   migration de données pour un mot d'écran.
   * ② L'AGENCE N'EST PLUS UNE PARTIE : « Notre agence n'est pas un groupe sélectionnable : ses mails
   *   apparaissent dès qu'ils font partie d'un échange avec une partie sélectionnée. » La fonction rend donc
   *   `{ groupes, nousEcartees }` — le nombre écarté, pour que l'écran le DISE au lieu de le taire.
   */
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

  it('🔴 quatre groupes, toujours, et dans le même ordre — avec le vocabulaire d’Arno', () => {
    const { groupes: g } = grouperParCategorie(liste, categories);
    expect(g.map((x) => x.cle)).toEqual(['proprietaire', 'locataire', 'independant', 'a_repartir']);
    expect(g.map((x) => x.titre)).toEqual(['Propriétaire', 'Locataire', 'Tiers indépendant', 'Non affectés']);
  });

  /** 🔴🔴 LES QUATRE TONS, ET CE SONT CEUX DE LA BARRE DES MAILS : la case cochée et le mail qui en vient
      portent la même couleur, sans qu'on ait à l'apprendre. */
  it('🔴🔴 chaque groupe porte son ton : rouge, vert, bleu, gris', () => {
    const { groupes: g } = grouperParCategorie(liste, categories);
    expect(g.map((x) => x.ton)).toEqual(['rouge', 'vert', 'bleu', 'gris']);
    expect(tonDuGroupe('proprietaire')).toBe('rouge');
    expect(tonDuGroupe('a_repartir')).toBe('gris');
  });

  it('🔴 chaque groupe porte son compte, et l’inconnu tombe dans « Non affectés »', () => {
    const { groupes: g } = grouperParCategorie(liste, categories);
    expect(g.map((x) => x.nb)).toEqual([1, 1, 1, 1]);
    expect(g[3].interlocuteurs.map((i) => i.adresse)).toEqual(['assureur@fictif.test']);
  });

  /**
   * 🔴🔴 NOTRE AGENCE EST ÉCARTÉE DES QUATRE GROUPES, ET COMPTÉE. Lui donner une case aurait proposé un filtre
   * sans sens — « les mails où nous sommes », c'est-à-dire presque tous — et l'aurait mise sur le même plan
   * qu'un propriétaire. La faire disparaître sans un mot aurait fait paraître le compte des groupes faux.
   */
  it('🔴🔴 l’agence n’est dans aucun groupe, et le nombre écarté est rendu', () => {
    const avecNous = [
      ...liste,
      inter({ adresse: 'gestion@criterimmo.fr', nbMails: 99, aEcrit: 99, enCopie: 0, interne: true }),
      inter({ adresse: 'service@criterimmo.fr', nbMails: 12, aEcrit: 12, enCopie: 0, interne: true }),
    ];
    const { groupes: g, nousEcartees } = grouperParCategorie(avecNous, categories);
    expect(nousEcartees).toBe(2);
    expect(g.map((x) => x.nb)).toEqual([1, 1, 1, 1]);
    const toutes = g.flatMap((x) => x.interlocuteurs.map((i) => i.adresse));
    expect(toutes).not.toContain('gestion@criterimmo.fr');
    expect(toutes).not.toContain('service@criterimmo.fr');
  });

  /** 🔴 ET LE MOT LE DIT, avec sa raison — sinon le compte paraîtrait faux sans qu'on sache pourquoi. */
  it('🔴 le mot de l’agence écartée dit aussi pourquoi ce n’est pas une perte', () => {
    expect(motAgenceEcartee(0)).toBeNull();
    expect(motAgenceEcartee(1)).toContain('Une adresse de notre agence n’est pas listée');
    const m = motAgenceEcartee(2) ?? '';
    expect(m).toContain('2 adresses');
    expect(m).toContain('dès qu’ils font partie d’un échange avec une partie sélectionnée');
  });

  /** 🔴 LES QUATRE SONT RENDUS MÊME VIDES : des cases qui se déplacent d'un bien à l'autre se cochent de travers. */
  it('🔴 aucune catégorie connue ⇒ les quatre groupes existent quand même, tout « Non affectés »', () => {
    const { groupes: g } = grouperParCategorie(liste, new Map());
    expect(g).toHaveLength(4);
    expect(g.map((x) => x.nb)).toEqual([0, 0, 0, 4]);
  });

  it('⚠️ la casse ne range personne « Non affectés » par erreur', () => {
    const { groupes: g } = grouperParCategorie([inter({ adresse: 'Proprio@Fictif.Test' })], categories);
    expect(g[0].nb).toBe(1);
    expect(g[3].nb).toBe(0);
  });

  /** ⚠️ L'ORDRE REÇU EST CONSERVÉ : la route rend du plus bavard au moins bavard, et c'est la seule vérité. */
  it('⚠️ l’ordre à l’intérieur d’un groupe est celui reçu, jamais retrié', () => {
    const { groupes: g } = grouperParCategorie([
      inter({ adresse: 'b@fictif.test', nbMails: 9 }),
      inter({ adresse: 'a@fictif.test', nbMails: 3 }),
    ], new Map());
    expect(g[3].interlocuteurs.map((i) => i.adresse)).toEqual(['b@fictif.test', 'a@fictif.test']);
  });

  /**
   * 🔴🔴 « MÊME CATÉGORIE, MÊMES RÈGLES » (Arno). Le mot change, la règle NON : un tiers indépendant ne sert
   * jamais à l'automatisation, et c'est toujours le même juge qui le dit.
   */
  it('🔴🔴 le nouveau libellé ne crée aucune nouvelle règle', () => {
    expect(sertALAutomatisation('independant')).toBe(false);
    expect(sertALAutomatisation('proprietaire')).toBe(true);
    expect(coteDeLaCategorie('independant')).toBeNull();
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑩ 🔴🔴 LOT HISTORIQUE-BIEN-2 — « VIE DU BIEN » EST SUPPRIMÉ : CE QU'IL SAVAIT FAIRE EST ICI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑩ 🔴🔴 la reprise de « Vie du bien » — recherche et événement ouvert', () => {
  /**
   * ACCORD D'ARNO (04/10/2026) : le bloc est supprimé, « tout ce qu'il faisait est repris dans le moteur, RIEN
   * n'est perdu ». Deux de ses cinq fonctions n'existaient pas dans les réglages : la recherche et le filtre
   * « Avec événement ouvert ». Ce groupe est ce qui empêche la promesse de rester une promesse.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LA RECHERCHE A CHANGÉ DE CÔTÉ ══════════════════════════════════════
   *
   * ═══ CE QUE CE CAS ATTENDAIT, ET POURQUOI C'ÉTAIT JUSTE ══════════════════════════════════════════════════════
   * Que `texte` parte au SERVEUR en `q=`, comme le faisait « Vie du bien » : la route cherchait alors dans
   * l'objet et le texte de TOUT le bien, et c'était exactement la reprise demandée au lot 2.
   *
   * ═══ 🔴 CE QU'ARNO A TRANCHÉ LE 05/10/2026 ═══════════════════════════════════════════════════════════════════
   * « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà affichée (période + parties +
   * options) : objet, texte, nom de l'expéditeur, nom des pièces. » Elle ne va donc plus CHERCHER de mails, elle
   * en RETIRE — et c'est ce qui permet d'ajouter l'expéditeur et le nom des pièces, deux champs que la route ne
   * sait pas interroger. `texte` reste donc VIDE dans les filtres envoyés.
   *
   * ⚠️ LA CONTREPARTIE EST RÉELLE, et elle est dite : la recherche ne porte plus que sur la PAGE affichée.
   */
  it('🔴🔴 la recherche ne part PLUS au serveur : elle filtre l’écran', () => {
    const r: Reglages = { ...REGLAGES_DEFAUT, texte: 'chaudière' };
    expect(reglagesEnFiltres(r).texte).toBe('');
    expect(reglagesEnParametres(r)).not.toContain('q=');
    /* …mais elle reste un réglage ACTIF, pour qu'on puisse la défaire. */
    expect(reglagesActifs(r)).toBe(true);
  });

  /**
   * 🔴 UNE RECHERCHE RÉDUITE À DES ESPACES EST UNE RECHERCHE VIDE. L'envoyer aurait produit `q=` dans l'adresse :
   * un réglage « actif » invisible, que « Tout remettre à plat » aurait semblé ne pas défaire.
   */
  it('🔴 des espaces seuls ne sont pas une recherche', () => {
    const r: Reglages = { ...REGLAGES_DEFAUT, texte: '   ' };
    expect(reglagesEnParametres(r)).not.toContain('q=');
    expect(reglagesActifs(r)).toBe(false);
  });

  it('🔴🔴 « Avec événement ouvert » part en `evt=ouvert` — le filtre du cartouche', () => {
    const r: Reglages = { ...REGLAGES_DEFAUT, evenementOuvert: true };
    expect(reglagesEnFiltres(r).evenementOuvert).toBe(true);
    expect(reglagesEnParametres(r)).toContain('evt=ouvert');
    expect(reglagesActifs(r)).toBe(true);
  });

  /** ⚠️ ÉTEINT, IL N'ÉCRIT RIEN : un paramètre toujours présent aurait rendu toute adresse « filtrée ». */
  it('🔴 éteint, il n’écrit rien', () => {
    expect(reglagesEnParametres(REGLAGES_DEFAUT)).not.toContain('evt=');
    expect(reglagesActifs(REGLAGES_DEFAUT)).toBe(false);
  });

  /**
   * 🔴 LES DEUX COMPTENT COMME RÉGLAGES ACTIFS, et c'est ce qui donne droit à « Tout remettre à plat ». Sans
   * cela, taper trois lettres puis ne rien trouver n'offrait aucun moyen de revenir en arrière.
   */
  it('🔴 une recherche seule rend les réglages « actifs »', () => {
    expect(reglagesActifs({ ...REGLAGES_DEFAUT, texte: 'fuite' })).toBe(true);
  });

  /**
   * 🔴🔴 « AUCUN RÉSULTAT » RÉPÈTE LE MOT CHERCHÉ. Sur un téléphone, le champ est souvent sorti de l'écran quand
   * on lit la réponse : sans le mot, « aucun résultat » se lit « ce bien n'a rien ».
   */
  it('🔴🔴 le mot « aucun résultat » répète ce qu’on a cherché, et accuse les réglages', () => {
    const mot = motAucunResultat({ ...REGLAGES_DEFAUT, texte: 'chaudière' });
    expect(mot).toContain('chaudière');
    expect(mot).toContain('ce sont les réglages qui cachent, pas le bien');
  });

  /** ⚠️ ET SANS RECHERCHE, LE MOT D'AVANT NE CHANGE PAS D'UN CARACTÈRE. */
  it('🔴 sans recherche, le mot d’avant est intact', () => {
    expect(motAucunResultat(REGLAGES_DEFAUT)).toBe('Aucun mail rattaché à ce bien.');
    expect(motAucunResultat({ ...REGLAGES_DEFAUT, pieces: 'avec' }))
      .toBe('Aucun mail ne correspond à ces réglages — ce sont les réglages qui cachent, pas le bien.');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑪ 🔴🔴 LOT HISTORIQUE-BIEN-2 — LES QUATRE CHOIX DE PÉRIODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑪ 🔴🔴 « Depuis l’entrée du dernier locataire », et la période écrite en clair', () => {
  const LE_4_OCTOBRE = new Date('2026-10-04T09:00:00Z');
  const o = (libelle: string, depuis: string | null, jusqua: string | null): OccupationPeriode =>
    ({ libelle, depuis, jusqua });

  /**
   * 🔴🔴 LE PRÉDICAT « BAIL OUVERT » EST LE MÊME QUE CELUI DE LA PHRASE DU HAUT. Il a été EXTRAIT, non recopié :
   * deux juges pour « y a-t-il quelqu'un dans le logement ? » auraient fini par se contredire — un bouton
   * proposant la période d'un parti pendant que la phrase annonce qu'il est en place.
   */
  it('🔴🔴 un bail sans sortie est ouvert ; une sortie ABÎMÉE ne l’ouvre pas', () => {
    expect(occupationOuverte(o('A', '2020-01-01', null), '2026-10-04')).toBe(true);
    expect(occupationOuverte(o('B', '2020-01-01', '2026-10-04'), '2026-10-04')).toBe(true); // borne INCLUSE
    expect(occupationOuverte(o('C', '2020-01-01', '2026-10-03'), '2026-10-04')).toBe(false);
    /* ⚠️ « 03/07/2024 » n'est pas une date ISO : renseignée mais illisible veut dire « il y a eu une sortie ». */
    expect(occupationOuverte(o('D', '2020-01-01', '03/07/2024'), '2026-10-04')).toBe(false);
  });

  /** 🔴 LE DERNIER LOCATAIRE, C'EST L'OCCUPANT S'IL Y EN A UN — pas son prédécesseur. */
  it('🔴🔴 sur un logement occupé, « le dernier » est celui qui est là', () => {
    const d = dernierLocataire([
      o('ANCIEN Paul', '2020-01-01', '2024-06-30'),
      o('EN PLACE Zoé', '2024-07-01', null),
    ], LE_4_OCTOBRE);
    expect(d?.libelle).toBe('EN PLACE Zoé');
    expect(periodeDuDernierLocataire([
      o('ANCIEN Paul', '2020-01-01', '2024-06-30'),
      o('EN PLACE Zoé', '2024-07-01', null),
    ], LE_4_OCTOBRE)).toEqual({ du: '2024-07-01', au: '2026-10-04' });
  });

  /**
   * 🔴🔴 SUR UN LOGEMENT VACANT, LA BORNE HAUTE EST SA SORTIE, PAS AUJOURD'HUI. Arno : « fin = sa sortie ou
   * aujourd'hui ». Ce qui s'est dit après son départ — la remise en location — n'appartient pas à son dossier.
   */
  it('🔴🔴 sur un logement vacant, la période s’arrête à la sortie', () => {
    const occ = [o('PARTI Marc', '2025-05-01', '2026-09-28'), o('ANCIEN Paul', '2020-01-01', '2024-06-30')];
    expect(dernierLocataire(occ, LE_4_OCTOBRE)?.libelle).toBe('PARTI Marc');
    expect(periodeDuDernierLocataire(occ, LE_4_OCTOBRE)).toEqual({ du: '2025-05-01', au: '2026-09-28' });
  });

  /**
   * 🔴🔴 AUCUN LOCATAIRE CONNU ⇒ `null`, ET C'EST CE `null` QUI GRISE LE BOUTON. Rendre une période vide aurait
   * donné un bouton cliquable qui ne filtre rien — pire qu'un bouton éteint, parce qu'on croit avoir filtré.
   */
  it('🔴🔴 aucun locataire connu : pas de période, et un motif écrit', () => {
    expect(dernierLocataire([], LE_4_OCTOBRE)).toBeNull();
    expect(periodeDuDernierLocataire([], LE_4_OCTOBRE)).toBeNull();
    expect(SANS_LOCATAIRE_CONNU).toContain('aucun locataire connu');
  });

  /** ⚠️ UNE ENTRÉE INCONNUE RESTE `null` : c'est l'erreur exacte qu'une maquette a commise (08/06/2025 deviné). */
  it('🔴 une entrée inconnue n’est pas devinée', () => {
    expect(periodeDuDernierLocataire([o('SANS DATE', null, null)], LE_4_OCTOBRE))
      .toEqual({ du: null, au: '2026-10-04' });
  });

  /** 🔴 LES BORNES DU CHOIX, LUES À UN SEUL ENDROIT — la phrase affichée et la requête disent la même chose. */
  it('🔴 les bornes du choix, pour les quatre sortes', () => {
    expect(bornesDuChoix({ sorte: 'tous' })).toEqual({ du: null, au: null });
    expect(bornesDuChoix({ sorte: 'dates', du: '2026-01-01', au: null })).toEqual({ du: '2026-01-01', au: null });
    expect(bornesDuChoix({ sorte: 'occupation', du: '2025-05-01', au: '2026-09-28' }))
      .toEqual({ du: '2025-05-01', au: '2026-09-28' });
    expect(bornesDuChoix({ sorte: 'evenement', evenementId: 7, du: '2026-02-03', au: '2026-10-04' }))
      .toEqual({ du: '2026-02-03', au: '2026-10-04' });
  });

  /**
   * 🔴🔴 LA PHRASE DIT LES QUATRE CAS, DEMI-BORNES COMPRISES. Une période ouverte d'un côté est fréquente (un
   * bail en cours, une entrée inconnue) : écrire « du … au … » avec un trou aurait produit « du au 04/10/2026 ».
   */
  it('🔴🔴 la période effective, écrite en clair, dans les quatre cas', () => {
    expect(motPeriodeEffective({ sorte: 'tous' })).toBe('tous les échanges, sans borne de date');
    expect(motPeriodeEffective({ sorte: 'dates', du: '2025-05-01', au: '2026-10-04' }))
      .toBe('du 01/05/2025 au 04/10/2026');
    expect(motPeriodeEffective({ sorte: 'dates', du: '2025-05-01', au: null })).toBe('depuis le 01/05/2025');
    expect(motPeriodeEffective({ sorte: 'dates', du: null, au: '2026-10-04' })).toBe('jusqu’au 04/10/2026');
  });

  /** ⚠️ UNE DATE ABÎMÉE N'EST PAS AFFICHÉE COMME UNE DATE : elle est écartée, jamais devinée. */
  it('🔴 une borne illisible ne s’affiche pas', () => {
    expect(motPeriodeEffective({ sorte: 'dates', du: '03/07/2024', au: null }))
      .toBe('tous les échanges, sans borne de date');
  });

  /** 🔴 ET LE CHOIX « occupation » PART BIEN DANS L'ADRESSE, comme les autres. */
  it('🔴 le choix « occupation » écrit ses deux bornes dans l’adresse', () => {
    const r: Reglages = {
      ...REGLAGES_DEFAUT, periode: { sorte: 'occupation', du: '2025-05-01', au: '2026-09-28' },
    };
    expect(reglagesEnFiltres(r).du).toBe('2025-05-01');
    expect(reglagesEnFiltres(r).au).toBe('2026-09-28');
    expect(reglagesActifs(r)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑫ 🔴🔴 LOT HISTORIQUE-BIEN-2 — LA BARRE DE COULEUR D'UN MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑫ 🔴🔴 la couleur de la barre, selon la catégorie de l’expéditeur', () => {
  /**
   * DEMANDE D'ARNO (04/10/2026) : « ROUGE = propriétaire ou contact du propriétaire ; VERT = locataire ou
   * contact du locataire ; BLEU = tiers indépendant ; AUCUNE couleur = nous (agence) ; gris pointillé = non
   * affecté. »
   */
  const CAT = new Map<string, CategoriePartie>([
    ['proprio@fictif.test', 'proprietaire'],
    ['contact-proprio@fictif.test', 'proprietaire'],
    ['locataire@fictif.test', 'locataire'],
    ['plombier@fictif.test', 'independant'],
  ]);

  it('🔴🔴 les quatre couleurs suivent la catégorie retenue', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'proprio@fictif.test' }, CAT)).toBe('rouge');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'locataire@fictif.test' }, CAT)).toBe('vert');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'plombier@fictif.test' }, CAT)).toBe('bleu');
  });

  /**
   * 🔴🔴 UN CONTACT DU PROPRIÉTAIRE PORTE LA COULEUR DU PROPRIÉTAIRE, et ce n'est pas un raccourci : la carte
   * des catégories range précisément ainsi (un contact rangé côté propriétaire A la catégorie `proprietaire`).
   * Une cinquième couleur pour les contacts aurait doublé la légende sans qu'Arno l'ait demandée.
   */
  it('🔴🔴 un contact du propriétaire est rouge, comme le propriétaire', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'contact-proprio@fictif.test' }, CAT)).toBe('rouge');
  });

  /**
   * 🔴🔴 « NOUS » SE LIT SUR LE SENS, PAS SUR UNE LISTE D'ADRESSES. `sens === 'envoye'` est déjà ce que la ligne
   * AFFICHE (« nous avons écrit ») : c'est la même vérité, et non un second juge qui divergerait au premier
   * collègue changeant d'adresse. Il attrape même un envoi depuis une adresse que la liste des interlocuteurs
   * de CE bien ne porte pas.
   */
  it('🔴🔴 un mail que NOUS avons écrit n’a aucune couleur, quelle que soit l’adresse', () => {
    expect(tonDeLExpediteur({ sens: 'envoye', de: 'gestion@criterimmo.fr' }, CAT)).toBe('nous');
    // …même si l'adresse est par ailleurs rangée : le SENS l'emporte, parce qu'il dit qui parle.
    expect(tonDeLExpediteur({ sens: 'envoye', de: 'proprio@fictif.test' }, CAT)).toBe('nous');
  });

  /**
   * 🔴🔴 UNE ADRESSE INCONNUE EST GRISE, PAS « NOUS ». C'est le cas le plus fréquent au départ (90 adresses non
   * affectées sur la base) : la confondre avec « aucune couleur » aurait fait passer un tiers inconnu pour un
   * collègue — exactement l'erreur de lecture qu'on veut éviter sur un dossier.
   */
  it('🔴🔴 une adresse inconnue est GRISE, jamais « nous »', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'inconnu@fictif.test' }, CAT)).toBe('gris');
    expect(tonDeLExpediteur({ sens: 'recu', de: '' }, CAT)).toBe('gris');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'inconnu@fictif.test' }, new Map())).toBe('gris');
  });

  /** ⚠️ LA CASSE NE CHANGE PAS LA COULEUR : « Proprio@Fictif.Test » est le même expéditeur. */
  it('⚠️ la casse ne change pas la couleur', () => {
    expect(tonDeLExpediteur({ sens: 'recu', de: 'Proprio@Fictif.Test' }, CAT)).toBe('rouge');
  });

  /**
   * 🔴 LA LÉGENDE COUVRE LES CINQ CAS, ET DANS L'ORDRE DES GROUPES. Une couleur sans légende n'est pas une
   * information : elle se devine. « nous » vient en dernier parce qu'il est l'absence de couleur — le dire après
   * les quatre autres évite de chercher une teinte qui n'existe pas.
   */
  it('🔴 la légende dit les cinq cas, « nous » en dernier', () => {
    expect(LEGENDE_BARRES.map((x) => x.ton)).toEqual(['rouge', 'vert', 'bleu', 'gris', 'nous']);
    expect(LEGENDE_BARRES.map((x) => x.mot)).toEqual([
      'propriétaire', 'locataire', 'tiers indépendant', 'non affecté', 'nous',
    ]);
    /* ⚠️ CHAQUE TON RENDU PAR LA RÈGLE A SON ENTRÉE DANS LA LÉGENDE : sans ce contrôle, un cinquième ton
       ajouté un jour se serait affiché sans jamais être expliqué. */
    const tons = new Set(LEGENDE_BARRES.map((x) => x.ton));
    for (const de of ['proprio@fictif.test', 'locataire@fictif.test', 'plombier@fictif.test', 'x@fictif.test']) {
      expect(tons.has(tonDeLExpediteur({ sens: 'recu', de }, CAT))).toBe(true);
    }
    expect(tons.has(tonDeLExpediteur({ sens: 'envoye', de: 'nous@fictif.test' }, CAT))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑬ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 1 — L'ENCART NE GRANDIT JAMAIS : IL DÉFILE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑬ 🔴🔴 ce qui est caché sous le bas de l’encart', () => {
  /** Six capsules de 44 px, séparées de 2 px : 0, 46, 92, 138, 184, 230. L'encart en montre trois (138 px). */
  const SIX: PositionCapsule[] = Array.from({ length: 6 }, (_, i) => ({ haut: i * 46, hauteur: 44 }));
  const HAUTEUR = 138;

  /**
   * DEMANDE D'ARNO (05/10/2026) : « Quand des contacts sont cachés sous le bas de l'encart, une petite puce
   * flottante en bas, centrée, “↓ 3 autres”, invite à défiler ; elle disparaît quand on est en bas. »
   */
  it('🔴🔴 en haut de la liste, trois capsules sont visibles et trois sont cachées', () => {
    expect(compteCacheesEnBas(SIX, 0, HAUTEUR)).toBe(3);
    expect(compteCacheesEnHaut(SIX, 0)).toBe(0);
    expect(motCacheesEnBas(3)).toBe('↓ 3 autres');
  });

  /** 🔴 ELLE DISPARAÎT QUAND ON EST EN BAS — c'est la condition d'Arno, mot pour mot. */
  it('🔴🔴 arrivé en bas, plus rien n’est caché dessous', () => {
    const basTotal = 6 * 46 - 2; // la dernière capsule finit à 274
    expect(compteCacheesEnBas(SIX, basTotal - HAUTEUR, HAUTEUR)).toBe(0);
    expect(motCacheesEnBas(0)).toBeNull();
  });

  /** 🔴 ET LA PUCE DU HAUT APPARAÎT DÈS QU'ON A DÉFILÉ. */
  it('🔴 une fois défilé, le haut en cache à son tour', () => {
    expect(compteCacheesEnHaut(SIX, 92)).toBe(2);
    expect(motCacheesEnHaut(2)).toBe('↑ remonter');
    expect(motCacheesEnHaut(0)).toBeNull();
  });

  /**
   * 🔴🔴 « CACHÉE » VEUT DIRE « PAS ENTIÈREMENT VISIBLE ». Une capsule dont on voit trois pixels n'est pas
   * lisible : l'annoncer visible aurait fait dire « ↓ 2 autres » là où il en reste trois à lire, et une puce dont
   * le compte est faux cesse d'être crue.
   */
  it('🔴🔴 une capsule à moitié visible compte comme cachée', () => {
    // On descend de 20 px : la 4e capsule (haut 138, bas 182) dépasse encore le bas de l'encart (158).
    expect(compteCacheesEnBas(SIX, 20, HAUTEUR)).toBe(3);
  });

  /**
   * ⚠️ LA TOLÉRANCE D'UN PIXEL N'EST PAS DE LA COQUETTERIE : sur un écran à 2×, les hauteurs rendues sont
   * fractionnaires. Sans elle, la dernière capsule serait comptée « cachée » alors qu'elle touche exactement le
   * bas — et la puce ne disparaîtrait jamais.
   */
  it('⚠️ un demi-pixel de débordement ne fait pas apparaître la puce', () => {
    const presque: PositionCapsule[] = [{ haut: 0, hauteur: 44 }, { haut: 46, hauteur: 92.5 }];
    expect(compteCacheesEnBas(presque, 0, HAUTEUR)).toBe(0);
  });

  /** ⚠️ UNE LISTE QUI TIENT ENTIÈREMENT N'AFFICHE AUCUNE PUCE : rien à inviter. */
  it('⚠️ une liste courte n’a aucune puce', () => {
    const deux: PositionCapsule[] = [{ haut: 0, hauteur: 44 }, { haut: 46, hauteur: 44 }];
    expect(compteCacheesEnBas(deux, 0, HAUTEUR)).toBe(0);
    expect(compteCacheesEnHaut(deux, 0)).toBe(0);
  });

  /** ⚠️ LE SINGULIER EST ÉCRIT : « ↓ 1 autre », pas « 1 autres ». */
  it('⚠️ le singulier et le pluriel', () => {
    expect(motCacheesEnBas(1)).toBe('↓ 1 autre');
    expect(motCacheesEnBas(12)).toBe('↓ 12 autres');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑭ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — QUI SE DÉPLACE, ET VERS OÙ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑭ 🔴🔴 le glisser-déposer : les contacts oui, les clients non', () => {
  /** La carte de la FICHE : ses propriétaires et ses occupants. Ce sont eux, les clients. */
  const FICHE = new Map<string, CategoriePartie>([
    ['proprio@fictif.test', 'proprietaire'],
    ['locataire@fictif.test', 'locataire'],
  ]);

  /**
   * DEMANDE D'ARNO (05/10/2026) : « Les capsules des CLIENTS eux-mêmes (propriétaire(s), locataire en place,
   * anciens locataires) et celles de l'agence ne se déplacent pas : curseur “interdit” et info-bulle “Client du
   * bien — non déplaçable”. »
   *
   * 🔴 ET DÉPLACER UN CLIENT N'AURAIT MÊME PAS TENU : la fusion le remettrait dans son groupe au rendu suivant,
   * puisque la fiche l'emporte sur tout rangement de base. L'interdiction n'est pas une précaution d'ergonomie,
   * c'est la vérité de l'arbitrage — et c'est pourquoi l'info-bulle dit POURQUOI, et pas seulement « non ».
   */
  it('🔴🔴 un client de la fiche ne se déplace pas', () => {
    expect(partieDeplacable('proprio@fictif.test', FICHE)).toBe(false);
    expect(partieDeplacable('locataire@fictif.test', FICHE)).toBe(false);
    expect(MOTIF_NON_DEPLACABLE).toBe('Client du bien — non déplaçable');
  });

  it('🔴🔴 un contact, un tiers, une adresse inconnue : tous déplaçables', () => {
    expect(partieDeplacable('assureur@fictif.test', FICHE)).toBe(true);
    expect(partieDeplacable('plombier@fictif.test', FICHE)).toBe(true);
    expect(partieDeplacable('inconnu@fictif.test', new Map())).toBe(true);
  });

  /** ⚠️ LA CASSE NE REND PERSONNE DÉPLAÇABLE PAR ERREUR : « Proprio@… » est le même client. */
  it('⚠️ la casse ne rend pas un client déplaçable', () => {
    expect(partieDeplacable('Proprio@Fictif.Test', FICHE)).toBe(false);
  });

  /**
   * ⚠️ L'AGENCE N'EST PAS LISTÉE DU TOUT depuis le lot 2 : aucune capsule ne la porte. La règle est écrite quand
   * même — le jour où Arno voudrait revoir ces adresses dans les listes, l'interdiction est déjà là.
   */
  it('⚠️ une adresse interne ne se déplace pas non plus', () => {
    expect(partieDeplacable('gestion@criterimmo.fr', new Map(), true)).toBe(false);
  });

  /**
   * 🔴🔴 LE MENU CLAVIER OFFRE LES TROIS AUTRES, JAMAIS CELLE D'ORIGINE. Proposer « déplacer vers là où tu es
   * déjà » est un piège à clic — et le dépôt sur place aurait écrit un rangement manuel identique à celui qui
   * existait, donc gelé une proposition sans que personne ne l'ait voulu.
   */
  it('🔴🔴 « Déplacer vers… » écarte la catégorie d’origine', () => {
    expect(ciblesDeplacement('proprietaire').map((c) => c.cle)).toEqual(['locataire', 'independant', 'a_repartir']);
    expect(ciblesDeplacement('a_repartir').map((c) => c.cle)).toEqual(['proprietaire', 'locataire', 'independant']);
    /* …et les titres sont ceux d'Arno, pris au même endroit que les groupes. */
    expect(ciblesDeplacement('proprietaire').map((c) => c.titre))
      .toEqual(['Locataire', 'Tiers indépendant', 'Non affectés']);
  });

  /** 🔴 LES QUATRE CATÉGORIES SONT ATTEIGNABLES : deux encarts, deux bandes, et rien d'oublié. */
  it('🔴 deux encarts et deux bandes couvrent les quatre groupes', () => {
    expect([...GROUPES_EN_ENCART, ...GROUPES_EN_BANDE])
      .toEqual(['proprietaire', 'locataire', 'independant', 'a_repartir']);
  });

  /**
   * 🔴 LE MESSAGE DIT LE NOM **ET** LA DESTINATION : c'est la seule phrase qui permette de vérifier qu'on n'a
   * pas lâché la capsule une rangée trop bas.
   */
  it('🔴🔴 le message d’après-dépôt, mot pour mot', () => {
    expect(motDeplacement('Fanny Rosky', 'Locataire')).toBe('Fanny Rosky → Locataire');
    /* ⚠️ HUIT SECONDES : le temps de lire, de comprendre qu'on s'est trompé, et de viser. Même convention que
       le lot INTERNE-ANNULER, pour que « quelques secondes » veuille dire la même chose partout. */
    expect(SECONDES_ANNULER_DEPLACEMENT).toBe(8);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑮ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — RELIRE UN ÉTAT DE RETOUR, EN SE MÉFIANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑮ 🔴🔴 l’état de retour, relu et vérifié', () => {
  const COMPLET = {
    fiche: '155',
    reglages: {
      periode: { sorte: 'dates', du: '2025-05-01', au: '2026-09-28' },
      parties: ['a@fictif.test', 'b@fictif.test'],
      toutesLesParties: false,
      pieces: 'avec',
      ordre: 'ancien',
      grouper: true,
      texte: 'chaudière',
      evenementOuvert: true,
    },
    defile: 1240,
    mail: 77,
    page: 2,
  };

  /**
   * DEMANDE D'ARNO (05/10/2026) : le retour ramène « même fiche, même période, mêmes parties cochées, mêmes
   * options, même texte de recherche, même position de défilement, et le mail d'où l'on est parti surligné ».
   * Les huit champs sont donc relus, un par un.
   */
  it('🔴🔴 un état complet revient entier', () => {
    const e = etatRetourDepuisBrut(COMPLET);
    expect(e).not.toBeNull();
    expect(e?.fiche).toBe('155');
    expect(e?.reglages.periode).toEqual({ sorte: 'dates', du: '2025-05-01', au: '2026-09-28' });
    expect(e?.reglages.parties).toEqual(['a@fictif.test', 'b@fictif.test']);
    expect(e?.reglages.toutesLesParties).toBe(false);
    expect(e?.reglages.pieces).toBe('avec');
    expect(e?.reglages.ordre).toBe('ancien');
    expect(e?.reglages.grouper).toBe(true);
    expect(e?.reglages.texte).toBe('chaudière');
    expect(e?.reglages.evenementOuvert).toBe(true);
    expect(e?.defile).toBe(1240);
    expect(e?.mail).toBe(77);
    expect(e?.page).toBe(2);
  });

  /**
   * 🔴🔴 UN SEUL CHAMP ESSENTIEL ABÎMÉ FAIT RENDRE `null`. Appliquer un état à moitié lu donnerait un écran qui
   * ne ressemble ni à celui qu'on a quitté ni au défaut — le pire des trois.
   */
  it('🔴🔴 sans fiche, sans réglages, ou avec une période inconnue : null', () => {
    expect(etatRetourDepuisBrut(null)).toBeNull();
    expect(etatRetourDepuisBrut('pas un objet')).toBeNull();
    expect(etatRetourDepuisBrut({ ...COMPLET, fiche: '' })).toBeNull();
    expect(etatRetourDepuisBrut({ ...COMPLET, reglages: undefined })).toBeNull();
    expect(etatRetourDepuisBrut({ ...COMPLET, reglages: { ...COMPLET.reglages, periode: { sorte: 'lune' } } }))
      .toBeNull();
  });

  /**
   * ⚠️ LES CHAMPS ACCESSOIRES, EUX, RETOMBENT SUR LE DÉFAUT plutôt que de tout jeter : une option illisible ne
   * justifie pas de perdre la période et les parties cochées, qui sont le travail de la personne.
   */
  it('⚠️ une option illisible retombe sur son défaut, sans tout jeter', () => {
    const e = etatRetourDepuisBrut({
      ...COMPLET,
      reglages: { ...COMPLET.reglages, pieces: 'bleu', ordre: 'zigzag', texte: 42, parties: 'pas un tableau' },
      defile: -5, mail: 0, page: 1.7,
    });
    expect(e).not.toBeNull();
    expect(e?.reglages.pieces).toBe('toutes');
    expect(e?.reglages.ordre).toBe('recent');
    expect(e?.reglages.texte).toBe('');
    expect(e?.reglages.parties).toEqual([]);
    expect(e?.defile).toBe(0);
    expect(e?.mail).toBeNull();
    expect(e?.page).toBe(1);
  });

  /** ⚠️ UNE DATE ABÎMÉE EST ÉCARTÉE, PAS DEVINÉE — même règle que partout dans ce module. */
  it('⚠️ une borne illisible devient null', () => {
    const e = etatRetourDepuisBrut({
      ...COMPLET, reglages: { ...COMPLET.reglages, periode: { sorte: 'dates', du: '03/07/2024', au: null } },
    });
    expect(e?.reglages.periode).toEqual({ sorte: 'dates', du: null, au: null });
  });

  /** ⚠️ LES PARTIES SONT BORNÉES : le bien le plus fourni en compte 76 ; 200 ferme la porte à un stockage abîmé. */
  it('⚠️ les parties cochées sont bornées à 200', () => {
    const e = etatRetourDepuisBrut({
      ...COMPLET,
      reglages: { ...COMPLET.reglages, parties: Array.from({ length: 500 }, (_, i) => `p${i}@fictif.test`) },
    });
    expect(e?.reglages.parties).toHaveLength(200);
  });

  /** ⚠️ « BRIÈVEMENT » : la durée d'un regard, pas d'une sélection. */
  it('⚠️ le surlignage du retour dure deux secondes et demie', () => {
    expect(MS_SURLIGNE_RETOUR).toBe(2500);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑯ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LA RECHERCHE DANS LA SÉLECTION AFFICHÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑯ 🔴🔴 la recherche par mots-clés', () => {
  const m = (o: Partial<LigneHistorique>): LigneHistorique => ligne(o);
  const LISTE: LigneHistorique[] = [
    m({
      messageId: 1, objet: 'Fuite d’eau à la cuisine', extrait: 'Bonjour, le robinet goutte.',
      de: 'locataire@fictif.test', deNom: 'Irène PALYNSKA',
    }),
    m({
      messageId: 2, objet: 'Quittance de février', extrait: 'Veuillez trouver la quittance.',
      de: 'gestion@criterimmo.fr', deNom: 'Gestion CRITERIMMO',
      pieces: [{
        pieceId: 9, nomFichier: 'quittance-fevrier.pdf', typeMime: 'application/pdf',
        tailleOctets: 1000, disponible: true, motifNonStocke: null, empreinte: null,
      }],
    }),
    m({ messageId: 3, objet: 'Chaudière — devis', extrait: 'Le devis est joint.', de: 'plombier@fictif.test', deNom: null }),
  ];

  /**
   * DEMANDE D'ARNO (05/10/2026) : « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà affichée
   * (période + parties + options) : objet, texte, nom de l'expéditeur, nom des pièces. Plusieurs mots = tous
   * présents ; accents et majuscules ignorés. »
   */
  it('🔴🔴 elle cherche dans l’objet, le texte, l’expéditeur ET le nom des pièces', () => {
    expect(filtrerParMots(LISTE, 'cuisine').map((l) => l.messageId)).toEqual([1]);      // l'objet
    expect(filtrerParMots(LISTE, 'robinet').map((l) => l.messageId)).toEqual([1]);      // le texte
    expect(filtrerParMots(LISTE, 'palynska').map((l) => l.messageId)).toEqual([1]);     // le nom de l'expéditeur
    expect(filtrerParMots(LISTE, 'criterimmo').map((l) => l.messageId)).toEqual([2]);   // l'adresse
    expect(filtrerParMots(LISTE, 'fevrier.pdf').map((l) => l.messageId)).toEqual([2]);  // le nom de la pièce
  });

  /**
   * 🔴🔴 « TOUS PRÉSENTS », ET NON « AU MOINS UN ». C'est ce qui rend la recherche utile sur un bien bavard :
   * « fuite cuisine » doit rendre les mails qui parlent des deux, pas la somme des deux listes.
   */
  it('🔴🔴 plusieurs mots : TOUS doivent être présents', () => {
    expect(filtrerParMots(LISTE, 'fuite cuisine').map((l) => l.messageId)).toEqual([1]);
    expect(filtrerParMots(LISTE, 'fuite quittance')).toHaveLength(0);
  });

  /** ⚠️ UN MOT PEUT ÊTRE DANS UN CHAMP ET L'AUTRE DANS UN AUTRE : exiger le même champ aurait écarté le cas
      le plus fréquent (« palynska robinet » = cette personne, à propos de cela). */
  it('⚠️ les mots peuvent venir de champs différents', () => {
    expect(filtrerParMots(LISTE, 'palynska robinet').map((l) => l.messageId)).toEqual([1]);
  });

  /**
   * 🔴🔴 ACCENTS ET MAJUSCULES IGNORÉS (demande d'Arno). La décomposition Unicode, et non une table écrite à la
   * main : une table oublie toujours un caractère — le « ÿ », le « œ », les accents d'Europe centrale qu'on
   * croise dans un immeuble.
   */
  it('🔴🔴 « CHAUDIERE », « chaudière » et « Chaudiere » trouvent la même chose', () => {
    for (const q of ['CHAUDIERE', 'chaudière', 'Chaudiere', 'chaudiere']) {
      expect(filtrerParMots(LISTE, q).map((l) => l.messageId)).toEqual([3]);
    }
    expect(normaliserRecherche('Irène ÉLÈVE Œuf ÿ')).toBe('irene eleve œuf y');
  });

  /** ⚠️ UNE RECHERCHE VIDE NE FILTRE RIEN — et des espaces seuls sont une recherche vide. */
  it('⚠️ rien à chercher ⇒ rien n’est retiré', () => {
    expect(filtrerParMots(LISTE, '')).toHaveLength(3);
    expect(filtrerParMots(LISTE, '   ')).toHaveLength(3);
    expect(motsRecherches('  ')).toEqual([]);
  });

  /** ⚠️ LES MOTS SONT DÉDOUBLONNÉS ET BORNÉS : au-delà de huit, ce n'est plus une recherche. */
  it('⚠️ les mots sont dédoublonnés et bornés à huit', () => {
    expect(motsRecherches('fuite fuite CUISINE')).toEqual(['fuite', 'cuisine']);
    expect(motsRecherches('a b c d e f g h i j')).toHaveLength(8);
  });

  /** 🔴 « N MAILS SUR M », et rien quand on ne cherche pas. */
  it('🔴🔴 le compteur dit N sur M, et se tait sans recherche', () => {
    expect(motCompteurRecherche(3, 25, true)).toBe('3 mails sur 25');
    expect(motCompteurRecherche(1, 25, true)).toBe('1 mail sur 25');
    expect(motCompteurRecherche(25, 25, false)).toBeNull();
  });

  /**
   * ══ 🔴🔴 LE SURLIGNAGE REND DES MORCEAUX, PAS DU HTML ════════════════════════════════════════════════════════
   *
   * Rendre une chaîne balisée aurait obligé l'écran à l'injecter sans échappement — c'est-à-dire à faire
   * confiance au corps d'un courrier que n'importe qui envoie. Les morceaux, eux, sont posés par React.
   */
  it('🔴🔴 le découpage marque les mots trouvés, et laisse le reste intact', () => {
    expect(decouperPourSurligner('Le robinet goutte', ['robinet'])).toEqual([
      { texte: 'Le ', trouve: false },
      { texte: 'robinet', trouve: true },
      { texte: ' goutte', trouve: false },
    ]);
  });

  /** 🔴 LE TEXTE RENDU GARDE SES ACCENTS, même si la recherche les ignore. */
  it('🔴🔴 on cherche sans accent, on rend le texte d’origine', () => {
    expect(decouperPourSurligner('La chaudière fuit', ['chaudiere'])).toEqual([
      { texte: 'La ', trouve: false },
      { texte: 'chaudière', trouve: true },
      { texte: ' fuit', trouve: false },
    ]);
  });

  /** ⚠️ DEUX MOTS QUI SE CHEVAUCHENT NE FONT QU'UNE MARQUE : sinon on aurait deux balises imbriquées. */
  it('⚠️ les intervalles qui se chevauchent sont fusionnés', () => {
    expect(decouperPourSurligner('abcdef', ['abc', 'bcd'])).toEqual([
      { texte: 'abcd', trouve: true },
      { texte: 'ef', trouve: false },
    ]);
  });

  /** ⚠️ TOUTES LES OCCURRENCES SONT MARQUÉES, pas seulement la première. */
  it('⚠️ toutes les occurrences sont marquées', () => {
    expect(decouperPourSurligner('fuite puis fuite', ['fuite'])
      .filter((x) => x.trouve)).toHaveLength(2);
  });

  /** ⚠️ RIEN À MARQUER ⇒ UN SEUL MORCEAU, et le texte est rendu tel quel. */
  it('⚠️ sans mot trouvé, le texte est rendu d’un bloc', () => {
    expect(decouperPourSurligner('Le robinet goutte', ['chaudiere']))
      .toEqual([{ texte: 'Le robinet goutte', trouve: false }]);
    expect(decouperPourSurligner('', ['x'])).toEqual([{ texte: '', trouve: false }]);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LE CLIENT DU BIEN A SA CAPSULE, MÊME MUET ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (fiche lot-299, le foyer COLSON FARDEAU) : « l'encart Propriétaire a disparu et l'encart
 * Locataire prend toute la largeur. »
 *
 * LA CAUSE, MESURÉE EN BASE : les groupes se construisent sur les MAILS, pas sur la fiche. Le propriétaire de
 * lot-299 (WIPPIMMO 432) n'a qu'une adresse `@sansvisavis.com` — `interne = true` en base, donc écartée par la
 * règle du lot 2 — et ses trois autres propriétaires liés n'ont que des adresses de test absentes des mails. Le
 * groupe était donc vide, l'écran ne le peignait pas (`g.nb === 0` ⇒ `null`), et `auto-fit` laissait le
 * survivant prendre la ligne entière.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('completerAvecLesClients — un client muet a quand même sa capsule', () => {
  const ecrit = (adresse: string, n: number): Interlocuteur => ({
    adresse, nom: null, nbMails: n, aEcrit: n, enCopie: 0, interne: false,
  });

  it('🔴 ajoute le propriétaire absent des mails, compteurs à ZÉRO', () => {
    const clients: ClientDuBien[] = [{ adresse: 'proprio@exemple.test', nom: 'M. ROI Nathan', categorie: 'proprietaire' }];
    const out = completerAvecLesClients([ecrit('syndic@exemple.test', 12)], clients);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      adresse: 'proprio@exemple.test', nom: 'M. ROI Nathan', nbMails: 0, aEcrit: 0, enCopie: 0, interne: false,
    });
  });

  it('🔴 LE ZÉRO EST UN FAIT, et il traverse le rangement : le groupe « Propriétaire » n’est plus vide', () => {
    const clients: ClientDuBien[] = [{ adresse: 'proprio@exemple.test', nom: 'M. ROI', categorie: 'proprietaire' }];
    const complets = completerAvecLesClients([ecrit('syndic@exemple.test', 12)], clients);
    const categories = new Map<string, CategoriePartie>([['proprio@exemple.test', 'proprietaire']]);
    const { groupes } = grouperParCategorie(complets, categories);
    const prop = groupes.find((g) => g.cle === 'proprietaire');
    expect(prop?.nb).toBe(1);
    expect(prop?.interlocuteurs[0].aEcrit).toBe(0);
    // Et le syndic reste « non affecté » : compléter ne range personne de travers.
    expect(groupes.find((g) => g.cle === 'a_repartir')?.nb).toBe(1);
  });

  it('⚠️ N’ÉCRASE JAMAIS UN INTERLOCUTEUR EXISTANT : le client bavard garde ses vrais compteurs', () => {
    const clients: ClientDuBien[] = [{ adresse: 'Proprio@Exemple.test', nom: 'M. ROI', categorie: 'proprietaire' }];
    const out = completerAvecLesClients([ecrit('proprio@exemple.test', 40)], clients);
    expect(out).toHaveLength(1);
    expect(out[0].aEcrit).toBe(40);
  });

  it('⚠️ LA COMPARAISON EST INSENSIBLE À LA CASSE ET AUX ESPACES', () => {
    const clients: ClientDuBien[] = [{ adresse: '  PROPRIO@exemple.test ', nom: null, categorie: 'proprietaire' }];
    expect(completerAvecLesClients([ecrit('proprio@exemple.test', 1)], clients)).toHaveLength(1);
  });

  it('⚠️ UN CLIENT SANS ADRESSE N’AJOUTE AUCUNE CAPSULE', () => {
    const clients: ClientDuBien[] = [{ adresse: null, nom: 'COLSON FARDEAU', categorie: 'locataire' }];
    expect(completerAvecLesClients([], clients)).toEqual([]);
  });

  it('⚠️ DEUX CLIENTS À LA MÊME ADRESSE NE DONNENT QU’UNE CAPSULE', () => {
    const clients: ClientDuBien[] = [
      { adresse: 'foyer@exemple.test', nom: 'Lui', categorie: 'proprietaire' },
      { adresse: 'foyer@exemple.test', nom: 'Elle', categorie: 'locataire' },
    ];
    const out = completerAvecLesClients([], clients);
    expect(out).toHaveLength(1);
    expect(out[0].nom).toBe('Lui');
  });

  it('⚠️ L’ORDRE EST STABLE : les reçus d’abord, les ajoutés ensuite', () => {
    const clients: ClientDuBien[] = [{ adresse: 'muet@exemple.test', nom: null, categorie: 'proprietaire' }];
    const out = completerAvecLesClients([ecrit('b@exemple.test', 9), ecrit('a@exemple.test', 2)], clients);
    expect(out.map((i) => i.adresse)).toEqual(['b@exemple.test', 'a@exemple.test', 'muet@exemple.test']);
  });

  it('sans client, la liste revient telle quelle', () => {
    const recus = [ecrit('a@exemple.test', 1)];
    expect(completerAvecLesClients(recus, [])).toEqual(recus);
  });
});

describe('motEncartVide — les deux phrases d’Arno, et leurs deux symétriques', () => {
  it('🔴 LES DEUX PHRASES ÉCRITES PAR ARNO, chacune dans son cas', () => {
    expect(motEncartVide('proprietaire', true)).toBe('Aucun échange avec le propriétaire sur cette période.');
    expect(motEncartVide('locataire', false)).toBe('Aucun locataire connu.');
  });

  it('⚠️ ET LES DEUX AUTRES CAS SONT DITS AUSSI : aucun encart ne reste muet', () => {
    expect(motEncartVide('locataire', true)).toBe('Aucun échange avec le locataire sur cette période.');
    expect(motEncartVide('proprietaire', false)).toBe('Aucun propriétaire connu pour ce bien.');
  });

  it('🔴 « CONNU » PARLE DE L’ANNUAIRE, PAS DES MAILS : un client sans adresse compte', () => {
    const sansAdresse: ClientDuBien[] = [{ adresse: null, nom: 'COLSON FARDEAU', categorie: 'locataire' }];
    expect(clientConnuPour('locataire', sansAdresse)).toBe(true);
    expect(clientConnuPour('proprietaire', sansAdresse)).toBe(false);
    expect(motEncartVide('locataire', clientConnuPour('locataire', sansAdresse)))
      .toContain('Aucun échange avec le locataire');
  });

  it('⚠️ LES BANDES N’ONT PAS DE CLIENT : « Tiers indépendant » et « Non affectés » n’accueillent que des contacts', () => {
    const clients: ClientDuBien[] = [{ adresse: 'x@exemple.test', nom: null, categorie: 'proprietaire' }];
    expect(clientConnuPour('independant', clients)).toBe(false);
    expect(clientConnuPour('a_repartir', clients)).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — CE QU'EST UNE CAPSULE, ET CE QU'ELLE PORTE À DROITE ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * TROISIÈME DEMANDE D'ARNO POUR LE MÊME BOUTON. Sa règle, recopiée parce que c'est elle qui est éprouvée ici :
 *
 *   « Une capsule est CLIENT si son adresse appartient au propriétaire ou à un locataire (actuel ou ancien) tel
 *     qu'enregistré dans la fiche du bien ou dans l'annuaire. Une capsule est AGENCE si l'adresse est la nôtre.
 *     TOUTES LES AUTRES sont des CONTACTS […] Pas de “+” sur les capsules CLIENT, AGENCE ni TIERS INDÉPENDANT. »
 *
 * POURQUOI LE « + » MANQUAIT, mesuré sur lot-299 :
 *   ① une carte qui EXISTE faisait disparaître le bouton SANS RIEN METTRE À LA PLACE. `estebanfrdpro@gmail.com`
 *      porte la carte 1462 (côté locataire, vérifiée, non retirée) : sa capsule n'avait que son « … » ;
 *   ② « Non affectés » n'avait PAS DE « + » DU TOUT, parce que la condition d'alors (`coteDeLaCategorie !== null`)
 *      écarte `independant` ET `a_repartir` du même geste. `puroflowparis@gmail.com` était dans ce cas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sorteDeCapsule — client, agence, tiers ou contact', () => {
  const FICHE = new Map<string, CategoriePartie>([
    ['proprio@fictif.test', 'proprietaire'],
    ['locataire@fictif.test', 'locataire'],
    ['ancien@fictif.test', 'locataire'],
  ]);

  it('🔴 CLIENT : le propriétaire et les locataires de la fiche, actuels comme anciens', () => {
    expect(sorteDeCapsule('proprio@fictif.test', 'proprietaire', FICHE, false)).toBe('client');
    expect(sorteDeCapsule('locataire@fictif.test', 'locataire', FICHE, false)).toBe('client');
    expect(sorteDeCapsule('ancien@fictif.test', 'locataire', FICHE, false)).toBe('client');
  });

  it('🔴 AGENCE : une de nos adresses, et elle l’est même si la fiche la porte comme cliente', () => {
    expect(sorteDeCapsule('gestion@criterimmo.fr', 'a_repartir', FICHE, true)).toBe('agence');
    /* 🔴 LE CAS DE lot-299 : son propriétaire client a une adresse @sansvisavis.com. « Agence » l'emporte pour
       le FILTRAGE — voir le point 2, qui lui rend sa capsule sans la rendre sélectionnable. */
    expect(sorteDeCapsule('proprio@fictif.test', 'proprietaire', FICHE, true)).toBe('agence');
  });

  it('🔴 TIERS INDÉPENDANT : un rangement délibéré, qu’on ne transforme pas en contact', () => {
    expect(sorteDeCapsule('plombier@fictif.test', 'independant', FICHE, false)).toBe('tiers');
  });

  it('🔴 CONTACT : tout le reste, dans les TROIS groupes qui en portent', () => {
    for (const g of ['proprietaire', 'locataire', 'a_repartir'] as const) {
      expect(sorteDeCapsule('assureur@fictif.test', g, FICHE, false)).toBe('contact');
    }
  });

  it('⚠️ LA COMPARAISON EST INSENSIBLE À LA CASSE ET AUX ESPACES', () => {
    expect(sorteDeCapsule('  PROPRIO@Fictif.test ', 'proprietaire', FICHE, false)).toBe('client');
  });

  /**
   * 🔴🔴 UNE SEULE DÉFINITION DE « CLIENT » DANS TOUT LE MODULE. `partieDeplacable` passe désormais par
   * `sorteDeCapsule` : ce cas prouve que le verdict n'a pas bougé d'un booléen, sur les quatre sortes.
   */
  it('🔴🔴 `partieDeplacable` et `sorteDeCapsule` disent la MÊME chose', () => {
    const cas: { a: string; g: CleGroupeParties; i: boolean }[] = [
      { a: 'proprio@fictif.test', g: 'proprietaire', i: false },
      { a: 'assureur@fictif.test', g: 'a_repartir', i: false },
      { a: 'plombier@fictif.test', g: 'independant', i: false },
      { a: 'gestion@criterimmo.fr', g: 'a_repartir', i: true },
    ];
    for (const c of cas) {
      const s = sorteDeCapsule(c.a, c.g, FICHE, c.i);
      const immobile = s === 'client' || s === 'agence';
      expect(partieDeplacable(c.a, FICHE, c.i)).toBe(!immobile);
    }
  });
});

describe('pastilleDeCapsule — le « + », la fiche, ou rien', () => {
  const sans = new Map<string, boolean>();

  it('🔴 RIEN sur un client, l’agence ou un tiers indépendant', () => {
    for (const s of ['client', 'agence', 'tiers'] as const) {
      expect(pastilleDeCapsule(s, 'proprietaire', sans)).toBeNull();
    }
  });

  it('🔴🔴 LE « + » SUR UN CONTACT SANS CARTE, DANS LES TROIS GROUPES QUI EN PORTENT', () => {
    for (const g of ['proprietaire', 'locataire', 'a_repartir'] as const) {
      expect(pastilleDeCapsule('contact', g, sans)).toBe('plus');
    }
  });

  it('🔴🔴 LA FICHE QUAND LA CARTE EXISTE ET EST VÉRIFIÉE — le cas d’« esteban fardeau » sur lot-299', () => {
    expect(pastilleDeCapsule('contact', 'locataire', new Map([['locataire', true]]))).toBe('fiche');
  });

  it('🔴🔴 ORANGE QUAND LA CARTE EST ENCORE « À VÉRIFIER »', () => {
    expect(pastilleDeCapsule('contact', 'proprietaire', new Map([['proprietaire', false]]))).toBe('a_verifier');
  });

  it('🔴 LE CÔTÉ COMPTE : une carte côté propriétaire ne dispense pas d’en créer une côté locataire', () => {
    expect(pastilleDeCapsule('contact', 'locataire', new Map([['proprietaire', true]]))).toBe('plus');
  });

  it('⚠️ DEPUIS « NON AFFECTÉS », N’IMPORTE QUEL CÔTÉ COMPTE : on ne propose pas un doublon', () => {
    expect(pastilleDeCapsule('contact', 'a_repartir', new Map([['proprietaire', true]]))).toBe('fiche');
    expect(pastilleDeCapsule('contact', 'a_repartir', new Map([['locataire', false]]))).toBe('a_verifier');
  });

  it('⚠️ « À VÉRIFIER » L’EMPORTE SUR « VÉRIFIÉE » quand il y en a des deux', () => {
    const deux = new Map([['proprietaire', true], ['locataire', false]]);
    expect(pastilleDeCapsule('contact', 'a_repartir', deux)).toBe('a_verifier');
  });
});

describe('motPastille — le ton ne dit jamais seul', () => {
  it('🔴 CHAQUE ÉTAT PORTE SES MOTS, info-bulle et intitulé pour le lecteur d’écran', () => {
    expect(motPastille('plus', 'AXA')?.titre).toBe('Créer sa carte de contact');
    expect(motPastille('plus', 'AXA')?.aria).toContain('AXA');
    expect(motPastille('a_verifier', 'AXA')?.titre).toContain('à vérifier');
    expect(motPastille('fiche', 'AXA')?.titre).toBe('Ouvrir sa carte de contact');
  });

  it('⚠️ RIEN À DIRE QUAND IL N’Y A PAS DE PASTILLE', () => {
    expect(motPastille(null, 'AXA')).toBeNull();
  });

  it('🔴 LE BUT DU BOUTON EST ÉCRIT DANS LE CODE, comme Arno l’a demandé', () => {
    expect(BUT_DU_PLUS).toContain('prochains mails');
    expect(BUT_DU_PLUS).toContain('tout seuls');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UN CLIENT DONT L'ADRESSE N'EN EST PAS UNE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026), en réponse à ma question du lot 5 : « le propriétaire client (JULLIEN-GARRIDO
 * Cédric) apparaît en capsule dans l'encart Propriétaire même si son adresse d'annuaire est @sansvisavis.com.
 * Capsule non sélectionnable pour les mails, avec la mention discrète “adresse à corriger dans l'annuaire” (lien
 * vers sa fiche). Applique la même règle à tout client dont l'adresse est interne ou en @example.invalid. La
 * règle du lot 2 (l'agence n'est pas un groupe sélectionnable) est inchangée. »
 *
 * MESURÉ SUR lot-299 : son propriétaire n'a que `c.jullien@sansvisavis.com` (interne, 1 001 messages en base), et
 * ses trois co-propriétaires liés n'ont que des `@example.invalid`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('point 2 — une adresse qui ne peut rien filtrer', () => {
  it('🔴 UNE ADRESSE INTERNE EST À CORRIGER', () => {
    expect(adresseACorriger('c.jullien@sansvisavis.com', true)).toBe(true);
  });

  it('🔴 UNE ADRESSE EN « .invalid » AUSSI — le domaine est réservé par la RFC 2606', () => {
    expect(adresseACorriger('test.fiche@example.invalid', false)).toBe(true);
    expect(adresseACorriger('qui@test.invalid', false)).toBe(true);
    expect(adresseACorriger('  QUI@Example.INVALID ', false)).toBe(true);
  });

  it('⚠️ UNE ADRESSE ORDINAIRE NE L’EST PAS', () => {
    expect(adresseACorriger('malika.kassi@hotmail.fr', false)).toBe(false);
    /* ⚠️ ET « invalid » DANS LE NOM NE COMPTE PAS : c'est le DOMAINE final qui est réservé. */
    expect(adresseACorriger('invalid@gmail.com', false)).toBe(false);
    expect(adresseACorriger('qui@invalid.fr', false)).toBe(false);
  });

  it('🔴 LE MOTIF EST DIT EN TOUTES LETTRES, et il diffère selon la famille', () => {
    expect(motifNonSelectionnable('c.jullien@sansvisavis.com', true)).toContain('une des nôtres');
    expect(motifNonSelectionnable('x@example.invalid', false)).toContain('.invalid');
    /* Les deux renvoient à l'endroit où l'on corrige. */
    for (const a of [['c.jullien@sansvisavis.com', true], ['x@example.invalid', false]] as const) {
      expect(motifNonSelectionnable(a[0], a[1])).toContain('annuaire');
    }
  });

  it('⚠️ RIEN À DIRE SUR UNE ADRESSE ORDINAIRE', () => {
    expect(motifNonSelectionnable('malika.kassi@hotmail.fr', false)).toBeNull();
  });

  it('🔴 LA MENTION EST CELLE D’ARNO, AU MOT PRÈS', () => {
    expect(MOT_ADRESSE_A_CORRIGER).toBe('adresse à corriger dans l’annuaire');
  });

  /**
   * 🔴🔴 LE DÉFAUT DE lot-299, REJOUÉ : sans l'ensemble des clients, la règle du lot 2 écartait le propriétaire
   * avec les autres adresses internes — et son encart était vide.
   */
  it('🔴🔴 UN CLIENT INTERNE GARDE SA CAPSULE ; une adresse interne ordinaire reste écartée', () => {
    const inters: Interlocuteur[] = [
      { adresse: 'c.jullien@sansvisavis.com', nom: 'JULLIEN - GARRIDO Cédric', nbMails: 1, aEcrit: 0, enCopie: 1, interne: true },
      { adresse: 'gestion@criterimmo.fr', nom: 'Gestion', nbMails: 60, aEcrit: 40, enCopie: 20, interne: true },
    ];
    const cats = new Map<string, CategoriePartie>([['c.jullien@sansvisavis.com', 'proprietaire']]);

    /* ① SANS l'ensemble : le comportement d'avant la décision d'Arno — les deux sont écartées. */
    const avant = grouperParCategorie(inters, cats);
    expect(avant.nousEcartees).toBe(2);
    expect(avant.groupes.find((g) => g.cle === 'proprietaire')?.nb).toBe(0);

    /* ② AVEC : le client garde sa capsule, l'autre reste écartée — et n'est comptée qu'une fois. */
    const apres = grouperParCategorie(inters, cats, new Set(['c.jullien@sansvisavis.com']));
    expect(apres.nousEcartees).toBe(1);
    const prop = apres.groupes.find((g) => g.cle === 'proprietaire');
    expect(prop?.nb).toBe(1);
    expect(prop?.interlocuteurs[0].adresse).toBe('c.jullien@sansvisavis.com');
  });

  it('⚠️ UN CLIENT ÉPARGNÉ N’EST PAS COMPTÉ DANS « N adresses de notre agence ne sont pas listées »', () => {
    const inters: Interlocuteur[] = [
      { adresse: 'c.jullien@sansvisavis.com', nom: null, nbMails: 1, aEcrit: 0, enCopie: 1, interne: true },
    ];
    const r = grouperParCategorie(inters, new Map(), new Set(['c.jullien@sansvisavis.com']));
    /* Elle EST listée : dire le contraire serait faux. */
    expect(r.nousEcartees).toBe(0);
    expect(motAgenceEcartee(r.nousEcartees)).toBeNull();
  });

  it('🔴 LA RÈGLE DU LOT 2 EST INCHANGÉE : l’agence n’est toujours pas un groupe', () => {
    /* Aucun groupe « agence » n'existe, et aucune adresse interne non cliente n'entre dans les quatre. */
    const r = grouperParCategorie(
      [{ adresse: 'gestion@criterimmo.fr', nom: null, nbMails: 9, aEcrit: 9, enCopie: 0, interne: true }],
      new Map(), new Set(['autre@sansvisavis.com']));
    expect(r.groupes.map((g) => g.cle)).toEqual(['proprietaire', 'locataire', 'independant', 'a_repartir']);
    expect(r.groupes.every((g) => g.nb === 0)).toBe(true);
    expect(r.nousEcartees).toBe(1);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 4 — « AUJOURD'HUI » AU LIEU DE LA DATE DU JOUR ════════════════════════════
 *
 * DEMANDE D'ARNO : « quand la date de fin est aujourd'hui, écrire “aujourd'hui” au lieu de la date (ex. “du
 * 01/02/2025 à aujourd'hui”). Même règle dans les choix “Depuis l'entrée du dernier locataire”, “Un événement”
 * (en cours) et “Dates personnalisées”. »
 *
 * 🔴 LES TROIS CHOIX PASSENT PAR LA MÊME PHRASE, et c'est pourquoi une seule correction suffit : aucun des trois
 * boutons n'écrit de date, ils règlent les bornes que « Période retenue » affiche.
 */
describe('motPeriodeEffective — « aujourd’hui » plutôt que la date du jour', () => {
  const MIDI = new Date('2026-10-05T10:00:00Z');

  it('🔴🔴 L’EXEMPLE D’ARNO, AU MOT PRÈS', () => {
    const p = { sorte: 'dates', du: '2025-02-01', au: '2026-10-05' } as const;
    expect(motPeriodeEffective(p, MIDI)).toBe('du 01/02/2025 à aujourd’hui');
  });

  it('🔴 LA PRÉPOSITION SUIT LE MOT : « à aujourd’hui », jamais « au aujourd’hui »', () => {
    const p = { sorte: 'dates', du: '2025-02-01', au: '2026-10-05' } as const;
    expect(motPeriodeEffective(p, MIDI)).not.toContain('au aujourd’hui');
    expect(motPeriodeEffective({ sorte: 'dates', du: null, au: '2026-10-05' }, MIDI))
      .toBe('jusqu’à aujourd’hui');
  });

  it('⚠️ UNE AUTRE DATE DE FIN RESTE UNE DATE', () => {
    expect(motPeriodeEffective({ sorte: 'dates', du: '2025-02-01', au: '2026-09-28' }, MIDI))
      .toBe('du 01/02/2025 au 28/09/2026');
  });

  it('🔴 « UN ÉVÉNEMENT » EN COURS BORNE AU JOUR MÊME, et la phrase dit « aujourd’hui »', () => {
    const b = periodeDeLEvenement(
      { ouvertLe: '2026-09-23T07:00:00Z', closLe: null }, MIDI);
    expect(motPeriodeEffective({ sorte: 'evenement', evenementId: 1, du: b.du, au: b.au }, MIDI))
      .toBe('du 23/09/2026 à aujourd’hui');
  });

  it('🔴 UN ÉVÉNEMENT CLOS GARDE SA DATE DE CLÔTURE', () => {
    const b = periodeDeLEvenement(
      { ouvertLe: '2025-11-02T07:00:00Z', closLe: '2025-12-20T10:00:00Z' },
      MIDI);
    expect(motPeriodeEffective({ sorte: 'evenement', evenementId: 1, du: b.du, au: b.au }, MIDI))
      .toBe('du 02/11/2025 au 20/12/2025');
  });

  /**
   * 🔴🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » BORNE AU JOUR MÊME, ET C'EST BIEN LE CAS D'ARNO. J'attendais
   * d'abord « depuis le 01/05/2025 » : `periodeDuDernierLocataire` remplace en fait une sortie absente par le
   * jour de Paris (`au: p.au ?? jourParis(maintenant)`), exactement comme un événement en cours. Le choix de
   * bail en cours donne donc, mot pour mot, la phrase de l'exemple d'Arno.
   */
  it('🔴🔴 « DEPUIS L’ENTRÉE DU DERNIER LOCATAIRE » : un bail en cours dit « à aujourd’hui »', () => {
    const occ: OccupationPeriode[] = [{ libelle: 'MARTY', depuis: '2025-05-01', jusqua: null }];
    const b = periodeDuDernierLocataire(occ, MIDI);
    expect(b).not.toBeNull();
    expect(b?.au).toBe('2026-10-05');
    expect(motPeriodeEffective({ sorte: 'occupation', du: b?.du ?? null, au: b?.au ?? null }, MIDI))
      .toBe('du 01/05/2025 à aujourd’hui');
  });

  it('🔴 UN BAIL TERMINÉ GARDE SA DATE DE SORTIE', () => {
    const occ: OccupationPeriode[] = [{ libelle: 'MARTY', depuis: '2025-05-01', jusqua: '2026-09-28' }];
    const b = periodeDuDernierLocataire(occ, MIDI);
    expect(motPeriodeEffective({ sorte: 'occupation', du: b?.du ?? null, au: b?.au ?? null }, MIDI))
      .toBe('du 01/05/2025 au 28/09/2026');
  });

  it('⚠️ SANS BORNE DU TOUT, LA PHRASE NE CHANGE PAS', () => {
    expect(motPeriodeEffective({ sorte: 'tous' }, MIDI)).toBe('tous les échanges, sans borne de date');
  });

  /**
   * ⚠️ LA FONCTION RESTE **PURE** : elle ne lit pas l'horloge, elle la reçoit. Sans `maintenant`, la phrase est
   * celle d'avant ce lot au caractère près — un appelant qui ne connaît pas l'heure ne change pas de
   * comportement, et le cas s'éprouve deux jours de suite sans bouger.
   */
  it('🔴🔴 SANS `maintenant`, LE COMPORTEMENT EST CELUI D’AVANT CE LOT', () => {
    expect(motPeriodeEffective({ sorte: 'dates', du: '2025-02-01', au: '2026-10-05' }))
      .toBe('du 01/02/2025 au 05/10/2026');
    expect(motPeriodeEffective({ sorte: 'dates', du: null, au: '2026-10-05' })).toBe('jusqu’au 05/10/2026');
  });

  it('⚠️ LE JOUR EST CELUI DE PARIS, pas celui de l’UTC — 00h30 à Paris est encore « aujourd’hui »', () => {
    /* 2026-10-04T23:30:00Z = 2026-10-05 01h30 à Paris : le jour de Paris est bien le 5. */
    const nuit = new Date('2026-10-04T23:30:00Z');
    expect(jourParis(nuit)).toBe('2026-10-05');
    expect(motPeriodeEffective({ sorte: 'dates', du: '2025-02-01', au: '2026-10-05' }, nuit))
      .toBe('du 01/02/2025 à aujourd’hui');
  });
});
