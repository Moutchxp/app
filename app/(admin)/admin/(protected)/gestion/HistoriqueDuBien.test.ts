// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriqueDuBien } from './HistoriqueDuBien';
import { BUT_DU_PLUS, GROUPES_EN_BANDE, GROUPES_EN_ENCART, motDeuxCompteurs }
  from '../../../../lib/gestion/historiqueBien';
import type { CategoriePartie, OccupationPeriode } from '../../../../lib/gestion/historiqueBien';
import type { Interlocuteur, LigneHistorique, PieceHistorique } from '../../../../lib/gestion/historique';

/**
 * LOT HISTORIQUE-BIEN-1 — LE BLOC EST RENDU, ET IL DIT TOUT CE QU'ARNO A DEMANDÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE, ET QUE `historiqueBien.test.ts` NE PEUT PAS PROTÉGER. Le module pur dit quelle
 * période, quels groupes et quels mots ; il ne dit pas que le tableau de bord ARRIVE À L'ÉCRAN, que les deux
 * compteurs sont écrits sous chaque nom, que le résumé du haut est replié et celui du bas ouvert — ni, surtout,
 * que `LigneVie` et `CartePieceConversation` sont bien **IMPORTÉS** et non recopiés (section ⑥).
 *
 * ⚠️ CE QU'IL NE PEUT PAS PROUVER : la mise en page (jsdom ne calcule aucune hauteur), ni le rendu réel des
 * vignettes (aucune requête d'image n'aboutit ici). Ce qui est vérifié, c'est la PRÉSENCE et la STRUCTURE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-04T08:00:00Z');

const piece = (o: Partial<PieceHistorique> = {}): PieceHistorique => ({
  pieceId: 1, nomFichier: 'bail.pdf', typeMime: 'application/pdf', tailleOctets: 120_000,
  disponible: true, motifNonStocke: null, empreinte: `sha-${o.pieceId ?? 1}`, ...o,
});

const ligne = (o: Partial<LigneHistorique> = {}): LigneHistorique => ({
  messageId: 1, filId: 10, messageIdRfc: null, recuLe: '2026-02-01T09:00:00Z', sens: 'recu',
  de: 'proprio@fictif.test', deNom: 'M. ROI Nathan', destinataires: [], a: [], cc: [], cci: [],
  objet: 'Quittance de février',
  extrait: 'Bonjour, voici la quittance.', pieces: [],
  parCible: { sorte: 'lot', cle: '155', id: null }, cibleLibelle: 'Lot 155', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null, ...o,
});

const inter = (o: Partial<Interlocuteur> = {}): Interlocuteur => ({
  adresse: 'qui@fictif.test', nom: null, nbMails: 1, aEcrit: 1, enCopie: 0, interne: false, ...o,
});

const LIGNES: LigneHistorique[] = [
  ligne({
    messageId: 1, filId: 10, recuLe: '2026-02-01T09:00:00Z', objet: 'Quittance de février',
    pieces: [piece({ pieceId: 11, nomFichier: 'quittance-fevrier.pdf' })],
  }),
  ligne({
    messageId: 2, filId: 20, recuLe: '2026-03-15T09:00:00Z', objet: 'Dégât des eaux',
    de: 'assureur@fictif.test', deNom: 'AXA', pieces: [piece({ pieceId: 22, nomFichier: 'constat.pdf' })],
  }),
];

const INTERLOCUTEURS: Interlocuteur[] = [
  inter({ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', nbMails: 40, aEcrit: 3, enCopie: 2 }),
  inter({ adresse: 'locataire@fictif.test', nom: 'MARTY Jean-François', nbMails: 20, aEcrit: 20, enCopie: 0 }),
  inter({ adresse: 'assureur@fictif.test', nom: 'AXA', nbMails: 9, aEcrit: 5, enCopie: 4 }),
];

const CATEGORIES = new Map<string, CategoriePartie>([
  ['proprio@fictif.test', 'proprietaire'],
  ['locataire@fictif.test', 'locataire'],
]);

/** Le logement est VACANT depuis le 28/09/2026 — les dates du défaut de la maquette (voir le module pur). */
const OCCUPATIONS: OccupationPeriode[] = [
  { libelle: 'MARTY Jean-François', depuis: '2025-05-01', jusqua: '2026-09-28' },
  { libelle: 'ANCIEN Paul', depuis: '2020-01-01', jusqua: '2024-06-30' },
];

const EVENEMENTS = [
  {
    id: 7, reference: 'EV-2026-007', objet: 'Dégât des eaux', etat: 'en_cours', ouvert: true,
    ouvertLe: '2026-02-03T07:15:00Z', closLe: null, nbMails: 6,
  },
  {
    id: 4, reference: 'EV-2025-004', objet: 'Chaudière', etat: 'traite', ouvert: false,
    ouvertLe: '2025-11-02T07:15:00Z', closLe: '2025-12-20T10:00:00Z', nbMails: 3,
  },
];

let hote: HTMLDivElement;
let racine: Root;
/** Les adresses appelées, dans l'ordre : c'est ce qui prouve « une seule requête » pour le statut Drive. */
let appels: string[] = [];

function reponse(corps: unknown): Response {
  return { ok: true, json: async () => corps } as unknown as Response;
}

beforeEach(() => {
  appels = [];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(String(url));
    if (String(url).includes('/historique/evenements')) {
      return reponse({ etat: 'ok', evenements: EVENEMENTS, tronque: false });
    }
    if (String(url).includes('/pieces-drive')) {
      return reponse({ etat: 'ok', depots: [], emplacements: [] });
    }
    return reponse({
      etat: 'ok',
      data: {
        lignes: LIGNES, suite: false, entete: { nbMails: 2 },
        interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
      },
    });
  }));
  // jsdom ne sait pas ouvrir d'onglet : on le remplace, sinon chaque clic sur l'œil crie « not implemented ».
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  act(() => racine.unmount());
  hote.remove();
  vi.unstubAllGlobals();
});

async function monter(props: Partial<Parameters<typeof HistoriqueDuBien>[0]> = {}): Promise<void> {
  await act(async () => {
    racine.render(createElement(HistoriqueDuBien, {
      lotCle: '155', maintenant: MAINTENANT, occupations: OCCUPATIONS, categories: CATEGORIES, ...props,
    }));
  });
}

const texte = (): string => hote.textContent ?? '';
const boutons = (): HTMLButtonElement[] => [...hote.querySelectorAll('button')];
const parMot = (mot: string): HTMLButtonElement | undefined =>
  boutons().find((b) => (b.textContent ?? '').includes(mot));
async function cliquer(el: Element | undefined): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
}

/**
 * ⚠️ CHANGER UNE VALEUR **PAR LE SETTER NATIF**, et pas par `el.value = …`. React mémorise la dernière valeur
 * qu'il a posée sur le nœud ; une écriture directe la contourne, et `onChange` ne part pas — l'épreuve passerait
 * alors en ne prouvant rien. Le setter du prototype est la seule voie que React observe.
 */
async function changer(el: HTMLInputElement | HTMLSelectElement, valeur: string): Promise<void> {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, valeur);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * ══ 🔴 DÉPLIER UN GROUPE PAR SON TITRE (lot HISTORIQUE-BIEN-3) ══════════════════════════════════════════════════
 *
 * ⚠️ POURQUOI CETTE AIDE EXISTE MAINTENANT. « Tiers indépendant » et « Non affectés » sont devenues des BANDES
 * repliées par défaut (demande d'Arno) : leurs capsules ne sont pas dans le document tant qu'on ne les a pas
 * dépliées. Les cas qui visaient une capsule de « Non affectés » cherchaient donc dans le vide — ce n'est pas
 * une régression, c'est la nouvelle mise en page, et les épreuves doivent faire le geste qu'une personne fait.
 */
async function deplierGroupe(titre: string): Promise<void> {
  const tete = [...hote.querySelectorAll('.hdb-replier')] as HTMLButtonElement[];
  const b = tete.find((x) => (x.textContent ?? '').includes(titre));
  if (b !== undefined && b.getAttribute('aria-expanded') === 'false') await cliquer(b);
}

/**
 * ══ 🔴 OUVRIR LE RÉSUMÉ DES PIÈCES (lot HISTORIQUE-BIEN-4, point 4) ═════════════════════════════════════════════
 *
 * ⚠️ POURQUOI CETTE AIDE EXISTE MAINTENANT. Les deux résumés (haut et bas) partagent UN SEUL état depuis le lot
 * 4, et il démarre REPLIÉ : le bouton promet « — les voir ». Les cas qui lisaient les miniatures sans cliquer
 * cherchaient donc dans le vide — ce n'est pas une régression, c'est l'état partagé qu'Arno a demandé.
 */
async function ouvrirLeResume(): Promise<void> {
  const b = [...hote.querySelectorAll('.pdc-trombone')] as HTMLButtonElement[];
  const ferme = b.find((x) => x.getAttribute('aria-expanded') === 'false');
  if (ferme !== undefined) await cliquer(ferme);
}

/** Les deux événements du jeu d'essai, nommés : un identifiant écrit en clair dans un test se relit mal. */
const ID_EVT_EN_COURS = 7;
const ID_EVT_CLOS = 4;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE HAUT DU BLOC : L'ÉVÉNEMENT EN COURS, ET QUI OCCUPE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① le haut du bloc', () => {
  it('🔴 le titre de l’ÉVÉNEMENT EN COURS est écrit (demande d’Arno)', async () => {
    await monter();
    expect(texte()).toContain('Événement en cours');
    expect(texte()).toContain('EV-2026-007 — Dégât des eaux');
  });

  /** 🔴🔴 LE VERROU, VU À L'ÉCRAN : la phrase vient du module pur, et elle ne peut pas dire « en place ». */
  it('🔴🔴 sur un logement vacant, l’écran NE dit PAS « en place »', async () => {
    await monter();
    expect(texte()).toContain('Logement vacant depuis le 28/09/2026');
    expect(texte()).toContain('entré le 01/05/2025');
    expect(texte()).not.toContain('en place depuis');
  });

  /** 🔴 PAS DE BANDEAU DE NAVIGATION : Arno n'en veut pas. */
  it('🔴 aucun bandeau « 1 · En-tête … 8 · Historique »', async () => {
    await monter();
    expect(texte()).not.toContain('vous êtes ici');
    expect(texte()).not.toMatch(/\d\s·\sEn-tête/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA PÉRIODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② la période — quatre choix exclusifs, en bande horizontale', () => {
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — CE GROUPE A ÉTÉ RÉÉCRIT, ET VOICI CE QU'IL DISAIT ═════════════════════════════
   *
   * DEMANDE D'ARNO (04/10/2026) : « Choix exclusifs en boutons segmentés : “Tous les échanges” · “Depuis
   * l'entrée du dernier locataire” · “Un événement” (liste déroulante des événements en cours et clos) ·
   * “Dates personnalisées”. La période effective est toujours affichée en clair à droite. »
   *
   * ═══ CE QUE CES CINQ CAS ATTENDAIENT, ET POURQUOI C'ÉTAIT JUSTE ALORS ════════════════════════════════════════
   * Le bloc d'avant offrait DEUX boutons (« Tous les échanges », « Entre deux dates ») puis deux rangées : un
   * bouton par événement, un bouton par occupation. Les cas éprouvaient donc le clic sur « EV-2025-004 », sur
   * « EV-2026-007 » et sur « ANCIEN Paul ». Ces rangées poussaient le fil hors de l'écran sur un bien chargé —
   * c'est précisément ce qu'Arno a demandé de refondre.
   *
   * ═══ 🔴 CE QUI EST ÉPROUVÉ MAINTENANT, ET CE QUI NE SE PERD PAS ══════════════════════════════════════════════
   * · le libellé « Entre deux dates » devient « Dates personnalisées » (mot d'Arno) ;
   * · les événements passent d'une rangée de boutons à une LISTE DÉROULANTE — leur état reste écrit en MOTS
   *   (« en cours » / « clos »), et les choisir règle toujours les deux dates, qui restent modifiables ;
   * · le choix par occupation devient « Depuis l'entrée du dernier locataire », grisé AVEC SON MOTIF quand le
   *   logement n'a aucun locataire connu.
   * 🔭 LE CLIC SUR UN ANCIEN LOCATAIRE POUR RÉGLER SES DATES est repris au point 2, dans le bloc PARTIES, où
   *    Arno place désormais « locataire en place et anciens locataires, chacun avec sa période ». Il est éprouvé
   *    là-bas : rien ne se perd, le geste change d'endroit.
   */
  it('🔴 « Tous les échanges » est le départ, et les deux dates ne s’affichent qu’au besoin', async () => {
    await monter();
    expect(parMot('Tous les échanges')?.getAttribute('aria-pressed')).toBe('true');
    expect(hote.querySelectorAll('input[type="date"]')).toHaveLength(0);
    await cliquer(parMot('Dates personnalisées'));
    expect(hote.querySelectorAll('input[type="date"]')).toHaveLength(2);
  });

  /**
   * 🔴🔴 « TOUJOURS AFFICHÉE EN CLAIR », et c'est la seule chose qui rende visible la période qu'un bouton a
   * réglée sans qu'on ait à aller lire les champs de date.
   */
  it('🔴🔴 la période effective est écrite en clair, dans les quatre états', async () => {
    await monter();
    expect(texte()).toContain('tous les échanges, sans borne de date');
    await cliquer(parMot('Depuis l’entrée du dernier locataire'));
    expect(texte()).toContain('du 01/05/2025 au 28/09/2026');
  });

  /**
   * 🔴🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » : début = son entrée, fin = sa sortie ou aujourd'hui.
   * Le dernier locataire de ce logement est MARTY Jean-François, parti le 28/09/2026 : la borne haute est donc
   * SA SORTIE, et non aujourd'hui — ce qui s'est dit après son départ n'appartient pas à son dossier.
   */
  it('🔴🔴 « Depuis l’entrée du dernier locataire » règle les deux dates sur SON bail', async () => {
    await monter();
    await cliquer(parMot('Depuis l’entrée du dernier locataire'));
    const dates = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(dates.map((d) => d.value)).toEqual(['2025-05-01', '2026-09-28']);
    // ⚠️ MODIFIABLES : le choix PROPOSE une période, il ne l'impose pas.
    expect(dates.every((d) => !d.disabled && !d.readOnly)).toBe(true);
  });

  /** 🔴 LA LISTE DÉROULANTE PORTE LES DEUX SORTES, et l'état est écrit en MOTS, pas seulement par la place. */
  it('🔴 un événement, EN COURS ou CLOS, dans une liste déroulante', async () => {
    await monter();
    await cliquer(parMot('Un événement'));
    const select = hote.querySelector('select.hdb-select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    const mots = [...(select?.options ?? [])].map((o) => o.textContent ?? '').join(' | ');
    expect(mots).toContain('EV-2025-004');
    expect(mots).toContain('EV-2026-007');
    expect(mots).toContain('clos');
    expect(mots).toContain('en cours');
  });

  /**
   * 🔴🔴 CHOISIR UN ÉVÉNEMENT RÈGLE LES DEUX DATES. Le premier de la liste est pris d'emblée au clic sur le
   * bouton ; en changer dans la liste règle les dates de celui-là.
   */
  it('🔴🔴 choisir un événement règle les deux dates — clos, puis en cours', async () => {
    await monter();
    await cliquer(parMot('Un événement'));
    const select = hote.querySelector('select.hdb-select') as HTMLSelectElement;
    const dates = (): string[] =>
      ([...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[]).map((d) => d.value);

    await changer(select, String(ID_EVT_CLOS));
    expect(dates()).toEqual(['2025-11-02', '2025-12-20']);

    /* 🔴 UN ÉVÉNEMENT EN COURS COURT JUSQU'À AUJOURD'HUI — ici le 04/10/2026, figé par le `maintenant` du test. */
    await changer(select, String(ID_EVT_EN_COURS));
    expect(dates()).toEqual(['2026-02-03', '2026-10-04']);
  });

  /**
   * 🔴🔴 MODIFIER UNE BORNE BASCULE SUR « DATES PERSONNALISÉES », et c'est la vérité : ce n'est plus la période
   * de l'événement. Laisser le bouton « Un événement » allumé aurait annoncé une période que le fil ne suit pas.
   */
  it('🔴🔴 toucher une date bascule sur « Dates personnalisées »', async () => {
    await monter();
    await cliquer(parMot('Un événement'));
    const champ = hote.querySelector('input[type="date"]') as HTMLInputElement;
    await changer(champ, '2026-01-15');
    expect(parMot('Dates personnalisées')?.getAttribute('aria-pressed')).toBe('true');
    expect(parMot('Un événement')?.getAttribute('aria-pressed')).toBe('false');
    /* ⚠️ LA BORNE HAUTE EST CONSERVÉE : on a touché « Du », pas « Au ». L'événement en cours avait réglé « Au »
       sur aujourd'hui (04/10/2026), et basculer sur « Dates personnalisées » ne doit pas effacer ce qu'on n'a
       pas touché — sans quoi un ajustement d'une borne élargirait silencieusement la période de l'autre côté.

       🔴 MIS À JOUR AU LOT HISTORIQUE-BIEN-6, POINT 4 : la borne haute est toujours là, mais elle s'ÉCRIT
       désormais « à aujourd'hui », parce que c'est le jour même (demande d'Arno). Ce que ce cas protège — la
       borne conservée — est donc vérifié deux fois : par la phrase, et par la valeur du champ. */
    expect(texte()).toContain('du 15/01/2026 à aujourd’hui');
    expect((hote.querySelectorAll('input[type="date"]')[1] as HTMLInputElement).value).toBe('2026-10-04');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LES PARTIES, EN GROUPES, AVEC LEURS DEUX COMPTEURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ les parties', () => {
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-2 — LE VOCABULAIRE D'ARNO. Ce cas attendait « À répartir » ; Arno a tranché le
   * 04/10/2026 : « “Tiers indépendant” REMPLACE le libellé “Indépendant” partout », et le quatrième groupe
   * s'appelle « Non affectés ». Les CLÉS, elles, n'ont pas bougé — elles sont écrites en base.
   */
  it('🔴 les groupes non vides sont nommés, avec leur compte — et « Non affectés » existe', async () => {
    await monter();
    expect(texte()).toContain('Propriétaire');
    expect(texte()).toContain('Locataire');
    expect(texte()).toContain('Non affectés');
    expect(texte()).not.toContain('À répartir');
  });

  /** 🔴🔴 LES DEUX COMPTEURS SONT ÉCRITS SOUS CHAQUE NOM, jamais dans une infobulle seule. */
  it('🔴🔴 chaque adresse porte « a écrit : N · en copie : N », en toutes lettres', async () => {
    await monter();
    expect(texte()).toContain('a écrit : 3 · en copie : 2');
    expect(texte()).toContain('a écrit : 20 · en copie : 0');
    // ⚠️ AUCUNE INFOBULLE NE PORTE SEULE CETTE INFORMATION : elle est dans le texte du document.
    expect(hote.querySelector('.hdb-compteurs')?.textContent).toContain('a écrit');
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LA CASE A DISPARU, ET C'ÉTAIT LE DÉFAUT ═════════════════════════════
   *
   * CONSTAT D'ARNO (05/10/2026) : « seul le groupe Propriétaire est coché, et les mails du locataire s'affichent
   * quand même ». CE CAS-CI décrivait la cause sans la voir : « est COCHÉ au départ, ET IGNORE LES PARTIES ».
   * C'était la règle du lot 2, et elle rendait les cases d'à côté inopérantes sans rien dire.
   *
   * Ce qui la remplace, sur accord d'Arno : une RÈGLE AUTOMATIQUE (aucune partie cochée ⇒ tous les mails ; au
   * moins une ⇒ ses échanges seulement) et une LIGNE D'ÉTAT qui dit laquelle des deux on regarde.
   */
  it('🔴🔴 LA LIGNE D’ÉTAT REMPLACE L’INTERRUPTEUR, et dit la règle en toutes lettres', async () => {
    await monter();
    /* 🔴 L'INTERRUPTEUR N'EXISTE PLUS NULLE PART — ni sa case, ni son libellé. */
    expect(texte()).not.toContain('Tous les mails du bien sur la période');
    expect(hote.querySelector('.hdb-case--large')).toBeNull();
    /* 🔴 ET LA PHRASE DU DÉPART EST CELLE DU CAS « RIEN DE COCHÉ ». */
    expect(hote.querySelector('.hdb-selection')?.textContent)
      .toContain('Aucune partie cochée : tous les mails du bien sont affichés.');
    /* ⚠️ PAS DE BOUTON « Tout décocher » QUAND IL N'Y A RIEN À DÉCOCHER : un bouton qui ne fait rien apprend à
       ne plus lire la ligne qui le porte. */
    expect(hote.querySelector('.hdb-btn-decocher')).toBeNull();
  });

  /** 🔴🔴 ET COCHER UNE PARTIE CHANGE LA PHRASE **ET** LE FILTRE — c'est tout le défaut réparé. */
  it('🔴🔴 COCHER UNE PARTIE FILTRE VRAIMENT, et la ligne d’état le dit', async () => {
    await monter();
    const personnes = [...hote.querySelectorAll('.hdb-personnes input')] as HTMLInputElement[];
    await cliquer(personnes[0]);
    expect(hote.querySelector('.hdb-selection')?.textContent)
      .toContain('1 partie cochée : seuls ses échanges sont affichés.');
    expect(hote.querySelector('.hdb-btn-decocher')).not.toBeNull();
    /* 🔴 LE `avec=` PART VRAIMENT AU SERVEUR : avant ce lot, il ne partait pas. */
    expect(appels.some((a) => a.includes('avec='))).toBe(true);
  });

  /** 🔴 « Tout décocher » remet les deux listes à plat : les parties ET nos adresses décochées. */
  it('🔴 « TOUT DÉCOCHER » REVIENT À TOUS LES MAILS DU BIEN', async () => {
    await monter();
    const personnes = [...hote.querySelectorAll('.hdb-personnes input')] as HTMLInputElement[];
    await cliquer(personnes[0]);
    await cliquer(hote.querySelector('.hdb-btn-decocher') ?? undefined);
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('Aucune partie cochée');
    expect(hote.querySelector('.hdb-btn-decocher')).toBeNull();
  });

  /** 🔴 COCHER UNE PERSONNE NE DÉMONTE PAS LA CASE : le focus reste là où il était. */
  it('🔴🔴 cocher une personne garde le focus sur la case cochée', async () => {
    await monter();
    const personnes = [...hote.querySelectorAll('.hdb-personnes input')] as HTMLInputElement[];
    expect(personnes.length).toBeGreaterThan(0);
    const premiere = personnes[0];
    premiere.focus();
    await cliquer(premiere);
    // La MÊME case est toujours dans le document, cochée, et porte encore le focus.
    expect(premiere.isConnected).toBe(true);
    expect(premiere.checked).toBe(true);
    expect(document.activeElement).toBe(premiere);
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — « UNE CASE “TOUT LE GROUPE” PAR GROUPE » (demande d'Arno) ═══════════════════
   *
   * ═══ CE QUE CE CAS ATTENDAIT ═════════════════════════════════════════════════════════════════════════════════
   * Un BOUTON qui change de mot (« Tout le groupe » ⇄ « Décocher le groupe ») et porte `aria-pressed`. C'était
   * juste tant que c'était un bouton.
   *
   * ═══ 🔴 CE QUE C'EST MAINTENANT, ET CE QUE LE TROISIÈME ÉTAT APPORTE ══════════════════════════════════════════
   * Une vraie case, parce qu'Arno l'a demandée ainsi — et parce qu'une case porte TROIS états. `indeterminate`
   * dit « une partie du groupe est cochée » : une case à deux états se serait affichée VIDE sur un groupe à demi
   * coché, donc aurait annoncé « personne » là où quelqu'un était choisi.
   */
  it('🔴🔴 la case « tout le groupe » coche tout, puis décoche tout', async () => {
    await monter();
    const groupe = (): HTMLInputElement =>
      hote.querySelector('.hdb-case--groupe input') as HTMLInputElement;
    const personnes = (): HTMLInputElement[] =>
      [...hote.querySelectorAll('.hdb-personnes input')] as HTMLInputElement[];

    expect(groupe().checked).toBe(false);
    await cliquer(groupe());
    expect(groupe().checked).toBe(true);
    expect(personnes().slice(0, 1).every((c) => c.checked)).toBe(true);

    await cliquer(groupe());
    expect(groupe().checked).toBe(false);
  });

  /**
   * 🔴🔴 LE TROISIÈME ÉTAT. Sur un groupe de plusieurs personnes dont une seule est cochée, la case du groupe
   * n'est ni cochée ni vide : elle est `indeterminate`.
   */
  it('🔴🔴 une seule personne cochée ⇒ la case du groupe est « indéterminée »', async () => {
    const deux = [
      inter({ adresse: 'a@fictif.test', nbMails: 9 }),
      inter({ adresse: 'b@fictif.test', nbMails: 3 }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: deux, interlocuteursTronques: false,
        },
      });
    }));
    await monter({ categories: new Map() });
    await deplierGroupe('Non affectés');
    const personnes = [...hote.querySelectorAll('.hdb-personnes input')] as HTMLInputElement[];
    await cliquer(personnes[0]);
    /* ⚠️ LA CASE DE « NON AFFECTÉS », ET NON « la première case de groupe » — mis à jour au lot
       HISTORIQUE-BIEN-5 : depuis le point 2, chaque groupe porte sa case MÊME À ZÉRO, et la première de la
       page est donc celle de l'encart « Propriétaire ». */
    const groupe = (hote.querySelector('.hdb-groupe--gris') as HTMLElement)
      .querySelector('.hdb-case--groupe input') as HTMLInputElement;
    expect(groupe.checked).toBe(false);
    expect(groupe.indeterminate).toBe(true);
  });

  /**
   * 🔴 LE REPLI : un groupe de plus de six personnes s'ouvre REPLIÉ, et son compte se lit SANS clic.
   * ⚠️ On monte ici un groupe « À répartir » de sept personnes — le cas réel du lot 155 (76 adresses).
   */
  /**
   * ⚠️ LE SÉLECTEUR VISE « NON AFFECTÉS » PAR SON TON, ET NON « LE PREMIER GROUPE » — mis à jour au lot
   * HISTORIQUE-BIEN-5, POINT 1. Les deux encarts sont désormais rendus MÊME VIDES (règle d'Arno), si bien que
   * le premier `.hdb-groupe` de la page est l'encart « Propriétaire », pas la bande qu'éprouve ce cas. Le
   * défaut que cela aurait masqué est réel : le cas passait en lisant le repli d'un autre groupe.
   */
  it('🔴🔴 un groupe au-delà de six personnes s’ouvre REPLIÉ, compte lisible sans clic', async () => {
    const sept = Array.from({ length: 7 }, (_, i) => inter({ adresse: `x${i}@fictif.test`, nbMails: 7 - i }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: sept, interlocuteursTronques: false,
        },
      });
    }));
    await monter({ categories: new Map() });
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    const replier = gris.querySelector('.hdb-replier') as HTMLButtonElement;
    expect(replier.getAttribute('aria-expanded')).toBe('false');
    // LE COMPTE EST LÀ, REPLIÉ : c'est tout l'intérêt du repli.
    expect(replier.textContent).toContain('7');
    expect(hote.querySelectorAll('.hdb-personnes input')).toHaveLength(0);
    await cliquer(replier);
    expect(hote.querySelectorAll('.hdb-personnes input')).toHaveLength(7);
  });

  it('🔴 un groupe de six ou moins s’ouvre DÉPLIÉ, et se referme quand même', async () => {
    await monter();
    const replier = hote.querySelector('.hdb-replier') as HTMLButtonElement;
    expect(replier.getAttribute('aria-expanded')).toBe('true');
    await cliquer(replier);
    expect(replier.getAttribute('aria-expanded')).toBe('false');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES OPTIONS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ les options', () => {
  /**
   * ══ 🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LES LIBELLÉS SE RACCOURCISSENT ═══════════════════════════════════════
   *
   * Ce cas attendait « Avec pièces jointes » et « Sans pièce jointe », les libellés du lot 1. Arno a demandé
   * (05/10/2026) « un contrôle segmenté “Pièces jointes : Toutes · Avec · Sans” » : l'intitulé du groupe porte
   * désormais le mot « Pièces jointes », et les trois boutons n'en gardent que ce qui les distingue. Rien n'est
   * perdu — le mot est écrit une fois au lieu de trois, et la rangée tient sur une ligne.
   */
  it('🔴 les trois filtres de pièces sont offerts, et « Toutes » est le départ', async () => {
    await monter();
    expect(texte()).toContain('Pièces jointes');
    expect(parMot('Toutes')?.getAttribute('aria-pressed')).toBe('true');
    await cliquer(parMot('Avec'));
    expect(appels.some((a) => a.includes('pieces=avec'))).toBe(true);
    await cliquer(parMot('Sans'));
    expect(appels.some((a) => a.includes('pieces=sans'))).toBe(true);
  });

  it('🔴 le plus récent en haut est le DÉFAUT, et un bouton inverse', async () => {
    await monter();
    expect(parMot('Plus récent en haut')).toBeDefined();
    await cliquer(parMot('Plus récent en haut'));
    expect(parMot('Plus ancien en haut')).toBeDefined();
  });

  it('🔴 l’inversion change VRAIMENT l’ordre des mails à l’écran', async () => {
    await monter();
    const avant = [...hote.querySelectorAll('.hdb-ancre')].map((n) => n.id);
    expect(avant).toEqual(['hdb-mail-2', 'hdb-mail-1']);
    await cliquer(parMot('Plus récent en haut'));
    expect([...hote.querySelectorAll('.hdb-ancre')].map((n) => n.id))
      .toEqual(['hdb-mail-1', 'hdb-mail-2']);
  });

  it('🔴 « Regrouper par conversation » est DÉCOCHÉ par défaut, et regroupe quand on le coche', async () => {
    await monter();
    /* ⚠️ LA BASCULE A SA PROPRE CLASSE DEPUIS LE POINT 5 (`.hdb-bascule`) : elle n'est plus une `.hdb-case`
       parmi les cases de parties, parce qu'elle vit dans la rangée d'options et doit en garder la hauteur. */
    const grouper = hote.querySelector('.hdb-bascule input') as HTMLInputElement;
    expect(grouper.checked).toBe(false);
    expect(hote.querySelectorAll('.hdb-conv')).toHaveLength(0);
    await cliquer(grouper);
    // Deux échanges distincts (fils 10 et 20) ⇒ deux groupes.
    expect(hote.querySelectorAll('.hdb-conv')).toHaveLength(2);
    expect(texte()).toContain('Dégât des eaux');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LE FIL, LE RÉSUMÉ DES PIÈCES, ET « AUCUN RÉSULTAT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ le fil et les pièces', () => {
  it('🔴 un mail par ligne, dans la présentation de « Vie du bien »', async () => {
    await monter();
    // `.vdb-item` est rendu par `LigneVie` : sa présence prouve que c'est bien CE composant qui rend la ligne.
    expect(hote.querySelectorAll('.vdb-item')).toHaveLength(2);
    expect(texte()).toContain('Objet : Quittance de février');
  });

  /** 🔴 LE RÉSUMÉ DU HAUT EST REPLIÉ, SON COMPTE LISIBLE SANS CLIC ; CELUI DU BAS EST OUVERT. */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — UN SEUL ÉTAT, ET LE MÊME BOUTON EN HAUT ET EN BAS ═══════════════════
   *
   * ═══ CE QUE CE CAS ATTENDAIT, ET POURQUOI C'ÉTAIT JUSTE ══════════════════════════════════════════════════════
   * Que le résumé du HAUT soit replié et celui du BAS toujours ouvert. C'était la demande d'Arno au lot 1, mot
   * pour mot : « Le résumé du haut est REPLIÉ, celui du bas est OUVERT ».
   *
   * ═══ 🔴 CE QU'ARNO A TRANCHÉ LE 05/10/2026 ═══════════════════════════════════════════════════════════════════
   * « Le MÊME bouton est ajouté EN BAS du listing des mails : il ouvre et ferme le même résumé (un seul état
   * partagé). » Deux états auraient fait deux vérités pour un même contenu — l'écran où l'on finit par ne plus
   * savoir si l'on a déjà regardé. Le compte, lui, se lit toujours SANS clic : c'est tout l'intérêt du repli.
   */
  it('🔴🔴 un seul état partagé, et le compte se lit sans clic', async () => {
    await monter();
    const boutons = [...hote.querySelectorAll('.pdc-trombone')] as HTMLButtonElement[];
    /* LE MÊME BOUTON, DEUX FOIS : en haut du bloc et en bas du listing. */
    expect(boutons).toHaveLength(2);
    for (const b of boutons) {
      expect(b.getAttribute('aria-expanded')).toBe('false');
      /* 🔴 LE LIBELLÉ DIT SON PÉRIMÈTRE : « dans cette sélection » — la correction du point 1, dite à l'écran. */
      expect(b.textContent).toContain('2 pièces dans cette sélection');
      expect(b.textContent).toContain('— les voir');
    }
    expect(hote.querySelectorAll('.pdc-carte')).toHaveLength(0);

    /* UN CLIC EN HAUT OUVRE LES DEUX, et les deux boutons le disent. */
    await cliquer(boutons[0]);
    for (const b of [...hote.querySelectorAll('.pdc-trombone')] as HTMLButtonElement[]) {
      expect(b.getAttribute('aria-expanded')).toBe('true');
      expect(b.textContent).toContain('— les masquer');
    }
    expect(hote.querySelectorAll('.pdc-carte').length).toBeGreaterThan(0);

    /* …ET UN CLIC EN BAS LES REFERME. */
    const enBas = ([...hote.querySelectorAll('.pdc-trombone')] as HTMLButtonElement[])[1];
    await cliquer(enBas);
    expect(hote.querySelectorAll('.pdc-carte')).toHaveLength(0);
  });

  /**
   * ══ 🔴🔴 MIS À JOUR AU LOT HISTORIQUE-BIEN-6, POINT 5 — LE LISERÉ EST SUR LE BLOC, ET SUR LUI SEUL ═════════
   *
   * RÈGLE D'ARNO : « le liseré de couleur reste UNIQUEMENT sur le bloc qui regroupe les pièces d'un mail.
   * Retire-le des miniatures elles-mêmes. »
   *
   * 🔴 C'EST L'INVERSE DE CE QU'IL DEMANDAIT AU LOT 4 (« chaque groupe de pièces et chaque miniature porte le
   * même liseré »), et sa nouvelle règle est meilleure pour une raison qui se voit : un bloc de six pièces
   * portait SEPT liserés de la même couleur — un par carte, plus celui du bloc —, et la couleur ne désignait
   * donc plus rien.
   *
   * ⚠️ CE QUE CE CAS PROTÈGE N'A PAS CHANGÉ : le bloc réemploie la MÊME classe que les mails (`hdb-barre`) et la
   * MÊME fonction de ton, donc un document ne peut pas être rouge dans le listing et bleu dans le résumé.
   */
  it('🔴🔴 chaque bloc du résumé porte le liseré de sa catégorie, et les miniatures n’en portent plus', async () => {
    await monter();
    await ouvrirLeResume();
    const groupes = [...hote.querySelectorAll('.hdb-pieces .pdc-groupe')] as HTMLElement[];
    expect(groupes.length).toBeGreaterThan(0);
    for (const g of groupes) {
      expect(g.className).toContain('hdb-barre');
      expect(g.className).toMatch(/hdb-barre--(rouge|vert|bleu|gris|nous)/);
      /* 🔴 ET LA GRILLE REDEVIENT UNE GRILLE : plus de teinte transmise aux cartes. */
      const grille = g.querySelector('.pdc-grille') as HTMLElement;
      expect(grille).not.toBeNull();
      expect(grille.className).toBe('pdc-grille');
    }
    /* 🔴 LE MAIL DU PROPRIÉTAIRE EST ROUGE DANS LE RÉSUMÉ, comme dans le listing. */
    expect(groupes.some((g) => g.className.includes('hdb-barre--rouge'))).toBe(true);
    /* ⚠️ ET LE LISERÉ DU BLOC EST BIEN DES DEUX CÔTÉS : c'est la règle des mails, réemployée. */
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).toContain('.hdb-barre{border-left:3px solid transparent;border-right:3px solid transparent');
  });

  /**
   * 🔴🔴 LE GARDE DU POINT 5 : plus aucune règle ne peint un liseré sur les miniatures, et plus aucun élément ne
   * porte la classe qui le transmettait. Un garde qui ne vérifierait que l'absence de la règle laisserait la
   * classe revenir avec elle.
   */
  it('🔴🔴 plus rien ne peint de liseré sur une miniature du résumé', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).not.toContain('.hdb-grille-ton>*{');
    expect(css).not.toContain('--hdb-ton:');
    /* …et aucun élément ne porte plus la classe. */
    const code = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[0] ?? '';
    expect(code).not.toContain('hdb-grille-ton');
  });

  /** 🔴 LES MINIATURES PORTENT LES TROIS GESTES D'ARNO : l'œil, le téléchargement, le picto Drive (vide ici). */
  it('🔴 chaque miniature porte « Visualiser » et « Télécharger »', async () => {
    await monter();
    await ouvrirLeResume();
    const bas = hote.querySelector('.hdb-resume--bas') as HTMLElement;
    expect(bas.querySelector('[aria-label^="Visualiser"]')).not.toBeNull();
    expect(bas.querySelector('[aria-label^="Télécharger"]')).not.toBeNull();
    expect(texte()).toContain('quittance-fevrier.pdf');
    expect(texte()).toContain('constat.pdf');
  });

  /** 🔴 UNE SEULE REQUÊTE DE STATUT DRIVE POUR TOUTE LA PAGE, et non une par échange. */
  it('🔴 le statut Drive est demandé en UNE requête pour toutes les pièces de la page', async () => {
    await monter();
    const drive = appels.filter((a) => a.includes('/pieces-drive'));
    expect(drive).toHaveLength(1);
    expect(drive[0]).toContain('pieces=11,22');
  });

  /**
   * ⚠️ INVERSER L'ORDRE NE REDEMANDE PAS LE STATUT DRIVE. L'adresse ne dépend que de l'ENSEMBLE des pièces : si
   * elle suivait l'ordre d'affichage, chaque inversion relancerait une requête pour la MÊME réponse.
   */
  it('⚠️ inverser l’ordre du fil ne relance pas la requête de statut Drive', async () => {
    await monter();
    expect(appels.filter((a) => a.includes('/pieces-drive'))).toHaveLength(1);
    await cliquer(parMot('Plus récent en haut'));
    expect(appels.filter((a) => a.includes('/pieces-drive'))).toHaveLength(1);
  });

  it('🔴 « aucun résultat » accuse les réglages, et un bouton remet tout à plat', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      return reponse({
        etat: 'ok',
        data: { lignes: [], suite: false, entete: { nbMails: 0 }, interlocuteurs: [], interlocuteursTronques: false },
      });
    }));
    await monter();
    await cliquer(parMot('Avec'));
    expect(texte()).toContain('ce sont les réglages qui cachent');
    const remettre = parMot('Tout remettre à plat');
    expect(remettre).toBeDefined();
    await cliquer(remettre);
    expect(parMot('Toutes')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('⚠️ une réponse en échec le DIT, elle ne rend pas un historique vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'erreur', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      return reponse({ etat: 'erreur' });
    }));
    await monter();
    expect(texte()).toContain('n’a pas pu être lu');
    expect(texte()).toContain('Les événements de ce bien n’ont pas pu être lus');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-bis 🔴🔴 LOT HISTORIQUE-BIEN-2 — LE « + », ET LA PÉRIODE D'UNE PARTIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-bis 🔴🔴 le « + » cerclé, la carte de création, et la période d’un locataire', () => {
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 3 — CE GROUPE A ÉTÉ RÉÉCRIT ; VOICI CE QU'IL DISAIT ═════════════════════
   *
   * ═══ CE QU'IL ATTENDAIT, ET POURQUOI C'ÉTAIT JUSTE ═══════════════════════════════════════════════════════════
   * Que le « + » n'apparaisse QUE sur les parties de « Non affectés » (règle du lot 2 : « Pour chaque partie NON
   * encore affectée à une catégorie : un bouton “+” »). Son rôle était alors de RANGER la partie : la carte de
   * création demandait la catégorie, puisque personne ne la connaissait.
   *
   * ═══ 🔴 CE QU'ARNO A TRANCHÉ LE 05/10/2026 ═══════════════════════════════════════════════════════════════════
   * « En face de chaque capsule de contact Propriétaire ou Locataire qui N'A PAS encore de carte de contact : un
   * “+” rouge dans un cercle rouge. Il ouvre la carte de création avec la catégorie PRÉ-REMPLIE. Pas de “+” pour
   * les Tiers indépendants, l'agence ni les clients. Le “+” disparaît dès que la carte existe. »
   *
   * Le « + » ne sert donc plus à RANGER — le glisser-déposer s'en charge — mais à COMPLÉTER : créer la carte de
   * contact qui manque à une partie déjà rangée du côté d'un client. Et le rangement des parties non affectées
   * passe désormais par le glisser ou par le menu « Déplacer vers… ».
   */

  /** AXA est rangée côté PROPRIÉTAIRE par la base — c'est un CONTACT du propriétaire, pas un client. */
  const servirAvecContact = (
    /* 🔴🔴 LOT HISTORIQUE-BIEN-8 — une carte porte son ORIGINE : seule une carte « manuel » (créée par le « + »)
       donne la pastille « fiche ». Une carte « auto » est un pré-remplissage, et la capsule garde son « + ». */
    cartes: { cote: string; adresse: string; verifie: boolean; origine?: 'auto' | 'manuel' }[] = [],
    /* 🔴 LOT HISTORIQUE-BIEN-6 — le rangement de la partie devient réglable : le cas des TIERS INDÉPENDANTS en a
       besoin, et lui seul (par défaut, c'est le contact du propriétaire d'avant ce lot). */
    parties: { adresse: string; categorie: string | null }[] =
      [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }],
    /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — ce que la signature a donné. Vide par défaut : c'est le cas des
       adresses muettes, et c'est alors le NOM qui manque — la seule exigence d'un contact, avec l'e-mail. */
    coordonnees: {
      adresse: string; nom: string | null; telephone: string | null;
      adressePostale?: string | null; codePostal?: string | null; commune?: string | null;
    }[] = [],
  ): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return reponse({ etat: 'ok', geste: null });
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({
          etat: 'ok',
          data: { parties, cartes: cartes.map((c) => ({ origine: 'manuel' as const, ...c })), coordonnees },
        });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
  };

  const PERIODES = new Map([
    ['locataire@fictif.test', { mot: 'du 01/05/2025 au 28/09/2026', du: '2025-05-01', au: '2026-09-28' }],
  ]);

  /**
   * 🔴🔴 LES TROIS CONDITIONS D'ARNO, ÉPROUVÉES ENSEMBLE : un CONTACT (ni client ni agence), d'un côté CLIENT
   * (ni Tiers ni Non affectés), SANS carte. Le propriétaire et la locataire de la fiche sont des clients : ils
   * n'ont pas de « + », et c'est la même règle que celle du glisser — deux définitions de « client » auraient
   * fini par diverger, et le « + » serait apparu sur un propriétaire.
   */
  it('🔴🔴 le « + » cerclé n’est offert qu’au CONTACT d’un côté client, sans carte', async () => {
    servirAvecContact();
    await monter();
    const plus = [...hote.querySelectorAll('.hdb-plus')] as HTMLButtonElement[];
    expect(plus).toHaveLength(1);
    expect(plus[0].className).toContain('hdb-plus--cercle');
    expect(plus[0].getAttribute('aria-label')).toContain('AXA');
    /* …et il est bien DANS la capsule d'AXA, côté Propriétaire. */
    const capsule = plus[0].closest('.hdb-capsule') as HTMLElement;
    expect(capsule.textContent).toContain('AXA');
    /* 🔴 AUCUN « + » SUR UN CLIENT : ni le propriétaire, ni la locataire. */
    const clients = ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .filter((c) => /ROI Nathan|MARTY/.test(c.textContent ?? ''));
    expect(clients.length).toBeGreaterThan(0);
    for (const c of clients) expect(c.querySelector('.hdb-plus')).toBeNull();
  });

  /** 🔴🔴 IL DISPARAÎT DÈS QUE LA CARTE EXISTE — mot d'Arno, et c'est tout l'intérêt du signe. */
  /**
   * 🔴🔴 MIS À JOUR AU LOT HISTORIQUE-BIEN-6, POINT 1 — ET C'EST LE DÉFAUT QU'ARNO A SIGNALÉ TROIS FOIS. Le lot 3
   * disait « le “+” disparaît dès que la carte existe », et ce cas-ci le vérifiait : la capsule se retrouvait
   * alors avec son seul « … », ce qu'Arno a vu sur `estebanfrdpro@gmail.com` (lot-299, carte 1462). Le lot 6 dit
   * ce qui le REMPLACE : une pastille « fiche » qui ouvre la carte — grise si vérifiée, ORANGE sinon.
   */
  /**
   * 🔴🔴 MIS À JOUR AU LOT HISTORIQUE-BIEN-8, POINT 2 : l'orange a disparu. Une carte CRÉÉE donne la pastille
   * « fiche » GRISE, qu'elle ait été vérifiée ou non — il n'y a plus d'état intermédiaire, parce que les cartes
   * « à vérifier » du lot 6 étaient les 481 pré-remplissages, qui ne montent plus dans un carrousel.
   */
  it('🔴🔴 la carte CRÉÉE ⇒ le « + » est REMPLACÉ par la pastille de la fiche, jamais retiré', async () => {
    servirAvecContact([
      { cote: 'proprietaire', adresse: 'assureur@fictif.test', verifie: false, origine: 'manuel' },
    ]);
    await monter();
    const b = hote.querySelector('.hdb-plus') as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.textContent).not.toBe('+');
    expect(b.className).toContain('hdb-plus--fiche');
    /* 🔴 ET PLUS AUCUNE PASTILLE ORANGE N'EXISTE. */
    expect(b.className).not.toContain('a_verifier');
  });

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 1 — UN PRÉ-REMPLISSAGE GARDE LE « + ». Règle d'Arno : « Toute capsule
   * CONTACT sans carte créée (Y COMPRIS AVEC UN PRÉ-REMPLISSAGE) porte le “+” rouge dans un cercle rouge. »
   * MESURÉ : 481 cartes sont dans ce cas en base, dont les deux de lot-290 (Jessica TADEU, Kelly VANKESBEULQUE).
   */
  it('🔴🔴 UNE CARTE SEULEMENT PRÉ-REMPLIE (auto) LAISSE LE « + » : il reste tout à créer', async () => {
    servirAvecContact([
      { cote: 'proprietaire', adresse: 'assureur@fictif.test', verifie: false, origine: 'auto' },
    ]);
    await monter();
    const b = hote.querySelector('.hdb-plus') as HTMLButtonElement;
    expect(b.textContent).toBe('+');
    expect(b.className).toContain('hdb-plus--plus');
  });

  /**
   * 🔴🔴 LE CÔTÉ COMPTE, PAS SEULEMENT L'ADRESSE. Une carte côté LOCATAIRE ne dispense pas d'en avoir une côté
   * PROPRIÉTAIRE, où la partie est rangée : la clé de la table est (bien, côté, adresse). Sans ce contrôle, le
   * « + » aurait disparu à tort, et la carte manquante serait restée invisible.
   */
  it('🔴🔴 une carte de l’autre côté ne fait pas disparaître le « + »', async () => {
    servirAvecContact([{ cote: 'locataire', adresse: 'assureur@fictif.test', verifie: false }]);
    await monter();
    expect(hote.querySelectorAll('.hdb-plus')).toHaveLength(1);
  });

  /** 🔴 PAS DE « + » SUR UN TIERS INDÉPENDANT NI SUR « NON AFFECTÉS » : ils n'ont pas de côté client. */
  /**
   * 🔴🔴 MIS À JOUR AU LOT HISTORIQUE-BIEN-6, POINT 1. Ce cas interdisait le « + » dans LES DEUX bandes ; Arno l'a
   * tranché autrement : « Chaque capsule CONTACT, qu'elle soit côté Propriétaire, côté Locataire ou dans Non
   * affectés, porte […] un “+” ». Seuls les TIERS INDÉPENDANTS en restent privés — ils sont exclus de
   * l'automatisation, et la table des cartes ne peut d'ailleurs pas en porter (son côté est contraint).
   */
  it('🔴🔴 pas de « + » chez les TIERS INDÉPENDANTS ; « Non affectés » en a un', async () => {
    servirAvecContact(undefined, [{ adresse: 'assureur@fictif.test', categorie: 'independant' }]);
    await monter();
    await deplierGroupe('Tiers indépendant');
    const bleu = hote.querySelector('.hdb-groupe--bleu') as HTMLElement;
    expect(bleu.querySelector('.hdb-capsule')).not.toBeNull();
    expect(bleu.querySelector('.hdb-plus')).toBeNull();
  });

  /**
   * 🔴🔴 LA CATÉGORIE EST PRÉ-REMPLIE PAR LE GROUPE D'OÙ L'ON CLIQUE. On sait où la partie est rangée : la
   * redemander serait une question dont l'écran connaît la réponse.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — CE CAS A CHANGÉ DE FORME, PAS D'INTENTION ═══════════════════════════
   *
   * DEMANDE D'ARNO : « Le formulaire du “+” doit être le MÊME que celui des clients. » Ce n'est donc plus une
   * petite carte de quatre champs, mais `FormulaireCarte` — avec sa civilité, son prénom, sa qualité, son adresse
   * postale et sa liste « Téléphones et e-mails ». Ce que le cas vérifie reste le même : l'adresse de la CAPSULE
   * est là, pré-remplie, et la catégorie du groupe d'où l'on clique est déjà choisie.
   *
   * ⚠️ L'ADRESSE N'EST PLUS UN CHAMP EN LECTURE SEULE : elle est devenue une LIGNE de la liste des coordonnées,
   * comme chez un client (et le rappel du haut la redit en clair). L'IDENTITÉ de la carte, elle, ne vient pas de
   * ce champ : le POST envoie `aCreer.adresse`, l'adresse de la capsule — c'est le cas suivant qui le prouve.
   */
  it('🔴🔴 le formulaire s’ouvre avec l’adresse et la catégorie pré-remplies', async () => {
    servirAvecContact(undefined, undefined,
      [{ adresse: 'assureur@fictif.test', nom: 'Sophie DUPONT', telephone: null }]);
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    expect(carte).not.toBeNull();
    /* ① c'est bien LE formulaire des clients : son titre de contact, et ses huit champs. */
    expect(carte.querySelector('.cp-form-titre')?.textContent).toBe('Nouveau contact');
    for (const mot of ['Civilité', 'Prénom', 'Qualité', 'Code postal', 'Commune', 'Téléphones et e-mails']) {
      expect(texte(), mot).toContain(mot);
    }
    /* ② l'adresse de la capsule est là, en coordonnée, et le rappel la redit. */
    const valeurs = [...carte.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
    expect(valeurs.map((v) => v.value)).toContain('assureur@fictif.test');
    expect(carte.querySelector('.cp-rappel')?.textContent).toContain('assureur@fictif.test');
    /* ③ la catégorie du groupe d'où l'on a cliqué est déjà choisie. */
    expect((carte.querySelector('select') as HTMLSelectElement).value).toBe('proprietaire');
    expect(texte()).toContain('Rangée côté propriétaire de ce bien');
    /* …et « Enregistrer » est donc offert d'emblée : plus rien ne manque. */
    expect((parMot('Enregistrer') as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * 🔴🔴 LA RÈGLE D'ARNO, ÉPROUVÉE LÀ OÙ ELLE SE VOIT : « Pour un CONTACT, seuls le NOM et AU MOINS UN E-MAIL
   * sont obligatoires ; les autres champs sont facultatifs, SANS MESSAGE ROUGE. »
   *
   * 🔴 ET C'EST CE QUI REND LE « + » UTILISABLE. La règle des CLIENTS exige huit champs : appliquée ici, elle
   * aurait grisé « Enregistrer » et affiché six mentions rouges sur un contact dont on ne connaît, le plus
   * souvent, que l'adresse e-mail — c'est-à-dire tout l'inverse du geste qu'Arno demande.
   */
  it('🔴🔴 UN CONTACT N’EXIGE QUE LE NOM ET UN E-MAIL — jamais les six champs d’un client', async () => {
    servirAvecContact(undefined, undefined,
      [{ adresse: 'assureur@fictif.test', nom: 'Sophie DUPONT', telephone: null }]);
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    /* La capsule n'a ni code postal, ni commune, ni civilité, ni téléphone : aucune mention rouge pour autant. */
    expect(carte.querySelectorAll('.cp-manque')).toHaveLength(0);
    expect(texte()).not.toContain('Le code postal est obligatoire');
    expect(texte()).not.toContain('Il faut au moins un téléphone');
  });

  /**
   * ⚠️ MAIS LE NOM, LUI, EST EXIGÉ — et c'est le cas le plus fréquent du « + » : une adresse dont on n'a pas su
   * lire le nom. Le formulaire le DIT sous le champ, et « Enregistrer » attend. C'est la règle d'Arno, dans son
   * autre moitié : « seuls le NOM et AU MOINS UN E-MAIL sont obligatoires ».
   */
  it('🔴 SANS NOM TROUVÉ, LE NOM EST RÉCLAMÉ — et lui seul', async () => {
    servirAvecContact();
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    const manques = [...carte.querySelectorAll('.cp-manque')].map((m) => m.textContent);
    expect(manques).toEqual(['Le nom est obligatoire.']);
    expect((parMot('Enregistrer') as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * 🔴🔴 LA CATÉGORIE MANQUANTE BLOQUE, ET LE DIT SOUS SON CHAMP. Depuis « Non affectés », rien n'est déduit : le
   * choix reste vide (pré-cocher au hasard se valide sans être lu), et « Enregistrer » attend.
   */
  it('🔴🔴 sans catégorie, « Enregistrer » reste grisé avec son motif', async () => {
    servirAvecContact(undefined, [],
      [{ adresse: 'assureur@fictif.test', nom: 'Sophie DUPONT', telephone: null }]);
    await monter();
    /* ⚠️ « NON AFFECTÉS » EST REPLIÉ : il faut le déplier pour atteindre son « + ». */
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    await cliquer(gris.querySelector('.hdb-capsule .hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    expect((carte.querySelector('select') as HTMLSelectElement).value).toBe('');
    const bouton = parMot('Enregistrer') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.title).toContain('Choisissez une catégorie');
    expect(carte.querySelector('.cp-manque')?.textContent).toContain('Choisissez une catégorie');
  });

  /** 🔴 LA CATÉGORIE RESTE MODIFIABLE : pré-remplie n'est pas imposée (mot d'Arno au lot 2, inchangé). */
  it('🔴 la catégorie pré-remplie reste modifiable', async () => {
    servirAvecContact();
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const select = hote.querySelector('.hdb-creation select') as HTMLSelectElement;
    await changer(select, 'independant');
    expect(texte()).toContain('rangé une fois pour TOUS les biens');
  });

  /**
   * 🔴🔴 VALIDER POSTE PAR LA MÊME PORTE, PUIS RELIT. Poser la catégorie dans l'état local aurait affiché un
   * rangement que le serveur a peut-être refusé en partie.
   */
  it('🔴🔴 valider poste la catégorie et la carte, puis relit les rangements', async () => {
    const envois: { corps: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        envois.push({ corps: JSON.parse(String(init.body)) as Record<string, unknown> });
        return reponse({ etat: 'ok', carteRefusee: null, geste: null });
      }
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({
          etat: 'ok',
          data: {
            parties: [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }], cartes: [],
            /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — un numéro trouvé en signature : il AMORCE la première ligne
               de la liste, et c'est celle qu'on corrige ci-dessous. */
            coordonnees: [{ adresse: 'assureur@fictif.test', nom: null, telephone: '01 00 00 00 00' }],
          },
        });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — ON SAISIT DANS LE FORMULAIRE DES CLIENTS, et le corps du POST porte
     * désormais la FICHE ENTIÈRE. Les champs se désignent par leur libellé, et non par leur rang : le rang
     * changeait à chaque champ ajouté, et c'est exactement ce qui vient d'arriver.
     */
    const champ = (mot: string): HTMLInputElement => [...carte.querySelectorAll('.cp-champ')]
      .find((l) => (l.textContent ?? '').startsWith(mot))?.querySelector('input') as HTMLInputElement;
    await changer(champ('Nom'), 'Sophie AXA');
    await changer(champ('Qualité'), 'syndic');
    /* ⚠️ LA PREMIÈRE LIGNE EST LE TÉLÉPHONE AMORCÉ, la seconde l'adresse de la capsule — qu'on ne touche pas :
       un contact sans adresse e-mail ne sert plus à rien, et le formulaire le refuse (règle d'Arno). */
    const tel = carte.querySelectorAll('[aria-label="Valeur"]')[0] as HTMLInputElement;
    await changer(tel, '06 11 22 33 44');
    const avant = appels.filter((a) => a.includes('/historique/parties')).length;
    await cliquer(parMot('Enregistrer'));

    expect(envois).toHaveLength(1);
    expect(envois[0].corps).toEqual({
      cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'proprietaire',
      /* 🔴 LE NOM EST MIS EN FORME SOUS LES DOIGTS, comme chez un client : « AXA » passe en capitales. */
      nom: 'Sophie AXA'.toUpperCase(), civilite: null, prenom: null, qualite: 'syndic',
      adressePostale: null, codePostal: null, commune: null, note: null,
      /* 🔴 LA LISTE PART DANS L'ORDRE AFFICHÉ : le téléphone amorcé en premier, puis l'adresse de la capsule. */
      coordonnees: [
        { sorte: 'telephone', libelle: 'Mobile', valeur: '06 11 22 33 44' },
        { sorte: 'email', libelle: 'E-mail', valeur: 'assureur@fictif.test' },
      ],
    });
    expect(appels.filter((a) => a.includes('/historique/parties')).length).toBe(avant + 1);
    expect(hote.querySelector('.hdb-creation')).toBeNull();
  });

  /** 🔴 UN REFUS DU SERVEUR EST AFFICHÉ TEL QUEL, et la carte reste ouverte avec la saisie. */
  it('🔴🔴 un refus du serveur est dit, et rien n’est perdu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return reponse({ etat: 'refus', motif: 'Ce rangement se fait à la main : l’auteur doit être identifié.' });
      }
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({
          etat: 'ok',
          data: { parties: [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }], cartes: [] },
        });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    /* ⚠️ LE NOM EST OBLIGATOIRE POUR UN CONTACT : sans lui, « Enregistrer » est grisé et le refus du serveur ne
       serait jamais demandé. On le renseigne donc, puis on valide — c'est le refus du SERVEUR qu'on éprouve. */
    const nom = [...hote.querySelectorAll('.hdb-creation .cp-champ')]
      .find((l) => (l.textContent ?? '').startsWith('Nom'))?.querySelector('input') as HTMLInputElement;
    await changer(nom, 'AXA');
    await cliquer(parMot('Enregistrer'));
    expect(texte()).toContain('l’auteur doit être identifié');
    expect(hote.querySelector('.hdb-creation')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 « CHACUN AVEC SA PÉRIODE », ET LE CLIC LA RÈGLE ════════════════════════════════════════════════════
   *
   * C'est le geste du lot 1 — choisir la période d'un locataire — à l'endroit où Arno place cette date depuis le
   * lot 2 : dans la capsule. Il est resté au même endroit au lot 3, dans la capsule arrondie.
   */
  it('🔴🔴 la période d’un locataire est dans sa capsule, et son clic règle les dates', async () => {
    await monter({ periodes: PERIODES });
    const bouton = parMot('du 01/05/2025 au 28/09/2026');
    expect(bouton).toBeDefined();
    expect(bouton?.closest('.hdb-capsule')).not.toBeNull();
    await cliquer(bouton);
    const dates = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(dates.map((d) => d.value)).toEqual(['2025-05-01', '2026-09-28']);
    expect(texte()).toContain('du 01/05/2025 au 28/09/2026');
  });

  /**
   * ⚠️ UNE PARTIE SANS BAIL N'AFFICHE AUCUNE PÉRIODE : l'assureur n'en a pas, et lui en inventer une mentirait.
   *
   * ⚠️ LA CLASSE A CHANGÉ AU LOT 4 (`.hdb-periode-mot`) : Arno a demandé que la date passe « en petit texte sur
   * la ligne des compteurs, pas en encadré ». L'encadré portait `.hdb-periode-partie` ; le petit texte porte un
   * autre nom, parce que ce n'est plus le même objet.
   */
  it('🔴 une partie sans bail n’affiche aucune période', async () => {
    await monter({ periodes: PERIODES });
    expect(hote.querySelectorAll('.hdb-periode-mot')).toHaveLength(1);
    /* …et plus aucun encadré : l'ancien objet a disparu avec son cadre. */
    expect(hote.querySelectorAll('.hdb-periode-partie')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-ter 🔴🔴 LOT HISTORIQUE-BIEN-2 — LA BARRE DE COULEUR, ET SA LÉGENDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-ter 🔴🔴 la barre de couleur à droite de chaque mail', () => {
  /**
   * Le jeu d'essai porte deux mails REÇUS : l'un du propriétaire (rangé), l'autre d'AXA (non affectée). La
   * barre doit donc être rouge sur l'un et grise sur l'autre.
   */
  it('🔴🔴 chaque mail porte la couleur de la catégorie de son expéditeur', async () => {
    await monter();
    const barres = [...hote.querySelectorAll('.hdb-barre')] as HTMLElement[];
    expect(barres).toHaveLength(2);
    const classes = barres.map((b) => b.className);
    expect(classes.some((c) => c.includes('hdb-barre--rouge'))).toBe(true);
    expect(classes.some((c) => c.includes('hdb-barre--gris'))).toBe(true);
  });

  /**
   * 🔴🔴 LA BARRE EST PORTÉE PAR L'ENVELOPPE, ET `LigneVie` N'EST PAS TOUCHÉE. Ce composant sert aussi la fiche
   * d'un locataire : lui ajouter une prop de couleur l'aurait modifié pour les deux écrans, alors que la
   * consigne est de le réutiliser tel quel. L'épreuve vérifie que la classe vit sur le `li` d'ancrage — celui
   * qui portait déjà « Aller au message » — et non sur la ligne elle-même.
   */
  it('🔴🔴 la barre vit sur l’enveloppe du mail, pas dans « LigneVie »', async () => {
    await monter();
    const barre = hote.querySelector('.hdb-barre') as HTMLElement;
    expect(barre.tagName).toBe('LI');
    expect(barre.className).toContain('hdb-ancre');
    expect(barre.id).toMatch(/^hdb-mail-\d+$/);
    // …et aucune ligne de courrier ne porte elle-même une classe de barre.
    expect(hote.querySelector('.vdb-ligne.hdb-barre')).toBeNull();
    // 🔴 `LigneVie` reste importée, pas recopiée (le garde ⑥ l'éprouve aussi) : aucune prop de couleur.
    expect(SRC).not.toContain('<LigneVie l={l} ton');
  });

  /** 🔴 UN MAIL QUE NOUS AVONS ÉCRIT N'A AUCUNE COULEUR — la classe existe, la teinte est transparente. */
  it('🔴🔴 un mail sortant porte la classe « nous », sans couleur', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: [ligne({ messageId: 9, sens: 'envoye', de: 'gestion@criterimmo.fr' })],
          suite: false, entete: { nbMails: 1 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    expect((hote.querySelector('.hdb-barre') as HTMLElement).className).toContain('hdb-barre--nous');
  });

  /**
   * 🔴🔴 LA LÉGENDE EST LÀ, ET CHAQUE ENTRÉE PORTE SON MOT. Une couleur sans légende n'est pas une information :
   * elle se devine, et l'on se trompe. Le mot informe, la couleur appuie — règle de tout ce module.
   */
  it('🔴🔴 une légende discrète, au-dessus du listing, avec les cinq mots', async () => {
    await monter();
    const legende = hote.querySelector('.hdb-legende-barres') as HTMLElement;
    expect(legende).not.toBeNull();
    for (const mot of ['propriétaire', 'locataire', 'tiers indépendant', 'non affecté', 'nous']) {
      expect(legende.textContent).toContain(mot);
    }
    /* ⚠️ LA LÉGENDE EST AU-DESSUS DU LISTING : elle précède le premier mail dans le document. */
    const liste = hote.querySelector('.hdb-liste') as HTMLElement;
    expect(legende.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /** ⚠️ AUCUN MAIL ⇒ AUCUNE LÉGENDE : expliquer des couleurs qu'on ne voit pas est du bruit. */
  it('⚠️ pas de listing, pas de légende', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: { lignes: [], suite: false, entete: { nbMails: 0 }, interlocuteurs: [], interlocuteursTronques: false },
      });
    }));
    await monter();
    expect(hote.querySelector('.hdb-legende-barres')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-quater 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 0 — LA SORTIE VERS L'ÉCRAN PLEIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-quater 🔴🔴 « Écran historique complet »', () => {
  /**
   * DÉCISION D'ARNO (05/10/2026), en réponse à ma question du lot précédent : « L'écran plein “Historique” reste
   * accessible : petit lien discret “Écran historique complet” en bas du nouveau bloc. »
   *
   * 🔴 POURQUOI CETTE ÉPREUVE EXISTE. Au lot 2, « Tout l'historique des échanges → » a cessé d'ouvrir cet écran
   * pour défiler vers le bloc — demande d'Arno. La fiche d'un bien perdait alors sa dernière porte vers l'écran
   * plein. Ce cas est le garde qui empêche cette porte de se refermer une seconde fois sans qu'on le voie.
   */
  it('🔴🔴 le lien est rendu, en bas du bloc, et il appelle l’écran plein', async () => {
    const vers = vi.fn();
    await monter({ onEcranComplet: vers });
    const lien = parMot('Écran historique complet');
    expect(lien).toBeDefined();
    await cliquer(lien);
    expect(vers).toHaveBeenCalledTimes(1);

    /* ⚠️ EN BAS : il suit le listing dans le document. En tête, il aurait proposé de quitter le bloc avant de
       l'avoir lu. */
    const liste = hote.querySelector('.hdb-liste') as HTMLElement;
    expect(liste.compareDocumentPosition(lien as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /** ⚠️ SANS DESTINATION, PAS DE LIEN : un bouton qui ne mène nulle part est pire qu'un bouton absent. */
  it('⚠️ sans destination, le lien n’est pas rendu', async () => {
    await monter();
    expect(parMot('Écran historique complet')).toBeUndefined();
  });

  /** 🔴 ET LA FICHE SAIT OÙ MENER : elle passe la cible du bien, celle que l'écran plein attend. */
  it('🔴 la fiche branche la sortie sur la cible du bien', () => {
    expect(ANNUAIRE).toContain("onHistorique({ sorte: 'lot', cle: f.numero, id: null })");
    /* …et le bouton du haut continue de défiler vers l'ancre, comme Arno l'a reconfirmé. */
    expect(ANNUAIRE).toContain("ancreVie.current?.scrollIntoView({ block: 'start' })");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-quinquies 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 1 — L'ENCART DÉFILE, ET SA PUCE LE DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-quinquies 🔴🔴 l’encart ne grandit jamais : il défile', () => {
  /**
   * ⚠️ JSDOM NE MESURE RIEN : `offsetTop`, `offsetHeight` et `clientHeight` y valent tous zéro, et aucune
   * hauteur de CSS n'est calculée. On les POSE donc, sur les prototypes, pour la durée du cas — c'est la seule
   * façon d'éprouver une puce dont l'existence dépend d'une mesure. Ce qui est vérifié ici, c'est le CÂBLAGE
   * (mesure → module pur → rendu) ; l'arithmétique elle-même est éprouvée dans `historiqueBien.test.ts` ⑬, et
   * la hauteur réelle l'a été dans Chrome.
   */
  const poserLesMesures = (hauteurVisible: number, scrollTop = 0): (() => void) => {
    const li = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    const lh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const ch = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
    let rang = 0;
    const rangs = new WeakMap<Element, number>();
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (!rangs.has(this)) rangs.set(this, rang++);
        return (rangs.get(this) ?? 0) * 46;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 44 });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => hauteurVisible });
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, value: scrollTop, writable: true });
    return () => {
      if (li) Object.defineProperty(HTMLElement.prototype, 'offsetTop', li);
      if (lh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', lh);
      if (ch) Object.defineProperty(Element.prototype, 'clientHeight', ch);
    };
  };

  /** Huit parties non affectées : de quoi dépasser les trois lignes visibles. */
  const servirHuit = (): void => {
    const huit = Array.from({ length: 8 }, (_, i) => inter({ adresse: `p${i}@fictif.test`, nbMails: 8 - i }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: huit, interlocuteursTronques: false,
        },
      });
    }));
  };

  /**
   * 🔴🔴 LA LISTE EST DANS UN CONTENEUR QUI DÉFILE, et la hauteur est bornée par un jeton nommé — trois capsules
   * de 44 px et leurs interlignes. Sans borne, l'encart du bien 155 (56 adresses) poussait le fil à plus de deux
   * écrans du tableau de bord : c'est le défaut que ce point corrige.
   */
  it('🔴🔴 la liste des parties vit dans un conteneur défilant, à hauteur bornée', async () => {
    servirHuit();
    await monter({ categories: new Map() });
    /* ⚠️ « Non affectés » PAR SON TON, et non « le premier groupe » : depuis le lot 5 point 1, les deux encarts
       sont rendus même vides, et le premier `.hdb-groupe` est l'encart « Propriétaire ». */
    const groupe = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    /* Le groupe est REPLIÉ au-delà de six (règle du lot 1) : on le déplie pour voir la liste. */
    await cliquer(groupe.querySelector('.hdb-replier') ?? undefined);
    const boite = hote.querySelector('.hdb-defile') as HTMLElement;
    expect(boite).not.toBeNull();
    expect(boite.querySelector('ul.hdb-personnes')).not.toBeNull();
    expect(SRC).toContain('max-height:var(--hdb-liste-h)');
    expect(SRC).toContain('overflow-y:auto');
    /* ⚠️ `overscroll-behavior: contain` : sans lui, arriver en bas de l'encart emporte la page entière. */
    expect(SRC).toContain('overscroll-behavior:contain');
  });

  /**
   * 🔴🔴 LA PUCE DIT LE NOMBRE CACHÉ, et c'est un BOUTON : « un clic fait défiler » (Arno). Une flèche purement
   * indicative aurait obligé à viser une barre de défilement de quelques pixels — il n'y en a aucune sur un
   * téléphone.
   */
  it('🔴🔴 « ↓ 5 autres » apparaît quand cinq capsules sont cachées, et c’est un bouton', async () => {
    const rendre = poserLesMesures(138);
    try {
      servirHuit();
      await monter({ categories: new Map() });
      await cliquer((hote.querySelector('.hdb-groupe--gris') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
      const puce = hote.querySelector('.hdb-puce--bas') as HTMLButtonElement;
      expect(puce).not.toBeNull();
      expect(puce.tagName).toBe('BUTTON');
      expect(puce.textContent).toBe('↓ 5 autres');
      /* ⚠️ L'INTITULÉ POUR LE LECTEUR D'ÉCRAN DIT LE GROUPE : « ↓ 5 autres » seul ne dit pas de quoi. */
      expect(puce.getAttribute('aria-label')).toContain('Non affectés');
      /* …et aucune puce du haut : on n'a pas encore défilé. */
      expect(hote.querySelector('.hdb-puce--haut')).toBeNull();
    } finally { rendre(); }
  });

  /** 🔴 UNE LISTE QUI TIENT ENTIÈREMENT N'A AUCUNE PUCE : rien à inviter. */
  it('🔴 un encart qui montre tout n’a pas de puce', async () => {
    const rendre = poserLesMesures(2000);
    try {
      servirHuit();
      await monter({ categories: new Map() });
      await cliquer((hote.querySelector('.hdb-groupe--gris') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
      expect(hote.querySelector('.hdb-puce--bas')).toBeNull();
      expect(hote.querySelector('.hdb-puce--haut')).toBeNull();
    } finally { rendre(); }
  });

  /** 🔴 UNE FOIS DÉFILÉ, LA PUCE DU HAUT APPARAÎT — « Même chose vers le haut si on a défilé » (Arno). */
  it('🔴🔴 une fois défilé, « ↑ remonter » apparaît', async () => {
    const rendre = poserLesMesures(138, 92);
    try {
      servirHuit();
      await monter({ categories: new Map() });
      await cliquer((hote.querySelector('.hdb-groupe--gris') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
      const haut = hote.querySelector('.hdb-puce--haut') as HTMLButtonElement;
      expect(haut).not.toBeNull();
      expect(haut.textContent).toBe('↑ remonter');
    } finally { rendre(); }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-sexies 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — CAPSULES, GLISSER-DÉPOSER, SYNCHRONISATION, ANNULER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-sexies 🔴🔴 les capsules se déplacent d’une catégorie à l’autre', () => {
  /** Les écritures parties au serveur, dans l'ordre : c'est ce qui prouve « une seule porte, aucun second chemin ». */
  let envois: { url: string; corps: Record<string, unknown> }[] = [];

  const servir = (): void => {
    envois = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        envois.push({ url: String(url), corps: JSON.parse(String(init.body)) as Record<string, unknown> });
        return reponse({
          etat: 'ok',
          geste: {
            categoriesPosees: [101], categoriesRetirees: [100], cartesPosees: [202], cartesRetirees: [],
          },
        });
      }
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
  };

  /** Une capsule par son nom affiché. */
  const capsule = (nom: string): HTMLElement | undefined =>
    ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .find((x) => (x.textContent ?? '').includes(nom));

  /**
   * ══ 🔴🔴 LE GLISSER-DÉPOSER, SIMULÉ COMME LE NAVIGATEUR LE FAIT ═══════════════════════════════════════════════
   *
   * ⚠️ JSDOM N'A PAS DE `DataTransfer` : on en pose un minimal. Ce qui est éprouvé, c'est le CÂBLAGE des trois
   * temps du geste (`dragstart` → `dragover` → `drop`) et ce qui PART au serveur — pas la mécanique du
   * navigateur, qui n'est pas la nôtre.
   */
  const transfert = (): DataTransfer => {
    const m = new Map<string, string>();
    return {
      setData: (k: string, v: string) => { m.set(k, v); },
      getData: (k: string) => m.get(k) ?? '',
      effectAllowed: 'move',
    } as unknown as DataTransfer;
  };

  async function glisserVers(nomCapsule: string, titreGroupe: string): Promise<void> {
    const dt = transfert();
    const source = capsule(nomCapsule) as HTMLElement;
    const zone = ([...hote.querySelectorAll('.hdb-groupe')] as HTMLElement[])
      .find((x) => (x.textContent ?? '').includes(titreGroupe)) as HTMLElement;
    await act(async () => {
      source.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
    });
    await act(async () => {
      zone.dispatchEvent(Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    await act(async () => {
      zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
  }

  /**
   * 🔴🔴 UN CONTACT SE DÉPLACE, ET LE DÉPLACEMENT PASSE PAR LA MÊME PORTE QUE LE « + ». Arno :
   * « SYNCHRONISATION STRICTE : un déplacement passe par la MÊME porte d'écriture que le choix de catégorie du
   * “+” (aucun second chemin). »
   */
  it('🔴🔴 glisser un contact vers « Locataire » poste la catégorie, par la porte unique', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    await glisserVers('AXA', 'Locataire');

    expect(envois).toHaveLength(1);
    expect(envois[0].url).toContain('/api/admin/gestion/historique/parties');
    expect(envois[0].corps).toEqual({
      cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'locataire',
    });
    /* ⚠️ NI NOM NI TÉLÉPHONE : la carte, si elle existe, emporte les siens — c'est le SERVEUR qui les reporte.
       Les envoyer d'ici aurait fait un second endroit où ce report se décide. */
    expect(Object.keys(envois[0].corps).sort()).toEqual(['adresse', 'categorie', 'cible']);
  });

  /** 🔴 ON RELIT APRÈS : c'est la relecture qui fait changer la capsule de groupe, et non une devinette locale. */
  it('🔴🔴 après le déplacement, les rangements sont relus', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    const avant = appels.filter((a) => a.includes('/historique/parties')).length;
    await glisserVers('AXA', 'Locataire');
    expect(appels.filter((a) => a.includes('/historique/parties')).length).toBe(avant + 1);
  });

  /**
   * 🔴🔴 LE MESSAGE « Fanny Rosky → Locataire » ET SON « ANNULER ». Le nom ET la destination : c'est la seule
   * phrase qui permette de vérifier qu'on n'a pas lâché la capsule une rangée trop bas.
   */
  it('🔴🔴 le message d’après-dépôt nomme la partie et sa destination, avec « Annuler »', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    await glisserVers('AXA', 'Locataire');
    const fait = hote.querySelector('.hdb-fait') as HTMLElement;
    expect(fait).not.toBeNull();
    expect(fait.textContent).toContain('AXA → Locataire');
    expect(parMot('Annuler')).toBeDefined();
  });

  /**
   * 🔴🔴 « ANNULER » DÉFAIT LE GESTE PAR SES IDENTIFIANTS, et non en reposant la catégorie d'avant : reposer
   * aurait figé une PROPOSITION en décision humaine, que l'automatisation ne reprendrait plus jamais.
   */
  it('🔴🔴 « Annuler » renvoie le geste, et rien d’autre', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    await glisserVers('AXA', 'Locataire');
    await cliquer(parMot('Annuler'));

    expect(envois).toHaveLength(2);
    expect(envois[1].corps.action).toBe('annuler');
    expect(envois[1].corps.geste).toEqual({
      categoriesPosees: [101], categoriesRetirees: [100], cartesPosees: [202], cartesRetirees: [],
    });
    /* ⚠️ AUCUNE CATÉGORIE N'EST REPOSÉE : le corps de l'annulation ne porte pas de `categorie`. */
    expect(envois[1].corps.categorie).toBeUndefined();
    // …et le message disparaît.
    expect(hote.querySelector('.hdb-fait')).toBeNull();
  });

  /**
   * 🔴🔴 UN CLIENT NE SE DÉPLACE PAS : la capsule n'est pas `draggable`, elle porte le motif en info-bulle, et
   * un `dragstart` forcé n'envoie RIEN. Les trois ensemble, parce qu'une seule des trois se contourne.
   */
  it('🔴🔴 une capsule de CLIENT refuse le déplacement, et dit pourquoi', async () => {
    servir();
    await monter();
    const client = capsule('M. ROI Nathan') as HTMLElement;
    expect(client.getAttribute('draggable')).toBe('false');
    expect(client.getAttribute('title')).toBe('Client du bien — non déplaçable');
    expect(client.className).toContain('hdb-capsule--fixe');

    await glisserVers('M. ROI Nathan', 'Non affectés');
    expect(envois).toHaveLength(0);
  });

  /** 🔴 ET AUCUN MENU « DÉPLACER VERS… » SUR UN CLIENT : le chemin clavier est fermé lui aussi. */
  it('🔴🔴 pas de menu « Déplacer vers… » sur un client', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    const client = capsule('M. ROI Nathan') as HTMLElement;
    expect(client.querySelector('.hdb-menu-bouton')).toBeNull();
    const contact = capsule('AXA') as HTMLElement;
    expect(contact.querySelector('.hdb-menu-bouton')).not.toBeNull();
  });

  /**
   * 🔴🔴 LE CHEMIN CLAVIER EXISTE ET MÈNE AU MÊME ENDROIT. Le glisser-déposer n'existe ni au clavier ni sous un
   * doigt : ce menu n'est pas une concession, c'est le second chemin indispensable — et il passe par la MÊME
   * porte d'écriture.
   */
  it('🔴🔴 le menu « Déplacer vers… » poste exactement comme le glisser', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    const contact = capsule('AXA') as HTMLElement;
    await cliquer(contact.querySelector('.hdb-menu-bouton') ?? undefined);
    const items = [...hote.querySelectorAll('.hdb-menu-item')] as HTMLButtonElement[];
    /* ⚠️ TROIS DESTINATIONS, SANS CELLE D'ORIGINE : AXA est « Non affectés », donc les trois autres. */
    expect(items.map((x) => x.textContent)).toEqual(['Propriétaire', 'Locataire', 'Tiers indépendant']);
    await cliquer(items[1]);
    expect(envois[0].corps).toEqual({
      cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'locataire',
    });
  });

  /** 🔴 LES DEUX BANDES SONT REPLIÉES PAR DÉFAUT, pleine largeur, sous les deux encarts (demande d'Arno). */
  it('🔴🔴 « Tiers indépendant » et « Non affectés » sont des bandes repliées', async () => {
    servir();
    await monter();
    const bandes = [...hote.querySelectorAll('.hdb-groupe--bande')] as HTMLElement[];
    const titres = bandes.map((b) => (b.querySelector('.hdb-replier')?.textContent ?? '').trim());
    expect(titres.some((t) => t.includes('Non affectés'))).toBe(true);
    for (const b of bandes) {
      expect(b.querySelector('.hdb-replier')?.getAttribute('aria-expanded')).toBe('false');
    }
    /* …et les encarts, eux, sont dans la grille à deux colonnes. */
    expect(hote.querySelector('.hdb-encarts')).not.toBeNull();
    expect(hote.querySelectorAll('.hdb-groupe--encart').length).toBeGreaterThan(0);
  });

  /**
   * 🔴🔴 UNE BANDE REPLIÉE RESTE UNE ZONE DE DÉPÔT, ET S'OUVRE AU SURVOL. Sans cela, déposer dans « Tiers
   * indépendant » aurait demandé de la déplier AVANT de commencer le glisser — c'est-à-dire de savoir où l'on
   * va avant de partir.
   */
  it('🔴🔴 une bande repliée s’ouvre au survol pendant un glisser, et accepte le dépôt', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    const dt = transfert();
    const source = capsule('AXA') as HTMLElement;

    /**
     * ⚠️ LA BANDE « TIERS INDÉPENDANT » EST VIDE DANS CE JEU D'ESSAI, et elle n'est donc rendue QUE pendant un
     * glisser — c'est voulu : une zone de dépôt qui n'existe pas tant qu'elle est vide est une zone où l'on ne
     * peut jamais rien déposer, et c'est le premier geste qu'on voudrait faire sur un bien tout neuf. On
     * commence donc le glisser, PUIS on la cherche.
     */
    await act(async () => {
      source.dispatchEvent(Object.assign(new Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
    });
    const bande = ([...hote.querySelectorAll('.hdb-groupe--bande')] as HTMLElement[])
      .find((x) => (x.textContent ?? '').includes('Tiers indépendant')) as HTMLElement;
    expect(bande).not.toBeUndefined();
    expect(bande.querySelector('.hdb-replier')?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      bande.dispatchEvent(Object.assign(
        new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    const ouverte = ([...hote.querySelectorAll('.hdb-groupe--bande')] as HTMLElement[])
      .find((x) => (x.textContent ?? '').includes('Tiers indépendant')) as HTMLElement;
    expect(ouverte.querySelector('.hdb-replier')?.getAttribute('aria-expanded')).toBe('true');
    /* 🔴 ET ELLE SE SURLIGNE DANS SA COULEUR (demande d'Arno). */
    expect(ouverte.className).toContain('hdb-groupe--cible');
  });

  /** ⚠️ ON NE SE DÉPOSE PAS SUR SON PROPRE GROUPE : poser un rangement identique gèlerait une proposition. */
  it('⚠️ déposer sur son propre groupe n’écrit rien', async () => {
    servir();
    await monter();
    await deplierGroupe('Non affectés');
    await glisserVers('AXA', 'Non affectés');
    expect(envois).toHaveLength(0);
  });

  /** ⚠️ UN REFUS DU SERVEUR EST DIT, et aucun message de réussite n'est affiché. */
  it('⚠️ un refus du serveur est affiché tel quel', async () => {
    envois = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return reponse({ etat: 'refus', motif: 'Adresse illisible.' });
      }
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    await deplierGroupe('Non affectés');
    await glisserVers('AXA', 'Locataire');
    expect(texte()).toContain('Adresse illisible.');
    expect(hote.querySelector('.hdb-fait')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-septies 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LES DEUX LISERÉS, ET LE RETOUR EXACT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-septies 🔴🔴 les liserés des deux côtés, et revenir exactement', () => {
  /**
   * 🔴🔴 LES DEUX LISERÉS SONT DÉCLARÉS ENSEMBLE, dans la même règle : Arno veut « même épaisseur, même couleur,
   * même arrondi » des deux côtés. Deux déclarations séparées auraient pu divergEr d'un pixel, et c'est
   * exactement ce qu'on ne verrait qu'une fois livré.
   */
  it('🔴🔴 chaque mail porte son liseré à GAUCHE et à DROITE', () => {
    expect(SRC).toContain('.hdb-barre{border-left:3px solid transparent;border-right:3px solid transparent');
    for (const ton of ['rouge', 'vert', 'bleu']) {
      expect(SRC).toContain(`.hdb-barre--${ton}{border-left-color:`);
      expect(SRC).toContain('border-right-color:');
    }
    /* 🔴 L'AGENCE RESTE SANS COULEUR, DES DEUX CÔTÉS : les bords restent transparents, donc la largeur du
       listing ne saute pas d'un mail à l'autre — ce qui serait pire qu'une couleur de trop. */
    expect(SRC).toContain('.hdb-barre--nous{border-left-color:transparent;border-right-color:transparent}');
  });

  /** 🔴 LE LIBELLÉ D'ARNO, DANS LE COMPOSANT PARTAGÉ : « Voir la conversation d'origine → ». */
  it('🔴 « Voir la conversation d’origine → » remplace « Ouvrir l’échange → »', () => {
    const vie = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
    expect(vie).toContain('Voir la conversation d’origine →');
    expect(vie).not.toContain('Ouvrir l’échange →');
  });

  /**
   * ══ 🔴🔴 PARTIR EN POSANT DE QUOI REVENIR ═════════════════════════════════════════════════════════════════════
   *
   * L'ORDRE EST TOUT LE MÉCANISME : on range l'état et on pose le jeton sur l'adresse COURANTE — celle de la
   * fiche — AVANT de naviguer. L'entrée d'historique qu'on quitte porte alors le jeton, et « Précédent » y
   * revient avec de quoi tout retrouver. Poser le jeton après aurait écrit sur l'adresse de la CONVERSATION.
   */
  it('🔴🔴 ouvrir une conversation range l’état et pose le jeton AVANT de naviguer', async () => {
    const ordre: string[] = [];
    const jetons: string[] = [];
    await monter({
      onPoserJeton: (j) => { jetons.push(j); ordre.push('jeton'); },
      onOuvrirFil: () => { ordre.push('navigation'); },
    });
    /* On déplie un mail pour atteindre « Voir la conversation d'origine → ». */
    await cliquer(hote.querySelector('.vdb-ligne') ?? undefined);
    await cliquer(parMot('Voir la conversation d’origine'));

    expect(ordre).toEqual(['jeton', 'navigation']);
    expect(jetons).toHaveLength(1);
    /* 🔴 ET L'ÉTAT EST BIEN RANGÉ SOUS CETTE CLÉ, avec la fiche, pour pouvoir être vérifié au retour. */
    const brut = window.sessionStorage.getItem(`hdb-retour:${jetons[0]}`);
    expect(brut).not.toBeNull();
    const e = JSON.parse(String(brut)) as { fiche: string; mail: number | null };
    expect(e.fiche).toBe('155');
    /* ⚠️ C'EST LE MAIL DÉPLIÉ, ET LE PREMIER DU FIL EST LE PLUS RÉCENT (ordre par défaut) : le message 2, du
       15/03. Le ranger permet au retour de le surligner — c'est exactement ce qu'Arno demande. */
    expect(e.mail).toBe(2);
  });

  /**
   * 🔴🔴 AU RETOUR, TOUT EST REPRIS : période, parties cochées, options, recherche — et le mail d'où l'on est
   * parti est surligné.
   */
  it('🔴🔴 revenir avec un jeton reprend l’écran exact', async () => {
    window.sessionStorage.setItem('hdb-retour:J1', JSON.stringify({
      fiche: '155',
      reglages: {
        periode: { sorte: 'dates', du: '2025-05-01', au: '2026-09-28' },
        parties: ['assureur@fictif.test'],
        toutesLesParties: false,
        pieces: 'avec',
        ordre: 'ancien',
        grouper: false,
        texte: 'quittance',
        evenementOuvert: false,
      },
      defile: 0, mail: 2, page: 0,
    }));
    await monter({ jeton: 'J1' });

    /* La période est reprise, et elle est ÉCRITE en clair. */
    expect(texte()).toContain('du 01/05/2025 au 28/09/2026');
    /* La recherche est reprise, dans le champ ET dans les réglages. */
    expect((hote.querySelector('.hdb-champ-recherche') as HTMLInputElement).value).toBe('quittance');
    /* Les options sont reprises. */
    expect(parMot('Avec')?.getAttribute('aria-pressed')).toBe('true');
    expect(parMot('Plus ancien en haut')).toBeDefined();
    /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — l'interrupteur n'existe plus ; ce qui revient est la PARTIE cochée,
       et la ligne d'état le dit. C'est plus fort que l'ancienne vérification : elle ne regardait qu'une case. */
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('1 partie cochée');
    /* 🔴 LE MAIL D'OÙ L'ON EST PARTI EST SURLIGNÉ. */
    const surlignee = hote.querySelector('.hdb-ancre--surlignee') as HTMLElement;
    expect(surlignee).not.toBeNull();
    expect(surlignee.id).toBe('hdb-mail-2');
  });

  /**
   * 🔴🔴 UN JETON QUI DÉSIGNE L'ÉTAT D'UN **AUTRE** BIEN EST ÉCARTÉ, pas appliqué. C'est le genre de confusion
   * qu'un copier-coller d'adresse produit tout seul — et appliquer la période d'un autre logement serait un
   * mensonge d'écran.
   */
  it('🔴🔴 un jeton d’un autre bien est ignoré', async () => {
    window.sessionStorage.setItem('hdb-retour:J2', JSON.stringify({
      fiche: '999',
      reglages: {
        periode: { sorte: 'dates', du: '2020-01-01', au: '2020-12-31' },
        parties: [], toutesLesParties: true, pieces: 'toutes', ordre: 'recent',
        grouper: false, texte: '', evenementOuvert: false,
      },
      defile: 0, mail: null, page: 0,
    }));
    await monter({ jeton: 'J2' });
    expect(texte()).toContain('tous les échanges, sans borne de date');
    expect(texte()).not.toContain('du 01/01/2020');
  });

  /** ⚠️ UN JETON INCONNU N'EMPÊCHE RIEN : l'écran s'ouvre tel quel, jamais en erreur. */
  it('⚠️ un jeton inconnu ouvre l’écran par défaut', async () => {
    await monter({ jeton: 'JAMAIS-VU' });
    expect(texte()).toContain('tous les échanges, sans borne de date');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-octies 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LA RANGÉE D'OPTIONS, ET LA RECHERCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-octies 🔴🔴 une seule rangée d’options, et la recherche dans l’affiché', () => {
  const chercher = async (q: string): Promise<void> => {
    const champ = hote.querySelector('.hdb-champ-recherche') as HTMLInputElement;
    await changer(champ, q);
    /* ⚠️ LE DÉLAI DE FRAPPE : 250 ms avant que le réglage ne bouge. On l'avance. */
    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
  };

  /**
   * 🔴🔴 LA RANGÉE PORTE LES CINQ CONTRÔLES, ET CHACUN EST UN GROUPE INDIVISIBLE. « Aucun bouton qui passe seul
   * à la ligne » (Arno) est tenu par la STRUCTURE : c'est entre les groupes que la rangée se casse. Un
   * `flex-wrap` sur des boutons nus aurait laissé « Sans » tomber seul sous ses deux voisins.
   */
  it('🔴🔴 une rangée, cinq groupes, et des hauteurs identiques', async () => {
    await monter();
    const rangee = hote.querySelector('.hdb-rangee') as HTMLElement;
    expect(rangee).not.toBeNull();
    expect(rangee.querySelectorAll('.hdb-opt').length).toBe(5);
    /* La loupe, le champ, et le ✕ vivent dans le MÊME cadre — comme une messagerie. */
    const rech = rangee.querySelector('.hdb-opt--recherche') as HTMLElement;
    expect(rech.querySelector('.hdb-loupe')).not.toBeNull();
    expect((rech.querySelector('.hdb-champ-recherche') as HTMLInputElement).placeholder)
      .toBe('Rechercher dans les mails affichés…');
    /* 🔴 UNE SEULE HAUTEUR, NOMMÉE UNE FOIS : trois valeurs recopiées auraient désaligné la rangée. */
    expect(SRC).toContain('--hdb-h:38px');
    expect(SRC).toContain('height:var(--hdb-h)');
  });

  /** ⚠️ LE ✕ N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À EFFACER, et il efface vraiment. */
  it('🔴🔴 le ✕ apparaît avec le texte, et l’efface', async () => {
    await monter();
    expect(hote.querySelector('.hdb-effacer')).toBeNull();
    await chercher('quittance');
    expect(hote.querySelector('.hdb-effacer')).not.toBeNull();
    await cliquer(hote.querySelector('.hdb-effacer') ?? undefined);
    expect((hote.querySelector('.hdb-champ-recherche') as HTMLInputElement).value).toBe('');
    expect(hote.querySelector('.hdb-effacer')).toBeNull();
  });

  /**
   * ══ 🔴🔴 LA RECHERCHE NE PART PLUS AU SERVEUR : ELLE FILTRE L'ÉCRAN ══════════════════════════════════════════
   *
   * Arno : « UNIQUEMENT dans la sélection déjà affichée ». L'épreuve vérifie les deux moitiés : aucune requête
   * ne porte `q=`, et le fil se réduit à l'écran.
   */
  it('🔴🔴 elle filtre les mails affichés, sans rien demander au serveur', async () => {
    await monter();
    expect(hote.querySelectorAll('.hdb-ancre')).toHaveLength(2);
    const avantFil = appels.filter((a) => a.includes('/historique?') || a.includes('/historique&')).length;
    /* ⚠️ « février » EST DANS L'OBJET DU SEUL MAIL 1 — « quittance », lui, est dans l'aperçu des DEUX (le jeu
       d'essai leur donne le même corps). Un mot non discriminant aurait fait passer l'épreuve sans rien prouver. */
    await chercher('fevrier');
    expect(hote.querySelectorAll('.hdb-ancre')).toHaveLength(1);
    expect(hote.querySelector('.hdb-ancre')?.id).toBe('hdb-mail-1');
    /**
     * 🔴 AUCUNE REQUÊTE DE FIL DE PLUS, ET AUCUN `q=` : la recherche ne va plus chercher, elle retire.
     *
     * ⚠️ ON COMPTE LES REQUÊTES DE **FIL**, ET NON TOUTES — et la nuance est une vérification, pas une
     * tolérance. Le statut Drive des pièces, lui, EST redemandé : le résumé suit les mails visibles, donc la
     * liste des pièces change. Compter toutes les requêtes aurait fait échouer l'épreuve sur un comportement
     * juste, et m'aurait fait « corriger » ce qui ne l'était pas.
     */
    expect(appels.filter((a) => a.includes('/historique?') || a.includes('/historique&')).length)
      .toBe(avantFil);
    expect(appels.some((a) => a.includes('q='))).toBe(false);
  });

  /** 🔴 « N MAILS SUR M », EN DIRECT — et rien quand on ne cherche pas. */
  it('🔴🔴 le compteur « N mails sur M » apparaît et se met à jour', async () => {
    await monter();
    expect(hote.querySelector('.hdb-compte-recherche')).toBeNull();
    await chercher('fevrier');
    expect(hote.querySelector('.hdb-compte-recherche')?.textContent).toBe('1 mail sur 2');
    await chercher('bonjour');
    expect(hote.querySelector('.hdb-compte-recherche')?.textContent).toBe('2 mails sur 2');
  });

  /** 🔴🔴 LES MOTS TROUVÉS SONT SURLIGNÉS DANS L'APERÇU, par des `<mark>` posés par React — jamais du HTML. */
  it('🔴🔴 les mots trouvés sont surlignés dans l’aperçu', async () => {
    await monter();
    await chercher('quittance');
    const marques = [...hote.querySelectorAll('mark.vdb-trouve')] as HTMLElement[];
    expect(marques.length).toBeGreaterThan(0);
    for (const x of marques) expect(x.textContent?.toLowerCase()).toBe('quittance');
  });

  /** 🔴 ACCENTS ET MAJUSCULES IGNORÉS, à l'écran comme dans le module pur. */
  /** 🔴 « FÉVRIER » sans accent, en majuscules, avec accent : les trois trouvent le même mail. */
  it('🔴🔴 accents et majuscules ignorés, à l’écran aussi', async () => {
    await monter();
    for (const q of ['FEVRIER', 'février', 'Février']) {
      await chercher(q);
      expect(hote.querySelectorAll('.hdb-ancre')).toHaveLength(1);
      expect(hote.querySelector('.hdb-ancre')?.id).toBe('hdb-mail-1');
    }
  });

  /**
   * 🔴 QUAND LA RECHERCHE NE REND RIEN, LE MOT ACCUSE LES RÉGLAGES ET RÉPÈTE CE QU'ON A CHERCHÉ. Sur un
   * téléphone, le champ est souvent sorti de l'écran quand on lit la réponse.
   */
  it('🔴🔴 une recherche sans résultat accuse les réglages, et répète le mot', async () => {
    await monter();
    await chercher('zzzz-introuvable');
    expect(hote.querySelectorAll('.hdb-ancre')).toHaveLength(0);
    expect(texte()).toContain('zzzz-introuvable');
    expect(texte()).toContain('ce sont les réglages qui cachent, pas le bien');
  });

  /** ⚠️ LE RÉSUMÉ DES PIÈCES SUIT LA RECHERCHE : il annonce les pièces des mails VISIBLES, pas de la page. */
  it('⚠️ le résumé des pièces ne compte que les mails visibles', async () => {
    await monter();
    expect(texte()).toContain('2 pièces');
    await chercher('fevrier');
    expect(texte()).toContain('1 pièce');
    expect(texte()).not.toContain('2 pièces');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-nonies 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 1 — LE RÉSUMÉ SUIT LA SÉLECTION, DANS LES QUATRE COMBINAISONS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-nonies 🔴🔴 le résumé des pièces suit la sélection', () => {
  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026), sur lot-47 : « propriétaire ET locataire cochés → le résumé ne montre que les
   * pièces du propriétaire ».
   *
   * 🔴 CE QUI N'ÉTAIT PAS LA CAUSE, et je l'ai mesuré avant de toucher quoi que ce soit : le résumé ne se
   * trompait pas. Dans les trois combinaisons il valait exactement la somme des trombones des mails AFFICHÉS
   * (15 = 15, 10 = 10, 13 = 13), et il lisait déjà la même liste que le listing — il n'y a jamais eu de second
   * calcul.
   *
   * 🔴🔴 LA CAUSE ÉTAIT LA PAGE DE 25. La sélection « propriétaire + locataire » compte 49 mails ; le listing
   * n'en chargeait que 25, les plus récents. Dans cette page, deux mails de la locataire seulement, et aucun ne
   * portait de pièce : ses 10 pièces étaient sur les pages suivantes. Le résumé disait la vérité de la PAGE, pas
   * celle de la SÉLECTION.
   *
   * 🔴 LA CORRECTION tient en une taille demandée : le listing charge la sélection entière, jusqu'au plafond que
   * la route s'est fixé (100). Ce groupe éprouve les quatre combinaisons demandées par Arno.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */

  /** Trois familles, trois pièces : le propriétaire, la locataire, et un mail que NOUS avons écrit. */
  const MAIL_PROPRIO = ligne({
    messageId: 10, filId: 100, recuLe: '2026-03-01T09:00:00Z', objet: 'Charges 2026',
    de: 'proprio@fictif.test', deNom: 'M. ROI Nathan',
    pieces: [piece({ pieceId: 101, nomFichier: 'charges-2026.pdf', empreinte: 'sha-101' })],
  });
  const MAIL_LOCATAIRE = ligne({
    messageId: 11, filId: 110, recuLe: '2026-02-01T09:00:00Z', objet: 'État des lieux',
    de: 'locataire@fictif.test', deNom: 'MARTY Jean-François',
    pieces: [piece({ pieceId: 111, nomFichier: 'etat-des-lieux.pdf', empreinte: 'sha-111' })],
  });
  const MAIL_AGENCE = ligne({
    messageId: 12, filId: 100, recuLe: '2026-01-15T09:00:00Z', objet: 'Charges 2026', sens: 'envoye',
    de: 'gestion@criterimmo.fr', deNom: 'Gestion CRITERIMMO',
    pieces: [piece({ pieceId: 121, nomFichier: 'decompte.pdf', empreinte: 'sha-121' })],
  });

  /** Le serveur rend ce que la sélection désigne : c'est le `avec=` de l'adresse qui décide. */
  const servirSelonLaSelection = (): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return reponse({ etat: 'ok', geste: null });
      const u = String(url);
      appels.push(u);
      if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (u.includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      /* ⚠️ ON LIT LE `avec=` DE L'ADRESSE, comme le ferait la route : c'est ce qui rend l'épreuve honnête —
         elle n'impose pas la réponse, elle la DÉDUIT de ce que l'écran a demandé. */
      const avec = new URL(u, 'http://local').searchParams.get('avec') ?? '';
      const choisies = avec === '' ? null : avec.split(',');
      const tous = [MAIL_PROPRIO, MAIL_LOCATAIRE, MAIL_AGENCE];
      const lignes = choisies === null
        ? tous
        : tous.filter((l) => choisies.includes(l.de) || l.filId === 100 && choisies.includes('proprio@fictif.test'));
      return reponse({
        etat: 'ok',
        data: {
          lignes, suite: false, entete: { nbMails: lignes.length },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
  };

  /**
   * Les noms de fichiers du résumé. C'est la seule lecture qui dise ce qu'il CONTIENT.
   *
   * ⚠️ BORNÉE AU RÉSUMÉ DU BAS, et c'est une correction : le bloc en rend DEUX (haut replié, bas ouvert — demande
   * d'Arno au lot 1). Lire les deux comptait chaque pièce deux fois, et ma première version de cette aide a
   * échoué pour cette raison — pas pour un défaut du produit.
   */
  const piecesDuResume = (): string[] =>
    [...hote.querySelectorAll('.hdb-resume--bas .pdc-grille > li')]
      .map((x) => (x.querySelector('.pcv-nom, [class*="nom"]')?.textContent
        ?? (x.textContent ?? '').trim().split('\n')[0]).trim());

  const cocherGroupe = async (titre: string): Promise<void> => {
    const g = ([...hote.querySelectorAll('.hdb-groupe')] as HTMLElement[])
      .find((x) => (x.querySelector('.hdb-replier')?.textContent ?? '').includes(titre));
    await cliquer(g?.querySelector('.hdb-case--groupe input') ?? undefined);
  };

  /**
   * 🔴🔴 LA CORRECTION ELLE-MÊME : le listing demande la SÉLECTION, et non 25 mails. C'est la seule ligne qui a
   * changé, et c'est elle qui faisait disparaître une famille entière du résumé.
   */
  it('🔴🔴 le listing demande la sélection entière, jusqu’au plafond de la route', async () => {
    servirSelonLaSelection();
    await monter();
    expect(appels.some((a) => a.includes('taille=100'))).toBe(true);
    expect(appels.some((a) => a.includes('taille=25'))).toBe(false);
  });

  /** ① « Tous les mails du bien » → toutes les pièces, les trois familles. */
  it('🔴🔴 « tous les mails du bien » → les pièces des trois familles', async () => {
    servirSelonLaSelection();
    await monter();
    await ouvrirLeResume();
    expect(piecesDuResume())
      .toEqual(expect.arrayContaining(['charges-2026.pdf', 'etat-des-lieux.pdf', 'decompte.pdf']));
  });

  /** ② Propriétaire seul → ses pièces, et celles que NOUS avons envoyées dans SES échanges (demande d'Arno). */
  it('🔴🔴 propriétaire seul → ses pièces, celles de l’agence dans ses échanges comprises', async () => {
    servirSelonLaSelection();
    await monter();
    /* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — PLUS RIEN À RELEVER AVANT DE COCHER : cocher un groupe filtre, et
       c'est tout. Ces trois cas passaient par `.hdb-case--large` (l'interrupteur) parce qu'il fallait le
       désarmer d'abord — c'est-à-dire qu'ils documentaient le défaut qu'Arno vient de faire corriger. */
    await cocherGroupe('Propriétaire');
    await ouvrirLeResume();
    const noms = piecesDuResume();
    expect(noms).toContain('charges-2026.pdf');
    /* 🔴 « Les pièces envoyées par l'agence dans ces échanges en font partie » (Arno) : le décompte est dans
       l'échange du propriétaire (même `filId`), donc il est là. */
    expect(noms).toContain('decompte.pdf');
    expect(noms).not.toContain('etat-des-lieux.pdf');
  });

  /** ③ Locataire seul → ses pièces, et rien du propriétaire. */
  it('🔴🔴 locataire seul → ses pièces seulement', async () => {
    servirSelonLaSelection();
    await monter();
    await cocherGroupe('Locataire');
    await ouvrirLeResume();
    const noms = piecesDuResume();
    expect(noms).toEqual(['etat-des-lieux.pdf']);
  });

  /**
   * ④ 🔴🔴 LES DEUX → LES DEUX FAMILLES. C'est le cas qu'Arno a signalé, et celui que la page de 25 cassait.
   */
  it('🔴🔴 les deux cochés → les DEUX familles de pièces', async () => {
    servirSelonLaSelection();
    await monter();
    await cocherGroupe('Propriétaire');
    await cocherGroupe('Locataire');
    await ouvrirLeResume();
    const noms = piecesDuResume();
    expect(noms).toContain('charges-2026.pdf');
    expect(noms).toContain('etat-des-lieux.pdf');
    expect(noms).toContain('decompte.pdf');
  });

  /**
   * 🔴🔴 LE RÉSUMÉ ET LE LISTING VIENNENT DE LA MÊME LISTE, ET C'EST ÉPROUVÉ SUR LE CODE : un seul calcul,
   * `lignes`, lu par les deux. Deux calculs auraient pu divergEr — et c'est précisément ce qu'Arno interdit.
   */
  it('🔴🔴 un seul calcul : le résumé lit la même liste que le listing', () => {
    const code = codeSeul(SRC);
    /* Le résumé part de `lignes`… */
    expect(code).toContain('piecesDeLaConversation(messagesDuFil(lignes)');
    /* …et le listing aussi. */
    expect(code).toContain('<FilDeMails lignes={lignes}');
    /* ⚠️ ET `lignes` N'A QU'UNE SOURCE : la page reçue, triée, puis filtrée par la recherche. */
    expect(code).toContain('filtrerParMots(lignesPage, reglages.texte)');
  });

  /**
   * 🔴🔴 CE QUE LE RÉSUMÉ COMPTE : DES DOCUMENTS DISTINCTS, ET NON DES OCCURRENCES. Le dédoublonnage par CONTENU
   * est la décision d'Arno au lot RECAP-SANS-DOUBLON (« le récapitulatif annonçait 30 pièces » pour 8 fichiers).
   * Mesuré sur lot-47, les deux cochés : 32 trombones pour 26 documents distincts — six occurrences d'un même
   * document reçu puis transféré. La somme des trombones et le compte du résumé ne peuvent donc PAS être égales,
   * et c'est voulu.
   */
  it('🔴🔴 un même document reçu DEUX fois ne compte qu’une', async () => {
    const memeContenu = ligne({
      messageId: 13, filId: 130, recuLe: '2026-04-01T09:00:00Z', objet: 'Transfert',
      de: 'locataire@fictif.test', deNom: 'MARTY Jean-François',
      /* ⚠️ MÊME EMPREINTE, AUTRE NOM : c'est le CONTENU qui décide, jamais le nom. */
      pieces: [piece({ pieceId: 131, nomFichier: 'charges-2026-copie.pdf', empreinte: 'sha-101' })],
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (u.includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      return reponse({
        etat: 'ok',
        data: {
          lignes: [MAIL_PROPRIO, memeContenu], suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    /* Deux trombones à l'écran… */
    expect(hote.querySelectorAll('.vdb-trombone')).toHaveLength(2);
    /* …mais UN seul document dans le résumé. */
    expect(texte()).toContain('1 pièce');
    await ouvrirLeResume();
    expect(piecesDuResume()).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤-decies 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 2 — CAPSULES UNIFORMES, ET UN MENU ENTIÈREMENT VISIBLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤-decies 🔴🔴 le format des capsules, et le menu « … »', () => {
  const PERIODES = new Map([
    ['locataire@fictif.test', { mot: 'depuis le 02/09/2022', du: '2022-09-02', au: null }],
  ]);

  /**
   * 🔴 LE LISERÉ EN ARC A DISPARU. Arno : « Retire le liseré de couleur en arc de cercle à gauche des
   * capsules. » Un bord gauche de 3 px sur un rayon de 999 px suit la courbe : il se lisait comme une rognure,
   * pas comme une couleur. La catégorie est déjà dite par l'encart qui porte la capsule.
   */
  it('🔴🔴 plus aucun liseré de couleur sur les capsules', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    for (const ton of ['rouge', 'vert', 'bleu', 'gris']) {
      expect(css).not.toContain(`.hdb-capsule--${ton}{border-left`);
    }
  });

  /**
   * 🔴🔴 UN SEUL FORMAT, UNE SEULE HAUTEUR. « TOUTES les capsules prennent le format des capsules côté
   * propriétaire : nom sur une ligne, compteurs en dessous, “…” à droite. Même hauteur pour toutes. » La
   * hauteur est NOMMÉE une fois : trois valeurs recopiées auraient suffi à donner aux locataires une hauteur à
   * part — ce qui était justement le défaut.
   */
  it('🔴🔴 une hauteur unique, nommée une fois, pour toutes les capsules', async () => {
    expect(SRC).toContain('--hdb-caps:46px');
    expect(SRC).toContain('min-height:var(--hdb-caps)');
    await monter({ periodes: PERIODES });
    /* Le nom sur une ligne, les compteurs en dessous : la structure est la même partout. */
    for (const c of [...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[]) {
      expect(c.querySelector('.hdb-personne-nom')).not.toBeNull();
      expect(c.querySelector('.hdb-compteurs')).not.toBeNull();
    }
  });

  /** 🔴 LA DATE EST UN PETIT TEXTE SUR LA LIGNE DES COMPTEURS, et non un encadré. */
  it('🔴🔴 la date d’un locataire est dans la ligne des compteurs, sans cadre', async () => {
    await monter({ periodes: PERIODES });
    const date = hote.querySelector('.hdb-periode-mot') as HTMLElement;
    expect(date).not.toBeNull();
    expect(date.textContent).toBe('depuis le 02/09/2022');
    /* 🔴 ELLE EST DANS LA LIGNE DES COMPTEURS, pas à côté. */
    expect(date.closest('.hdb-compteurs')).not.toBeNull();
    /* …et elle reste cliquable : elle règle la période sur ce bail (geste acquis au lot 2). */
    await cliquer(date);
    const dates = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(dates[0]?.value).toBe('2022-09-02');
  });

  /**
   * ══ 🔴🔴 LE MENU EST EN POSITION FIXE, ET C'EST LA SEULE FAÇON DE TENIR LA PROMESSE ══════════════════════════
   *
   * L'encart a `overflow-y: auto` (hauteur fixe, lot 3) : tout élément positionné À L'INTÉRIEUR y est ROGNÉ, et
   * aucun `z-index` n'y change quoi que ce soit. Le menu sort donc du flux et se place par rapport à la FENÊTRE.
   * C'est aussi ce qui le fait « passer au-dessus du défilement de l'encart », littéralement.
   */
  it('🔴🔴 le menu est posé par rapport à la fenêtre, pas dans l’encart qui défile', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    const capsule = ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .find((c) => (c.textContent ?? '').includes('AXA')) as HTMLElement;
    await cliquer(capsule.querySelector('.hdb-menu-bouton') ?? undefined);
    const menu = hote.querySelector('.hdb-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(SRC).toContain('.hdb-menu{position:fixed');
    /**
     * ⚠️ IL RESTE UN ENFANT DU DOM, ET C'EST NORMAL — ma première version de ce cas attendait le contraire, à
     * tort. Un élément `position: fixed` est placé par rapport à la FENÊTRE et n'est PAS rogné par le
     * `overflow` d'un ancêtre : il n'a pas besoin de sortir de l'arbre pour sortir du cadre. Ce qui compte est
     * donc le mode de positionnement, et il est vérifié ci-dessus.
     *
     * ⚠️ CE QUE CETTE ÉPREUVE NE PEUT PAS PROUVER : que rien ne soit rogné. jsdom ne calcule aucune mise en
     * page. Le non-rognage a été vérifié dans Chrome, menu ouvert sur la dernière capsule d'un encart plein.
     */
    expect(menu.getAttribute('data-pour')).toBe('assureur@fictif.test');
    /* ⚠️ ET UN SEUL ANCÊTRE À TRANSFORMATION SUFFIRAIT À LE REFIXER DANS L'ENCART : aucune règle du bloc ne
       pose `transform` sur un conteneur de capsules, et ce contrôle le rappelle à qui en ajouterait une. */
    expect(SRC).not.toContain('.hdb-defile{transform');
    expect(SRC).not.toContain('.hdb-groupe{transform');
  });

  /** 🔴🔴 ÉCHAP FERME LE MENU — la sortie du clavier. */
  it('🔴🔴 Échap ferme le menu', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    const capsule = ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .find((c) => (c.textContent ?? '').includes('AXA')) as HTMLElement;
    await cliquer(capsule.querySelector('.hdb-menu-bouton') ?? undefined);
    expect(hote.querySelector('.hdb-menu')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(hote.querySelector('.hdb-menu')).toBeNull();
  });

  /**
   * 🔴🔴 UN CLIC À CÔTÉ FERME LE MENU — la sortie de la souris. Sans elle, un menu ouvert par erreur se referme
   * en choisissant quelque chose, c'est-à-dire en faisant un geste qu'on ne voulait pas.
   */
  it('🔴🔴 un clic à côté ferme le menu', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    const capsule = ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .find((c) => (c.textContent ?? '').includes('AXA')) as HTMLElement;
    await cliquer(capsule.querySelector('.hdb-menu-bouton') ?? undefined);
    expect(hote.querySelector('.hdb-menu')).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(hote.querySelector('.hdb-menu')).toBeNull();
  });

  /**
   * ⚠️ UN CLIC **DANS** LE MENU NE LE FERME PAS, et c'est ce qui rend le choix possible. On écoute `mousedown`
   * et non `click` précisément pour cela : avec `click`, le relâchement d'un clic commencé ailleurs fermait le
   * menu avant que l'item ne reçoive le sien — et le choix se perdait.
   */
  it('⚠️ un clic dans le menu ne le ferme pas : le choix part', async () => {
    const envois: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        envois.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return reponse({ etat: 'ok', geste: null });
      }
      const u = String(url);
      if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (u.includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: INTERLOCUTEURS, interlocuteursTronques: false,
        },
      });
    }));
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    const capsule = ([...hote.querySelectorAll('.hdb-capsule')] as HTMLElement[])
      .find((c) => (c.textContent ?? '').includes('AXA')) as HTMLElement;
    await cliquer(capsule.querySelector('.hdb-menu-bouton') ?? undefined);
    const item = hote.querySelector('.hdb-menu-item') as HTMLButtonElement;
    await act(async () => { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(hote.querySelector('.hdb-menu')).not.toBeNull();
    await cliquer(item);
    expect(envois).toHaveLength(1);
    expect(envois[0].categorie).toBe('proprietaire');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 LE GARDE : LES DEUX COMPOSANTS SONT **IMPORTÉS**, PAS RECOPIÉS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

/**
 * LE CODE SEUL, SANS COMMENTAIRE NI LITTÉRAL CSS. Un nom de classe cité dans un encadré ne prouve rien, et le
 * littéral `CSS_HISTORIQUE_DU_BIEN` contient par construction les styles des composants réutilisés.
 */
function codeSeul(src: string): string {
  const sansCss = src.split('export const CSS_HISTORIQUE_DU_BIEN')[0];
  return sansCss.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
}

describe('⑤-undecies 🔴🔴 les deux encarts sont TOUJOURS là, côte à côte, même largeur', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026, fiche lot-299 — le foyer COLSON FARDEAU) : « l'encart Propriétaire a disparu et
   * l'encart Locataire prend toute la largeur. »
   *
   * LE DIAGNOSTIC, MESURÉ EN BASE. Trois causes empilées :
   *   ① les groupes se construisent sur les MAILS et non sur la fiche — le propriétaire de lot-299 n'a qu'une
   *      adresse @sansvisavis.com, `interne = true`, écartée par la règle du lot 2, et ses trois autres
   *      propriétaires liés n'ont que des adresses de test absentes des mails ;
   *   ② l'écran ne peignait pas un groupe vide (`if (g.nb === 0) return null`) ;
   *   ③ et `repeat(auto-fit, minmax(240px, 1fr))` replie les pistes vides : avec un seul enfant, il ne reste
   *      qu'une colonne, qui prend toute la ligne.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   */

  /** Aucun interlocuteur rangé dans un encart : le cas exact de lot-299. */
  const SANS_CLIENT: Interlocuteur[] = [inter({ adresse: 'assureur@fictif.test', nom: 'AXA', nbMails: 9 })];

  async function monterAvec(interlocuteurs: Interlocuteur[], props: Record<string, unknown> = {}): Promise<void> {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) {
        return reponse({ etat: 'ok', evenements: [], tronque: false });
      }
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs, interlocuteursTronques: false,
        },
      });
    }));
    await monter(props as Partial<Parameters<typeof HistoriqueDuBien>[0]>);
  }

  const encarts = (): HTMLElement[] =>
    [...hote.querySelectorAll('.hdb-groupe--encart')] as HTMLElement[];

  it('🔴🔴 LE DÉFAUT D’ARNO EST RÉPARÉ : les deux encarts sont là même sans aucune capsule', async () => {
    await monterAvec(SANS_CLIENT, { categories: new Map() });
    expect(encarts()).toHaveLength(2);
    /* Et dans l'ordre qu'Arno a fixé : Propriétaire à GAUCHE, Locataire à DROITE. */
    expect(encarts()[0].textContent).toContain('Propriétaire');
    expect(encarts()[1].textContent).toContain('Locataire');
  });

  it('🔴🔴 L’ORDRE N’EST PAS ÉCRIT DANS L’ÉCRAN : il vient de GROUPES_EN_ENCART', () => {
    expect(GROUPES_EN_ENCART).toEqual(['proprietaire', 'locataire']);
    expect(SRC).toContain('GROUPES_EN_ENCART.map');
  });

  it('🔴🔴 DEUX COLONNES ÉGALES, ET NON « autant qu’il en reste »', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).toContain('.hdb-encarts{display:grid;gap:8px;grid-template-columns:1fr 1fr');
    /* 🔴 LA MOITIÉ DU DÉFAUT ÉTAIT LÀ : auto-fit replie la piste vide. Le garde interdit son retour. */
    expect(css).not.toContain('.hdb-encarts{display:grid;gap:8px;grid-template-columns:repeat(auto-fit');
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 3 — LA MÊME HAUTEUR, TOUJOURS ════════════════════════════════════════
   * RÈGLE D'ARNO : « les encarts Propriétaire et Locataire ont TOUJOURS la même hauteur (celle du plus grand,
   * plafonnée à la hauteur maximale d'avant défilement), même si l'un est vide. Le texte d'encart vide est
   * centré verticalement. »
   *
   * 🔴 ET C'EST L'INVERSE DE CE QUE J'AVAIS ÉCRIT AU LOT 5 (`align-items:start`), où je voulais éviter qu'un
   * encart vide s'étire. La règle d'Arno gagne, et elle est plus simple : `stretch` est la valeur par défaut
   * d'une grille, donc « la hauteur du plus grand » sans une ligne de calcul.
   */
  it('🔴🔴 LES DEUX ENCARTS S’ÉTIRENT À LA HAUTEUR DU PLUS GRAND', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).toContain('align-items:stretch');
    /* 🔴 LE GARDE : `start` laisserait un encart vide plus court que son voisin — ce qu'Arno refuse. */
    expect(css).not.toContain('.hdb-encarts{display:grid;gap:8px;grid-template-columns:1fr 1fr;align-items:start');
  });

  it('🔴🔴 LE TEXTE D’UN ENCART VIDE EST CENTRÉ VERTICALEMENT', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    /* L'encart est une colonne… */
    expect(css).toContain('.hdb-groupe--encart{display:flex;flex-direction:column}');
    /* …et le mot prend la place restante, centré dans les deux sens. */
    const regle = css.split('.hdb-groupe--encart .hdb-vide-mot{')[1]?.split('}')[0] ?? '';
    expect(regle).toContain('flex:1 1 auto');
    expect(regle).toContain('align-items:center');
    expect(regle).toContain('justify-content:center');
  });

  it('🔴 LE PLAFOND EST CELUI QUI EXISTE DÉJÀ : aucun second plafond à tenir', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    /* La liste est bornée et défile ; l'encart, lui, ne porte aucun max-height propre. */
    expect(css).toContain('.hdb-defile{max-height:var(--hdb-liste-h)');
    const encart = css.split('.hdb-groupe--encart{')[1]?.split('}')[0] ?? '';
    expect(encart).not.toContain('max-height');
  });

  it('⚠️ LES BANDES NE SONT PAS CONCERNÉES : leur hauteur n’a pas de jumelle', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).not.toContain('.hdb-groupe--bande{display:flex');
  });

  it('⚠️ L’EMPILEMENT SUR ÉCRAN ÉTROIT EST DIT, ET PROPRIÉTAIRE RESTE EN PREMIER', async () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).toContain('@media (max-width:34rem){.hdb-encarts{grid-template-columns:1fr}}');
    /* « Propriétaire en premier » ne demande aucune règle : c'est l'ordre du DOM. */
    await monterAvec(SANS_CLIENT, { categories: new Map() });
    expect(encarts()[0].textContent).toContain('Propriétaire');
  });

  it('🔴 UN ENCART VIDE PARLE — et chaque cas a sa phrase', async () => {
    await monterAvec(SANS_CLIENT, { categories: new Map() });
    const mots = [...hote.querySelectorAll('.hdb-groupe--encart .hdb-vide-mot')]
      .map((e) => e.textContent ?? '');
    expect(mots).toHaveLength(2);
    expect(mots[0]).toBe('Aucun propriétaire connu pour ce bien.');
    expect(mots[1]).toBe('Aucun locataire connu.');
  });

  it('🔴 AVEC UN CLIENT CONNU MAIS MUET, LA PHRASE CHANGE : « aucun échange », et non « aucun connu »', async () => {
    await monterAvec(SANS_CLIENT, {
      categories: new Map(),
      clients: [{ adresse: null, nom: 'COLSON FARDEAU', categorie: 'locataire' }],
    });
    const mots = [...hote.querySelectorAll('.hdb-groupe--encart .hdb-vide-mot')]
      .map((e) => e.textContent ?? '');
    expect(mots[1]).toBe('Aucun échange avec le locataire sur cette période.');
  });

  it('🔴🔴 LE PROPRIÉTAIRE CLIENT A SA CAPSULE MÊME À 0 MAIL, compteurs à zéro', async () => {
    await monterAvec(SANS_CLIENT, {
      categories: CATEGORIES,
      clients: [{ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', categorie: 'proprietaire' }],
    });
    const prop = encarts()[0];
    const caps = [...prop.querySelectorAll('.hdb-capsule')] as HTMLElement[];
    expect(caps).toHaveLength(1);
    expect(caps[0].textContent).toContain('M. ROI Nathan');
    /* Les deux compteurs à zéro, écrits par la MÊME fonction que partout ailleurs. */
    expect(caps[0].querySelector('.hdb-compteurs')?.textContent)
      .toBe(motDeuxCompteurs({ aEcrit: 0, enCopie: 0 }));
    /* Et l'encart ne porte plus de phrase de vide : il n'est plus vide. */
    expect(prop.querySelector('.hdb-vide-mot')).toBeNull();
  });

  it('⚠️ UN CLIENT QUI A ÉCRIT GARDE SES VRAIS COMPTEURS : compléter n’écrase rien', async () => {
    await monterAvec(INTERLOCUTEURS, {
      clients: [{ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', categorie: 'proprietaire' }],
    });
    const caps = [...encarts()[0].querySelectorAll('.hdb-capsule')] as HTMLElement[];
    expect(caps).toHaveLength(1);
    expect(caps[0].querySelector('.hdb-compteurs')?.textContent)
      .toBe(motDeuxCompteurs({ aEcrit: 3, enCopie: 2 }));
  });

  it('🔴 UN ENCART VIDE RESTE UNE ZONE DE DÉPÔT : les trois gestes du glisser sont posés dessus', async () => {
    await monterAvec(SANS_CLIENT, { categories: new Map() });
    /* On ne peut pas lire un gestionnaire React sur le DOM : on éprouve ce qui se voit — la section existe,
       elle porte le ton de son groupe, et le composant qui pose les gestes est le MÊME pour les quatre. */
    expect(encarts()[0].className).toContain('hdb-groupe--rouge');
    expect(encarts()[1].className).toContain('hdb-groupe--vert');
    /* Et la consigne de dépôt n'apparaît QUE pendant un glisser : hors glisser, l'encart dit son état. */
    expect(hote.querySelector('.hdb-groupe--encart .hdb-vide-depot')).toBeNull();
  });

  it('⚠️ AUCUNE RÉGRESSION QUAND LES DEUX GROUPES SONT PLEINS : toujours deux encarts, aucune phrase de vide', async () => {
    await monterAvec(INTERLOCUTEURS);
    expect(encarts()).toHaveLength(2);
    expect(hote.querySelector('.hdb-vide-mot')).toBeNull();
  });
});

describe('⑤-duodecies 🔴🔴 les deux bandes sont TOUJOURS là, même à zéro', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * RÈGLE D'ARNO (lot 5, point 2) : « Sous les deux encarts, sur toute la largeur, deux lignes dépliables,
   * repliées par défaut, chacune avec son compteur et sa case “tout le groupe” : “Tiers indépendant” (bleu)
   * puis “Non affectés” (gris). Elles sont TOUJOURS présentes, même à 0, et restent des zones de dépôt quand
   * elles sont repliées (elles s'ouvrent au survol pendant un glisser). »
   *
   * CE QUI ÉTAIT ÉCRIT AVANT : une bande vide n'existait QUE pendant un glisser. Elle apparaissait donc SOUS LE
   * CURSEUR au premier mouvement, poussant les deux encarts vers le haut au moment précis où l'on vise.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   */

  /** Tout le monde est client : les deux bandes sont donc vides, et c'est le cas qu'on éprouve. */
  const QUE_DES_CLIENTS: Interlocuteur[] = [
    inter({ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', nbMails: 40, aEcrit: 3, enCopie: 2 }),
    inter({ adresse: 'locataire@fictif.test', nom: 'MARTY Jean-François', nbMails: 20, aEcrit: 20 }),
  ];

  async function monterAvec(interlocuteurs: Interlocuteur[]): Promise<void> {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) {
        return reponse({ etat: 'ok', evenements: [], tronque: false });
      }
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
  }

  const bandes = (): HTMLElement[] => [...hote.querySelectorAll('.hdb-groupe--bande')] as HTMLElement[];

  it('🔴🔴 LES DEUX BANDES SONT RENDUES MÊME VIDES, dans l’ordre d’Arno', async () => {
    await monterAvec(QUE_DES_CLIENTS);
    expect(bandes()).toHaveLength(2);
    expect(bandes()[0].textContent).toContain('Tiers indépendant');
    expect(bandes()[1].textContent).toContain('Non affectés');
    /* Les tons : bleu puis gris, comme écrit. */
    expect(bandes()[0].className).toContain('hdb-groupe--bleu');
    expect(bandes()[1].className).toContain('hdb-groupe--gris');
  });

  it('🔴🔴 L’ORDRE VIENT DU MODULE PUR, PAS DE L’ÉCRAN', () => {
    expect(GROUPES_EN_BANDE).toEqual(['independant', 'a_repartir']);
    expect(SRC).toContain('GROUPES_EN_BANDE.map');
    /* 🔴 LE GARDE : plus aucune condition ne fait dépendre leur existence d'un glisser en cours. */
    expect(SRC).not.toContain('g.nb === 0 && glisse === null');
  });

  it('🔴 CHACUNE PORTE SON COMPTEUR, ET IL DIT ZÉRO', async () => {
    await monterAvec(QUE_DES_CLIENTS);
    for (const b of bandes()) expect(b.querySelector('.gst-compte')?.textContent).toBe('0');
  });

  it('🔴 CHACUNE PORTE SA CASE « tout le groupe » — désactivée quand il n’y a personne', async () => {
    await monterAvec(QUE_DES_CLIENTS);
    for (const b of bandes()) {
      const c = b.querySelector('.hdb-case--groupe input') as HTMLInputElement;
      expect(c).not.toBeNull();
      expect(c.disabled).toBe(true);
      /* ⚠️ ET SURTOUT PAS COCHÉE : un ensemble vide n'est pas « tout coché » (piège du lot 71). */
      expect(c.checked).toBe(false);
    }
  });

  it('⚠️ LA CASE REDEVIENT ACTIVE DÈS QU’IL Y A QUELQU’UN', async () => {
    await monterAvec([...QUE_DES_CLIENTS, inter({ adresse: 'assureur@fictif.test', nbMails: 9 })]);
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    expect(gris.querySelector('.gst-compte')?.textContent).toBe('1');
    expect((gris.querySelector('.hdb-case--groupe input') as HTMLInputElement).disabled).toBe(false);
  });

  it('🔴 REPLIÉES PAR DÉFAUT : aucune capsule n’est montée tant qu’on n’a pas déplié', async () => {
    await monterAvec([...QUE_DES_CLIENTS, inter({ adresse: 'assureur@fictif.test', nbMails: 9 })]);
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    expect(gris.querySelector('.hdb-replier')?.getAttribute('aria-expanded')).toBe('false');
    expect(gris.querySelectorAll('.hdb-capsule')).toHaveLength(0);
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    expect(gris.querySelectorAll('.hdb-capsule')).toHaveLength(1);
  });

  it('🔴 UNE BANDE REPLIÉE RESTE UNE ZONE DE DÉPÔT : les gestes sont sur la section, pas sur la liste', () => {
    /* On ne lit pas un gestionnaire React depuis le DOM : on éprouve la STRUCTURE qui le garantit — les trois
       gestes sont posés sur la `section` du groupe, au-dessus du `{ouvert && …}` qui monte les capsules. */
    const corps = SRC.split('function GroupeDeParties')[1] ?? '';
    const section = corps.split('return (')[1] ?? '';
    const avantLeRepli = section.split('{ouvert &&')[0] ?? '';
    for (const geste of ['onDragOver=', 'onDragLeave=', 'onDrop=']) {
      expect(avantLeRepli).toContain(geste);
    }
  });

  it('🔴 ET ELLE S’OUVRE AU SURVOL PENDANT UN GLISSER, SANS LE MÉMORISER', () => {
    const corps = SRC.split('function GroupeDeParties')[1] ?? '';
    expect(corps).toContain('const ouvert = ouvertParChoix || (glisse !== null && survol === g.cle);');
  });

  it('⚠️ AUCUNE RÉGRESSION QUAND ELLES SONT PLEINES', async () => {
    await monterAvec(INTERLOCUTEURS);
    expect(bandes()).toHaveLength(2);
    expect((hote.querySelector('.hdb-groupe--gris') as HTMLElement)
      .querySelector('.gst-compte')?.textContent).toBe('1');
  });
});

describe('⑤-terdecies 🔴🔴 la pastille de droite : le « + », la fiche, ou rien', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * TROISIÈME DEMANDE D'ARNO POUR LE MÊME BOUTON (05/10/2026) : « Il n'apparaît toujours pas (ex. lot-299 :
   * “esteban fardeau” n'a que “…”). »
   *
   * LES DEUX MOITIÉS DE LA CAUSE, mesurées en base :
   *   ① une carte qui EXISTE faisait disparaître le bouton sans rien mettre à la place —
   *      `estebanfrdpro@gmail.com` porte la carte 1462 (côté locataire, vérifiée, non retirée) ;
   *   ② « Non affectés » n'avait pas de « + » du tout : la condition d'alors écartait `independant` ET
   *      `a_repartir` du même geste.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   */

  /** Un contact de chaque groupe, plus un client et une de nos adresses. */
  const PEUPLE: Interlocuteur[] = [
    inter({ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', nbMails: 40 }),
    inter({ adresse: 'assureur@fictif.test', nom: 'AXA', nbMails: 9 }),
    inter({ adresse: 'gestion@criterimmo.fr', nom: 'Gestion', nbMails: 60, interne: true }),
  ];

  async function monterAvec(
    parties: { adresse: string; categorie: string | null }[],
    cartes: { cote: string; adresse: string; verifie: boolean; origine?: 'auto' | 'manuel' }[],
    interlocuteurs: Interlocuteur[] = PEUPLE,
  ): Promise<void> {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) {
        return reponse({ etat: 'ok', evenements: [], tronque: false });
      }
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        /* 🔴 LOT 8 — par défaut « manuel » : les cas d'avant ce lot éprouvaient une carte CRÉÉE. */
        return reponse({
          etat: 'ok',
          data: { parties, cartes: cartes.map((c) => ({ origine: 'manuel' as const, ...c })) },
        });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
  }

  /** Toutes les capsules de la page, avec ce qu'elles portent à droite. */
  const pastilles = (): { nom: string; classe: string | null; signe: string | null }[] =>
    [...hote.querySelectorAll('.hdb-capsule')].map((c) => {
      const b = c.querySelector('.hdb-plus') as HTMLButtonElement | null;
      return {
        nom: c.querySelector('.hdb-personne-nom')?.textContent ?? '',
        classe: b === null ? null : (b.className.match(/hdb-plus--(plus|fiche|a_verifier)/) ?? [])[1] ?? null,
        signe: b === null ? null : b.textContent,
      };
    });

  it('🔴🔴 UN CONTACT SANS CARTE PORTE LE « + », dans les TROIS groupes qui en portent', async () => {
    await monterAvec(
      [{ adresse: 'assureur@fictif.test', categorie: null }],
      [],
      [...PEUPLE, inter({ adresse: 'syndic@fictif.test', nom: 'Syndic', nbMails: 4 })],
    );
    /* ⚠️ « Non affectés » EST REPLIÉE PAR DÉFAUT (lot 5, point 2) : ses capsules n'existent pas tant qu'on ne
       l'ouvre pas. C'est le repli, pas la pastille, qui les cache. */
    const gris0 = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris0.querySelector('.hdb-replier') ?? undefined);
    /* « assureur » et « syndic » sont non affectés : les deux portent le « + ». */
    const avec = pastilles().filter((x) => x.classe === 'plus');
    expect(avec.map((x) => x.nom).sort()).toEqual(['AXA', 'Syndic']);
    expect(avec.every((x) => x.signe === '+')).toBe(true);
  });

  it('🔴🔴 LE DÉFAUT D’ARNO : une carte CRÉÉE donne la pastille « fiche », et non plus RIEN', async () => {
    await monterAvec(
      [{ adresse: 'assureur@fictif.test', categorie: 'locataire' }],
      [{ cote: 'locataire', adresse: 'assureur@fictif.test', verifie: true, origine: 'manuel' }],
    );
    const axa = pastilles().find((x) => x.nom === 'AXA');
    expect(axa?.classe).toBe('fiche');
    /* Et ce n'est PAS un « + » : la carte existe, on l'ouvre, on ne la recrée pas. */
    expect(axa?.signe).not.toBe('+');
  });

  /**
   * 🔴🔴 MIS À JOUR AU LOT 8, POINT 2 : une carte CRÉÉE mais non vérifiée donne la MÊME pastille grise.
   * L'orange a disparu — il désignait les pré-remplissages, qui ne montent plus dans un carrousel.
   */
  it('🔴🔴 UNE CARTE CRÉÉE NON VÉRIFIÉE DONNE LA MÊME PASTILLE GRISE — plus d’orange', async () => {
    await monterAvec(
      [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }],
      [{ cote: 'proprietaire', adresse: 'assureur@fictif.test', verifie: false, origine: 'manuel' }],
    );
    expect(pastilles().find((x) => x.nom === 'AXA')?.classe).toBe('fiche');
  });

  it('🔴🔴 ET UN PRÉ-REMPLISSAGE GARDE LE « + »', async () => {
    await monterAvec(
      [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }],
      [{ cote: 'proprietaire', adresse: 'assureur@fictif.test', verifie: false, origine: 'auto' }],
    );
    expect(pastilles().find((x) => x.nom === 'AXA')?.classe).toBe('plus');
  });

  it('🔴🔴 LE « + » DANS « NON AFFECTÉS » — la seconde moitié du défaut', async () => {
    await monterAvec([], []);
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    const b = gris.querySelector('.hdb-capsule .hdb-plus') as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.className).toContain('hdb-plus--plus');
  });

  it('🔴 AUCUNE PASTILLE SUR UN CLIENT NI SUR UNE DE NOS ADRESSES', async () => {
    await monterAvec([], []);
    /* Le propriétaire est un client (il est dans CATEGORIES) ; l'agence n'est même pas listée. */
    expect(pastilles().find((x) => x.nom === 'M. ROI Nathan')?.classe).toBeNull();
    expect(pastilles().some((x) => x.nom === 'Gestion')).toBe(false);
  });

  it('🔴 AUCUNE PASTILLE SUR UN TIERS INDÉPENDANT — ils restent hors de l’automatisation', async () => {
    await monterAvec([{ adresse: 'assureur@fictif.test', categorie: 'independant' }], []);
    const bleu = hote.querySelector('.hdb-groupe--bleu') as HTMLElement;
    await cliquer(bleu.querySelector('.hdb-replier') ?? undefined);
    expect(bleu.querySelector('.hdb-capsule')).not.toBeNull();
    expect(bleu.querySelector('.hdb-capsule .hdb-plus')).toBeNull();
  });

  /**
   * 🔴🔴 « TOUJOURS VISIBLE (pas seulement au survol) » — demande d'Arno, et c'est un GARDE, pas un constat :
   * jsdom ne calcule aucun style. Ce qui est éprouvé, c'est qu'aucune règle du bloc ne lie la pastille au survol
   * ni à une opacité. Ce qui la faisait manquer était une condition de RENDU, et les deux sont fermées.
   */
  it('🔴🔴 RIEN NE LIE LA PASTILLE AU SURVOL NI À UNE OPACITÉ', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    for (const regle of css.split('\n')) {
      if (!regle.includes('.hdb-plus')) continue;
      if (regle.trimStart().startsWith('/*') || regle.trimStart().startsWith('*')) continue;
      expect(regle).not.toContain('opacity');
      if (regle.includes(':hover')) {
        /* Un :hover est permis pour le FOND, jamais pour faire apparaître le bouton. */
        expect(regle).not.toContain('display');
        expect(regle).not.toContain('visibility');
      }
    }
  });

  /**
   * 🔴🔴 MIS À JOUR AU LOT 8, POINT 2 : DEUX états, et l'orange a disparu avec ses deux règles. Le cercle reste
   * partagé — seule la couleur change —, et `border-width` est désormais la seule « géométrie » permise : Arno
   * demande un cercle FIN, ce qui est une épaisseur de trait et non une taille.
   */
  it('🔴 LES DEUX ÉTATS PARTAGENT LE MÊME CERCLE : seule la couleur et la finesse du trait changent', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    expect(css).toContain('.hdb-plus--cercle{width:28px;height:28px');
    for (const etat of ['plus', 'fiche']) {
      expect(css).toContain(`.hdb-plus--${etat}{`);
      /* Aucune géométrie propre : la droite des capsules ne saute pas d'une ligne à l'autre. */
      const regle = css.split(`.hdb-plus--${etat}{`)[1]?.split('}')[0] ?? '';
      /* ⚠️ `border-width` EST PERMIS (Arno veut un cercle FIN) ; une LARGEUR de boîte ne l'est pas. On retire
         donc la propriété de bord avant de chercher une géométrie, sans quoi le garde se dénoncerait lui-même. */
      const sansBord = regle.replace(/border-width:[^;]*;?/g, '');
      for (const geo of ['width:', 'height', 'border-radius', 'padding']) expect(sansBord).not.toContain(geo);
    }
    /* 🔴 L'ORANGE N'EXISTE PLUS, NI COMME ÉTAT NI COMME RÈGLE : une règle morte ferait croire à un 3e état. */
    expect(css).not.toContain('.hdb-plus--a_verifier');
  });

  it('🔴🔴 LE « + » EST UN CERCLE ROUGE FIN SUR FOND DE SURFACE — la capture d’Arno', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    const regle = css.split('.hdb-plus--plus{')[1]?.split('}')[0] ?? '';
    expect(regle).toContain('border-width:1.5px');
    expect(regle).toContain('border-color:var(--color-svv-red)');
    expect(regle).toContain('color:var(--color-svv-red)');
    expect(regle).toContain('background:var(--color-svv-surface)');
  });

  /**
   * ══ 🔴🔴 LA CARTE EST PRÉ-REMPLIE : nom, adresse, téléphone trouvé en signature (demande d'Arno) ════════════
   *
   * MESURÉ AVANT D'ÉCRIRE : sur les 485 cartes actives du 05/10/2026, ZÉRO porte un téléphone — la colonne
   * existe depuis la migration 304 et rien ne l'a jamais remplie. Or 151 des 183 adresses qui ont réellement
   * écrit (83 %) portent un numéro français dans le corps de leurs mails.
   */
  it('🔴🔴 LE NOM ET LE TÉLÉPHONE TROUVÉS SONT PRÉ-REMPLIS', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({
          etat: 'ok',
          data: {
            parties: [], cartes: [],
            coordonnees: [
              {
                adresse: 'assureur@fictif.test', nom: 'Sophie DUPONT', telephone: '01 41 21 43 31',
                /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — et l'ADRESSE POSTALE de la même signature. MESURÉ : 65
                   des 187 adresses à carte qui ont écrit (35 %) en laissent une complète. */
                adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'Puteaux',
              },
            ],
          },
        });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs: PEUPLE, interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    await cliquer(gris.querySelector('.hdb-capsule .hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    /* ⚠️ « Commune » VIT DANS UN `.cp-duo-part`, à côté du code postal : les deux champs partagent une ligne.
       On cherche donc dans les deux sortes d'étiquettes, sans quoi la commune serait introuvable. */
    const valeur = (mot: string): string => ([...carte.querySelectorAll('.cp-champ, .cp-duo-part')]
      .find((l) => (l.textContent ?? '').startsWith(mot))?.querySelector('input') as HTMLInputElement)?.value;

    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE PRÉ-REMPLISSAGE REMPLIT MAINTENANT **CINQ** CHAMPS, et deux
     * d'entre eux sont nés de ce point : le PRÉNOM (le nom se coupe « si possible ») et l'ADRESSE POSTALE
     * (trouvée dans la même signature que le téléphone).
     *
     * ⚠️ « Sophie DUPONT » SE COUPE PAR LE SIGNAL DES CAPITALES : nom DUPONT, prénom Sophie. C'est le cas le plus
     * fréquent de la base (185 des 398 noms d'en-tête), et le seul où la coupe est SÛRE.
     */
    expect(valeur('Nom')).toBe('DUPONT');
    expect(valeur('Prénom')).toBe('Sophie');
    expect(valeur('Adresse')).toBe('2 rue Mars et Roty');
    expect(valeur('Code postal')).toBe('92800');
    expect(valeur('Commune')).toBe('PUTEAUX');
    /* Le téléphone est la première ligne de la liste, et l'adresse e-mail la seconde. */
    const coords = [...carte.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
    expect(coords.map((c) => c.value)).toEqual(['01 41 21 43 31', 'assureur@fictif.test']);
    /* ⚠️ TOUT RESTE MODIFIABLE : c'est une proposition, pas une vérité. */
    expect(coords.every((c) => !c.disabled && !c.readOnly)).toBe(true);
  });

  it('⚠️ SANS COORDONNÉES TROUVÉES, LE FORMULAIRE S’OUVRE AVEC LA SEULE ADRESSE', async () => {
    await monterAvec([], []);
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    await cliquer(gris.querySelector('.hdb-capsule .hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    /* Une seule coordonnée : l'adresse de la capsule. Aucun téléphone à amorcer, donc aucune ligne vide. */
    const coords = [...carte.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
    expect(coords.map((c) => c.value)).toEqual(['assureur@fictif.test']);
    /* Et les champs de la fiche sont vides — sans aucune mention rouge : ils sont facultatifs. */
    /* ⚠️ « Commune » VIT DANS UN `.cp-duo-part`, à côté du code postal : les deux champs partagent une ligne.
       On cherche donc dans les deux sortes d'étiquettes, sans quoi la commune serait introuvable. */
    const valeur = (mot: string): string => ([...carte.querySelectorAll('.cp-champ, .cp-duo-part')]
      .find((l) => (l.textContent ?? '').startsWith(mot))?.querySelector('input') as HTMLInputElement)?.value;
    expect([valeur('Nom'), valeur('Prénom'), valeur('Code postal'), valeur('Commune')]).toEqual(['', '', '', '']);
  });

  it('🔴 L’INFO-BULLE RAPPELLE LE BUT DU BOUTON, comme Arno l’a demandé', async () => {
    await monterAvec([], []);
    const gris1 = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris1.querySelector('.hdb-replier') ?? undefined);
    const b = hote.querySelector('.hdb-plus') as HTMLButtonElement;
    expect(b.getAttribute('title')).toContain(BUT_DU_PLUS);
  });

  it('🔴 UN CLIC DEPUIS UN ENCART PRÉ-REMPLIT LE CÔTÉ ; depuis « Non affectés », le choix reste VIDE', async () => {
    await monterAvec(
      [{ adresse: 'assureur@fictif.test', categorie: 'proprietaire' }], [],
    );
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const choix = hote.querySelector('.hdb-creation select') as HTMLSelectElement;
    expect(choix).not.toBeNull();
    expect(choix.value).toBe('proprietaire');
  });

  it('⚠️ DEPUIS « NON AFFECTÉS », LE CHOIX DU CÔTÉ EST OBLIGATOIRE — il n’est pas pré-rempli', async () => {
    await monterAvec([], []);
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    await cliquer(gris.querySelector('.hdb-capsule .hdb-plus') ?? undefined);
    const choix = hote.querySelector('.hdb-creation select') as HTMLSelectElement;
    expect(choix.value).toBe('');
  });
});

describe('⑤-quaterdecies 🔴🔴 un client dont l’adresse ne peut rien filtrer', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DÉCISION D'ARNO (lot 6, point 2) : « le propriétaire client (JULLIEN-GARRIDO Cédric) apparaît en capsule
   * dans l'encart Propriétaire même si son adresse d'annuaire est @sansvisavis.com. Capsule non sélectionnable
   * pour les mails, avec la mention discrète “adresse à corriger dans l'annuaire” (lien vers sa fiche).
   * Applique la même règle à tout client dont l'adresse est interne ou en @example.invalid. »
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const PROPRIO_INTERNE: Interlocuteur[] = [
    inter({ adresse: 'c.jullien@sansvisavis.com', nom: 'JULLIEN - GARRIDO Cédric', nbMails: 1, aEcrit: 0, enCopie: 1, interne: true }),
    inter({ adresse: 'gestion@criterimmo.fr', nom: 'Gestion', nbMails: 60, interne: true }),
    inter({ adresse: 'locataire@fictif.test', nom: 'MARTY Jean-François', nbMails: 20 }),
  ];

  let fiches: { sorte: string; id: number }[] = [];

  async function monterAvec(
    clients: unknown[], interlocuteurs = PROPRIO_INTERNE,
    /* Le rangement de la fiche : il décide de l'encart où la capsule atterrit. */
    cats: [string, CategoriePartie][] = [
      ['c.jullien@sansvisavis.com', 'proprietaire'],
      ['locataire@fictif.test', 'locataire'],
    ],
  ): Promise<void> {
    fiches = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          interlocuteurs, interlocuteursTronques: false,
        },
      });
    }));
    await monter({
      categories: new Map(cats) as Map<string, CategoriePartie>,
      clients: clients as never,
      onFicheClient: (sorte: 'proprietaire' | 'locataire', id: number) => { fiches.push({ sorte, id }); },
    });
  }

  const capsuleProprio = (): HTMLElement =>
    ([...hote.querySelectorAll('.hdb-groupe--encart')][0] as HTMLElement);

  it('🔴🔴 LE DÉFAUT DE lot-299 : le propriétaire garde sa capsule malgré son adresse @sansvisavis.com', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'JULLIEN - GARRIDO Cédric', categorie: 'proprietaire', fiche: { sorte: 'proprietaire', id: 146 } }]);
    const caps = [...capsuleProprio().querySelectorAll('.hdb-capsule')] as HTMLElement[];
    expect(caps).toHaveLength(1);
    expect(caps[0].textContent).toContain('JULLIEN - GARRIDO Cédric');
  });

  it('🔴🔴 SA CASE EST DÉSACTIVÉE : elle ne filtre rien', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    const c = capsuleProprio().querySelector('.hdb-capsule input') as HTMLInputElement;
    expect(c.disabled).toBe(true);
    expect(c.checked).toBe(false);
  });

  it('🔴🔴 LA MENTION EST LÀ, ET ELLE MÈNE À SA FICHE', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: { sorte: 'proprietaire', id: 146 } }]);
    const lien = capsuleProprio().querySelector('.hdb-a-corriger') as HTMLButtonElement;
    expect(lien).not.toBeNull();
    expect(lien.textContent).toBe('adresse à corriger dans l’annuaire');
    expect(lien.tagName).toBe('BUTTON');
    await cliquer(lien);
    expect(fiches).toEqual([{ sorte: 'proprietaire', id: 146 }]);
  });

  it('⚠️ SANS FICHE À OUVRIR, LA MENTION RESTE — sans lien', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    const m = capsuleProprio().querySelector('.hdb-a-corriger') as HTMLElement;
    expect(m).not.toBeNull();
    expect(m.tagName).toBe('SPAN');
    expect(m.className).toContain('hdb-a-corriger--muet');
  });

  it('🔴 LE MOTIF EST DIT EN TOUTES LETTRES, jamais par la seule couleur', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    const label = capsuleProprio().querySelector('.hdb-case--capsule') as HTMLElement;
    expect(label.getAttribute('title')).toContain('une des nôtres');
  });

  it('🔴 LA MÊME RÈGLE POUR UNE ADRESSE EN « .invalid »', async () => {
    await monterAvec(
      [{ adresse: 'test.fiche@example.invalid', nom: 'Co-propriétaire', categorie: 'proprietaire', fiche: null }],
      [inter({ adresse: 'test.fiche@example.invalid', nom: 'Co-propriétaire', nbMails: 0, aEcrit: 0 })],
      [['test.fiche@example.invalid', 'proprietaire']],
    );
    const c = capsuleProprio().querySelector('.hdb-capsule input') as HTMLInputElement;
    expect(c.disabled).toBe(true);
    expect(capsuleProprio().querySelector('.hdb-a-corriger')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — NOS AUTRES ADRESSES SONT MAINTENANT **LISTÉES**, À PART ═══════════
   *
   * Ce cas vérifiait qu'elles ne l'étaient PAS, et que la note le disait. Arno a rouvert la question : elles
   * forment désormais le groupe « Notre agence », cochées par défaut, décochables. Ce qui ne change pas — et
   * c'est ce que ce cas garde — c'est qu'elles restent HORS des quatre groupes de parties : une adresse de
   * l'agence n'est pas un propriétaire, et le client dont l'adresse est une des nôtres garde, lui, sa capsule
   * dans son encart (décision d'Arno au lot 6).
   */
  it('🔴🔴 NOS AUTRES ADRESSES FORMENT « Notre agence », et jamais une partie', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    /* ① la bande existe, avec son titre et son compteur */
    const bande = hote.querySelector('.hdb-groupe--nous') as HTMLElement;
    expect(bande).not.toBeNull();
    expect(bande.textContent).toContain('Notre agence');
    /* ② l'adresse de l'agence n'est dans AUCUN des quatre groupes de parties */
    for (const g of [...hote.querySelectorAll('.hdb-groupe:not(.hdb-groupe--nous)')]) {
      expect(g.textContent).not.toContain('gestion@criterimmo.fr');
    }
    /* ③ et le client dont l'adresse est une des nôtres garde sa capsule dans son encart (le nom affiché est
       celui de l'ANNUAIRE, « JULLIEN - GARRIDO Cédric », et non celui de l'en-tête du courrier). */
    expect(capsuleProprio().textContent).toContain('JULLIEN - GARRIDO Cédric');
    expect(capsuleProprio().textContent).toContain('adresse à corriger');
    /* ④ la phrase qui disait « ne sont pas listées » a disparu : elle serait fausse. */
    expect(texte()).not.toContain('ne sont pas listées');
  });

  /** 🔴🔴 ET DÉCOCHER L'AGENCE ÉCARTE **NOS** MAILS : le `sauf=` part au serveur, et lui seul. */
  it('🔴🔴 DÉCOCHER « Notre agence » ENVOIE `sauf=` — jamais `avec=`', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    const bande = hote.querySelector('.hdb-groupe--nous') as HTMLElement;
    /* On déplie, puis on décoche « tout le groupe ». */
    await cliquer(bande.querySelector('.hdb-replier') ?? undefined);
    await cliquer(bande.querySelector('.hdb-case--groupe input') ?? undefined);
    expect(appels.some((a) => a.includes('sauf=gestion%40criterimmo.fr'))).toBe(true);
    /* 🔴 L'AGENCE NE COMPTE PAS COMME UNE PARTIE COCHÉE : la ligne d'état ne bouge pas, et aucun `avec=`. */
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('Aucune partie cochée');
    expect(appels.some((a) => a.includes('avec='))).toBe(false);
  });

  it('⚠️ AUCUNE MENTION SUR UN CLIENT ORDINAIRE, et sa case coche', async () => {
    await monterAvec([{ adresse: 'locataire@fictif.test', nom: 'MARTY', categorie: 'locataire', fiche: null }]);
    const loc = [...hote.querySelectorAll('.hdb-groupe--encart')][1] as HTMLElement;
    expect(loc.querySelector('.hdb-a-corriger')).toBeNull();
    expect((loc.querySelector('.hdb-capsule input') as HTMLInputElement).disabled).toBe(false);
  });

  it('⚠️ AUCUNE PASTILLE « + » SUR UNE ADRESSE À CORRIGER : ce n’est pas un contact', async () => {
    await monterAvec([{ adresse: 'c.jullien@sansvisavis.com', nom: 'C. J.', categorie: 'proprietaire', fiche: null }]);
    expect(capsuleProprio().querySelector('.hdb-plus')).toBeNull();
  });
});

describe('⑤-quindecies 🔴🔴 « Période retenue » dit « aujourd’hui » au lieu de la date du jour', () => {
  /**
   * DEMANDE D'ARNO (lot 6, point 4) : « quand la date de fin est aujourd'hui, écrire “aujourd'hui” au lieu de la
   * date (ex. “du 01/02/2025 à aujourd'hui”). Même règle dans les choix “Depuis l'entrée du dernier locataire”,
   * “Un événement” (en cours) et “Dates personnalisées”. »
   *
   * 🔴 UNE SEULE CORRECTION COUVRE LES TROIS CHOIX : aucun des trois boutons n'écrit de date, ils RÈGLENT les
   * bornes que cette phrase affiche. Le cas ci-dessous les emprunte tous les trois, sur le vrai écran.
   */
  const retenue = (): string => hote.querySelector('.hdb-effective-valeur')?.textContent ?? '';

  it('🔴 L’HEURE DESCEND JUSQU’À LA PHRASE : `maintenant` est passé au module pur', () => {
    expect(SRC).toContain('motPeriodeEffective(reglages.periode, maintenant)');
  });

  it('🔴🔴 « UN ÉVÉNEMENT » EN COURS : « du 03/02/2026 à aujourd’hui »', async () => {
    await monter();
    /* L'événement 7 est ouvert le 03/02/2026 et n'est pas clos ; MAINTENANT est le 04/10/2026. */
    await cliquer([...hote.querySelectorAll('.hdb-seg')].find((b) => b.textContent === 'Un événement'));
    expect(retenue()).toBe('du 03/02/2026 à aujourd’hui');
  });

  it('🔴🔴 « DEPUIS L’ENTRÉE DU DERNIER LOCATAIRE » : la même règle', async () => {
    await monter({
      occupations: [{ libelle: 'MARTY Jean-François', depuis: '2025-05-01', jusqua: null }],
    });
    await cliquer([...hote.querySelectorAll('.hdb-seg')]
      .find((b) => (b.textContent ?? '').includes('dernier locataire')));
    expect(retenue()).toBe('du 01/05/2025 à aujourd’hui');
  });

  it('🔴🔴 « DATES PERSONNALISÉES » : la même règle, et la date de fin saisie est bien celle du jour', async () => {
    await monter();
    await cliquer([...hote.querySelectorAll('.hdb-seg')].find((b) => b.textContent === 'Dates personnalisées'));
    const champs = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(champs).toHaveLength(2);
    await changer(champs[0], '2025-02-01');
    await changer(champs[1], '2026-10-04');
    expect(retenue()).toBe('du 01/02/2025 à aujourd’hui');
  });

  it('⚠️ UNE AUTRE DATE DE FIN RESTE UNE DATE', async () => {
    await monter();
    await cliquer([...hote.querySelectorAll('.hdb-seg')].find((b) => b.textContent === 'Dates personnalisées'));
    const champs = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    await changer(champs[0], '2025-02-01');
    await changer(champs[1], '2026-09-28');
    expect(retenue()).toBe('du 01/02/2025 au 28/09/2026');
  });

  it('⚠️ « TOUS LES ÉCHANGES » NE CHANGE PAS', async () => {
    await monter();
    expect(retenue()).toBe('tous les échanges, sans borne de date');
  });
});

describe('⑤-sexdecies 🔴🔴 l’ordre des capsules : les clients d’abord', () => {
  /**
   * RÈGLE D'ARNO (lot 8, point 4) : « D'abord les CLIENTS, triés par “a écrit” décroissant ; puis les CONTACTS,
   * triés par “a écrit” décroissant ; à égalité, par “en copie” décroissant, puis par nom. L'ordre se recalcule
   * quand la période change. »
   *
   * 🔴 CE QUI ÉTAIT FAUX : l'ordre était celui du dépôt — du plus bavard au moins bavard, clients et contacts
   * mêlés. Sur lot-47, le propriétaire (13 écrits) passait donc AVANT son secrétariat (5) ; mais sur un bien où
   * le secrétariat écrit plus, le client se retrouvait sous ses propres contacts.
   */
  it('🔴🔴 LE CLIENT PASSE DEVANT SON CONTACT PLUS BAVARD, sur le vrai écran', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (String(url).includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (String(url).includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (String(url).includes('/historique/parties')) {
        return reponse({ etat: 'ok', data: { parties: [{ adresse: 'secretariat@fictif.test', categorie: 'proprietaire' }], cartes: [] } });
      }
      return reponse({
        etat: 'ok',
        data: {
          lignes: LIGNES, suite: false, entete: { nbMails: 2 },
          /* Le secrétariat écrit DIX FOIS plus que le propriétaire — et il doit passer après lui. */
          interlocuteurs: [
            inter({ adresse: 'secretariat@fictif.test', nom: 'Secrétariat', nbMails: 40, aEcrit: 40 }),
            inter({ adresse: 'proprio@fictif.test', nom: 'M. ROI Nathan', nbMails: 4, aEcrit: 4 }),
          ],
          interlocuteursTronques: false,
        },
      });
    }));
    await monter();
    const prop = [...hote.querySelectorAll('.hdb-groupe--encart')][0] as HTMLElement;
    const noms = [...prop.querySelectorAll('.hdb-personne-nom')].map((e) => e.textContent);
    expect(noms).toEqual(['M. ROI Nathan', 'Secrétariat']);
  });

  it('🔒 L’ORDRE VIENT DU MODULE PUR, et il lit la carte de la FICHE — pas la carte fusionnée', () => {
    expect(SRC).toContain('ordonnerLesCapsules(g.interlocuteurs, g.cle, categories)');
    /* ⚠️ `categoriesFusionnees` ICI aurait fait passer pour client un contact rangé en base. */
    expect(SRC).not.toContain('ordonnerLesCapsules(g.interlocuteurs, g.cle, categoriesFusionnees)');
  });
});

describe('⑥ 🔴🔴 les composants existants sont réutilisés, jamais redessinés', () => {
  it('🔴🔴 `LigneVie` est IMPORTÉE de « Vie du bien »', () => {
    expect(SRC).toMatch(/import \{[^}]*LigneVie[^}]*\} from '\.\/VieDuBien'/);
    expect(codeSeul(SRC)).toContain('<LigneVie');
  });

  it('🔴🔴 `CartePieceConversation` est IMPORTÉE du récapitulatif des pièces', () => {
    expect(SRC).toMatch(/import \{[^}]*CartePieceConversation[^}]*\} from '\.\/PiecesDeLaConversation'/);
    expect(codeSeul(SRC)).toContain('<CartePieceConversation');
  });

  /**
   * 🔴🔴 AUCUNE BALISE DES DEUX COMPOSANTS N'EST DUPLIQUÉE ICI. Si l'une de ces classes apparaissait dans le code
   * de ce fichier, c'est qu'on aurait redessiné la ligne ou la carte au lieu de l'appeler — exactement ce
   * qu'Arno interdit, et exactement ce que ce dépôt a déjà payé plusieurs fois.
   *
   * ⚠️ `vdb-liste`, `vdb-pages` ET `pdc-groupe*` / `pdc-grille` NE SONT PAS DANS CETTE LISTE, et c'est voulu : ce
   * sont les CONTENEURS que les deux écrans partagent (la liste, la pagination, le groupe de pièces sous sa
   * date), pas le rendu de la ligne ni celui de la carte.
   */
  it('🔴🔴 ni la ligne ni la carte ne sont redessinées (aucune de leurs balises ici)', () => {
    const code = codeSeul(SRC);
    for (const classe of [
      'vdb-item', 'vdb-rangee', 'vdb-ligne', 'vdb-triangle', 'vdb-capsule', 'vdb-objet', 'vdb-extrait',
      'vdb-trombone', 'vdb-detail', 'vdb-qui', 'vdb-quand',
      'pdc-carte', 'pdc-apercu', 'pdc-vignette', 'pdc-actions', 'pdc-action', 'pdc-pied-carte', 'pdc-aussi',
    ]) {
      expect(code, `la classe ${classe} ne doit pas être redessinée ici`).not.toContain(classe);
    }
  });

  /**
   * 🔴🔴 LE SEUIL DE REPLI N'EST PAS RECOPIÉ DANS L'ÉCRAN : ni le chiffre, ni la comparaison. C'est
   * `replierLesCartes` (de `partieCategorie.ts`, réexporté par le module pur) qui décide — écrire `> 6` ici
   * aurait fait un second juge pour la même borne, et c'est sur les bornes qu'on se trompe.
   */
  it('🔴🔴 ni le seuil de repli ni sa comparaison ne sont écrits dans l’écran', () => {
    const code = codeSeul(SRC);
    expect(code).toContain('replierLesCartes(g.nb)');
    expect(code).not.toMatch(/[<>]=?\s*6\b/);
    expect(code).not.toContain('SEUIL_REPLI_CARTES');
  });

  /** 🔴 LE TRI DES PIÈCES VIENT DU MODULE EXISTANT : aucun `sort` de pièces n'est écrit ici. */
  it('🔴 le tri et le dédoublonnage des pièces viennent de `piecesConversation`', () => {
    expect(SRC).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/lib\/gestion\/piecesConversation'/);
    expect(codeSeul(SRC)).toContain('piecesDeLaConversation(');
    expect(codeSeul(SRC)).toContain('dedoublonnerPieces(');
    expect(codeSeul(SRC)).toContain('grouperParMessage(');
  });

  /** 🔴 AUCUNE COULEUR INVENTÉE : le CSS n'emploie que des jetons `--color-svv-*`. */
  it('🔴 aucune couleur en dur, et rien sur `:root`', () => {
    const css = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[1] ?? '';
    /* ⚠️ ON NE REGARDE QUE LES RÈGLES PROPRES À CE BLOC (après la dernière interpolation de CSS importé) : les
       styles empruntés sont éprouvés chez eux, et les relire ici ferait un second juge pour le même code. */
    const propre = css.split('.hdb{')[1] ?? '';
    expect(propre).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(propre).not.toMatch(/\brgba?\(/);
    expect(propre).not.toContain(':root');
    expect(propre).toContain('--color-svv-');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ 🔴🔴 LE MONTAGE : EN DERNIER, ET LE HAUT DE LA FICHE N'A PAS BOUGÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑦ 🔴🔴 le montage dans la fiche d’un bien', () => {
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — CE GROUPE DÉCRIT MAINTENANT LA SUPPRESSION, ET IL DIT CE QU'IL ATTENDAIT ═════
   *
   * ACCORD EXPLICITE D'ARNO (04/10/2026) : « le bloc “Vie du bien” est SUPPRIMÉ (deux listings de mails, c'est un
   * de trop). Le moteur de recherche prend SA PLACE (juste sous “Historique des locataires”). »
   *
   * ═══ CE QUE CES DEUX ÉPREUVES ATTENDAIENT AU LOT PRÉCÉDENT ═════════════════════════════════════════════════
   * Que le moteur soit monté **APRÈS** le lien « Tout l'historique des échanges », et que la suite
   * `… → Historique des locataires → VieDuBien → lien → HistoriqueDuBien` se lise dans cet ordre. C'était juste :
   * le bloc était alors AJOUTÉ tout en bas, et rien au-dessus ne devait bouger.
   *
   * ═══ 🔴 CE QUI EST VRAI MAINTENANT, ET POURQUOI CE N'EST PAS UN RELÂCHEMENT ═════════════════════════════════
   * Le moteur occupe le rang de « Vie du bien », DANS la même enveloppe `ancreVie` ; le lien passe donc APRÈS
   * lui. Ce que l'épreuve garde — et c'est l'exigence d'Arno, inchangée — c'est que **les blocs du haut sont
   * tous là, dans le même ordre, et avant le moteur**. La preuve d'empreintes du haut de fiche (avant = après,
   * rang par rang, sur trois fiches réelles) est l'autre moitié : celle-ci tient le code, celle-là le rendu.
   */
  it('🔴🔴 le moteur prend la PLACE de « Vie du bien », dans la même ancre', () => {
    /* Il est DANS l'enveloppe qui porte l'ancre : un second ancrage aurait fait deux endroits où le défilement
       se décide, et `?bloc=vie` comme le cartouche visent celui-là. */
    const ancre = ANNUAIRE.indexOf('<div ref={ancreVie}>');
    const bloc = ANNUAIRE.indexOf('<HistoriqueDuBien');
    const lien = ANNUAIRE.indexOf('Tout l’historique des échanges →');
    expect(ancre).toBeGreaterThan(0);
    expect(bloc).toBeGreaterThan(ancre);
    expect(lien).toBeGreaterThan(bloc);
  });

  /**
   * 🔴🔴 LA FICHE D'UN BIEN NE MONTE PLUS « VIE DU BIEN ». On le vérifie sur `VueLot` et non sur le fichier
   * entier : le composant RESTE monté par `VueLocataire`, où il est le seul listing et où Arno n'a rien ouvert.
   * Chercher `<VieDuBien` dans tout le fichier aurait donc interdit ce qui doit rester.
   */
  it('🔴🔴 plus aucun second listing de mails dans la fiche d’un bien', () => {
    const vueLot = ANNUAIRE.slice(
      ANNUAIRE.indexOf('function VueLot'), ANNUAIRE.indexOf('function occupationsPourHistorique'));
    expect(vueLot).not.toContain('<VieDuBien');
    expect(vueLot).toContain('<HistoriqueDuBien');
    /* …et il reste monté là où il est seul : la fiche d'un locataire. */
    expect(ANNUAIRE).toContain('<VieDuBien lotCle={logementDesMails.numero}');
  });

  /** 🔴 LE HAUT DE LA FICHE NE BOUGE PAS : les blocs d'avant, tous là, dans le même ordre, et avant le moteur. */
  it('🔴🔴 les blocs d’avant sont tous là, dans le même ordre, et avant le moteur', () => {
    const places = [
      '<header className="ann-tete">',
      '<CartoucheEvenement nb={f.evenementsOuverts}',
      'id="ann-prop"',
      'id="ann-occ"',
      'id="ann-histo-loc"',
      '<div ref={ancreVie}>',
      '<HistoriqueDuBien',
    ].map((m) => ANNUAIRE.indexOf(m));
    expect(places.every((p) => p > 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  /**
   * 🔴🔴 LES CINQ CHOSES QU'ARNO A NOMMÉES SONT REPRISES, et c'est ici qu'on refuse la perte. « Tout ce que
   * faisait “Vie du bien” est repris dans le moteur, rien n'est perdu : recherche dans l'objet et le texte,
   * filtre “Avec pièces jointes”, filtre “Avec événement ouvert”, dépliage d'un mail par le triangle ▸,
   * sélection d'un mail. »
   */
  it('🔴🔴 la suppression ne perd RIEN des cinq fonctions nommées', () => {
    /* ① la recherche. ⚠️ SON INTITULÉ A CHANGÉ AU POINT 5 : « Rechercher dans les mails affichés… », parce
       qu'elle filtre désormais la sélection déjà affichée au lieu d'interroger le serveur. Ce qu'elle couvre
       s'est ÉLARGI (objet, texte, expéditeur, nom des pièces) — rien n'est perdu, le mot est plus juste. */
    expect(SRC).toContain('Rechercher dans les mails affichés…');
    expect(SRC).toContain('setSaisie(e.target.value)');
    // ② les pièces jointes : l'intitulé du groupe porte le mot, les boutons gardent ce qui les distingue.
    expect(SRC).toContain('Pièces jointes');
    expect(SRC).toContain("['avec', 'Avec']");
    expect(SRC).toContain("['sans', 'Sans']");
    // ③ l'événement ouvert, et le cartouche qui y arrive déjà allumé.
    expect(SRC).toContain('Événement ouvert');
    expect(SRC).toContain('evenementOuvert: !r.evenementOuvert');
    expect(ANNUAIRE).toContain("evenementOuvertInitial={filtreVie === 'evenement'}");
    // ④ le dépliage par le triangle : c'est `LigneVie`, importée et non recopiée.
    expect(SRC).toContain("import { CSS_VIE_DU_BIEN, LigneVie } from './VieDuBien'");
    expect(SRC).toContain('<LigneVie l={l}');
    // ⑤ la sélection d'un mail.
    expect(SRC).toContain('onOuvrirFil={onOuvrirFil}');
  });

  it('🔴 le CSS du bloc est injecté comme les autres', () => {
    expect(ANNUAIRE).toContain('<style>{CSS_HISTORIQUE_DU_BIEN}</style>');
    expect(ANNUAIRE).toContain('<style>{CSS_VIE_DU_BIEN}</style>');
  });

  /** 🔴 LES OCCUPATIONS PASSENT PAR LA FICHE : la route ne les rend pas pour une cible `lot-…`. */
  it('🔴 les occupations et les catégories sont fournies par la fiche', () => {
    expect(ANNUAIRE).toContain('occupations={occupationsPourHistorique(f)}');
    expect(ANNUAIRE).toContain('categories={categoriesDesParties(f)}');
    expect(ANNUAIRE).toContain('f.occupations.map((o) => ({ libelle: o.nom, depuis: o.entree, jusqua: o.sortie }))');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — « LE MÊME COMPOSANT, PAS UNE COPIE » ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Réutilise le formulaire “Nouvelle fiche” / “Modifier la fiche”
 * des clients — LE MÊME COMPOSANT, PAS UNE COPIE. »
 *
 * 🔴 C'EST EXACTEMENT LA MÊME EXIGENCE QUE POUR `LigneVie` ET `CartePieceConversation` (lot 2), et le même garde :
 * l'import doit exister, et AUCUN champ ne doit être redessiné ici. Ce dépôt a déjà payé la recopie plusieurs
 * fois — deux listes de domaines, deux règles de repli, trois listes de types d'images —, et c'est toujours la
 * copie qu'on regarde le moins qui garde l'erreur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⑤-septdecies 🔴🔴 le formulaire du « + » est celui des clients, importé', () => {
  it('🔴🔴 IL EST IMPORTÉ, ET MONTÉ TEL QUEL', () => {
    expect(SRC).toContain("from './CartesPersonnes'");
    expect(SRC).toContain('FormulaireCarte');
    expect(SRC).toContain('<FormulaireCarte');
  });

  /**
   * 🔴🔴 LES HUIT CHAMPS NE SONT PAS REDESSINÉS ICI. La petite carte du lot 6 les portait en clair (`svv-label`
   * « Nom », « Téléphone », « Adresse mail ») ; elle a disparu, et ce garde empêche qu'elle revienne champ par
   * champ — c'est-à-dire qu'un second formulaire se reforme sans qu'on s'en aperçoive.
   */
  it('🔴🔴 AUCUN CHAMP DE FICHE N’EST REDESSINÉ DANS CE FICHIER', () => {
    const corps = SRC.split('export const CSS_HISTORIQUE_DU_BIEN')[0];
    for (const mort of ['hdb-creation-champ', 'hdb-creation-titre', 'hdb-creation-champs',
      '>Adresse mail<', 'placeholder="facultatif"']) {
      expect(corps, mort).not.toContain(mort);
    }
    /* ⚠️ UN SEUL `<input>` SUBSISTE DANS CE BLOC : il n'y en a aucun pour la fiche. Les seules saisies du fichier
       sont celles du tableau de bord (dates, recherche, cases) — et le `select` de la CATÉGORIE, que seul ce
       fichier peut tenir (voir l'encadré du « + »). */
    const bloc = corps.slice(corps.indexOf('{aCreer !== null && ('), corps.indexOf('{creationEnCours &&'));
    expect(bloc).not.toContain('<input');
    expect(bloc).toContain('<select');
  });

  /**
   * 🔴 LES RÈGLES ET LES MOTS VIENNENT DU MODULE PUR — le titre, l'exigence, la traduction du corps de requête.
   * Une phrase recopiée ici aurait fini par ne plus ressembler à celle du haut de fiche.
   */
  it('🔴 LE TITRE, LA RÈGLE ET LA TRADUCTION VIENNENT DU MODULE PUR', () => {
    expect(SRC).toContain("from '../../../../lib/gestion/ficheContact'");
    expect(SRC).toContain('TITRE_CONTACT_NOUVEAU');
    expect(SRC).toContain('ficheAEnvoyer(champs)');
    expect(SRC).toContain('couperNomEtPrenom');
    /* ⚠️ Et aucune des deux phrases du module pur n'est réécrite à la main ici. */
    expect(SRC).not.toContain("'Nouveau contact'");
    expect(SRC).not.toContain('Le nom est obligatoire');
  });

  /**
   * 🔴🔴 LA PROPOSITION AUTOMATIQUE EST UN PRÉ-REMPLISSAGE, ET C'EST LE POINT 1 QUI LE DIT : « elles deviennent de
   * simples PRÉ-REMPLISSAGES du formulaire du “+” ». Le formulaire lit donc la carte proposée AVANT la signature,
   * champ par champ — la proposition est le travail déjà fait.
   */
  it('🔴🔴 LA PROPOSITION PASSE DEVANT LA SIGNATURE, CHAMP PAR CHAMP', () => {
    expect(SRC).toContain('propose?.adressePostale ?? trouve?.adressePostale');
    expect(SRC).toContain('propose?.telephone ?? trouve?.telephone');
    expect(SRC).toContain('propose?.nom ?? trouve?.nom');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LES SIX COMBINAISONS D'ARNO, SUR LE LISTING ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : « seul le groupe Propriétaire est coché, et les mails du locataire s'affichent
 * quand même ».
 *
 * LA CAUSE, DIAGNOSTIQUÉE AVANT D'ÉCRIRE UNE LIGNE : l'interrupteur « Tous les mails du bien sur la période »
 * était ALLUMÉ par défaut, et sa règle (lot 2) était d'IGNORER les cases cochées — `reglagesEnFiltres` rendait
 * `interlocuteurs: []`. Cocher un groupe ne changeait donc rien, et rien à l'écran ne le disait.
 *
 * MESURÉ EN BASE sur lot-290 (bien 421), pour écarter l'autre explication possible — un recouvrement légitime :
 *   · 326 mails rattachés au bien ;
 *   · le groupe Propriétaire (3 adresses) apparaît dans **198** d'entre eux ;
 *   · et **0** de ces 198 est écrit par un locataire.
 * Avec un filtre qui marche, Arno aurait donc vu 198 mails et aucun mail de locataire. Il en voyait 326.
 *
 * CE GROUPE ÉPROUVE LES SIX COMBINAISONS QU'ARNO DEMANDE, sur le LISTING lui-même (le résumé des pièces, lui, les
 * rejoue plus haut — il suit exactement la même sélection).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⑤-octodecies 🔴🔴 le filtre par parties : les six combinaisons', () => {
  const M_PROPRIO = ligne({
    messageId: 10, filId: 100, recuLe: '2026-03-01T09:00:00Z', objet: 'Charges 2026',
    de: 'proprio@fictif.test', deNom: 'M. ROI Nathan',
  });
  const M_LOCATAIRE = ligne({
    messageId: 11, filId: 110, recuLe: '2026-02-01T09:00:00Z', objet: 'État des lieux',
    de: 'locataire@fictif.test', deNom: 'MARTY Jean-François',
  });
  const M_CONTACT = ligne({
    messageId: 13, filId: 130, recuLe: '2026-01-20T09:00:00Z', objet: 'Sinistre dégât des eaux',
    de: 'assureur@fictif.test', deNom: 'AXA',
  });
  const M_AGENCE = ligne({
    messageId: 12, filId: 100, recuLe: '2026-01-15T09:00:00Z', objet: 'Charges 2026', sens: 'envoye',
    de: 'gestion@criterimmo.fr', deNom: 'Gestion CRITERIMMO',
  });

  /**
   * ⚠️ LA LISTE DES INTERLOCUTEURS PORTE **NOTRE** ADRESSE, avec `interne: true` — sans elle, la bande
   * « Notre agence » n'existe pas (elle n'apparaît que si nous avons écrit sur ce bien). Elle est LOCALE à ce
   * groupe : l'ajouter au jeu partagé aurait fait naître la bande dans toutes les autres épreuves du fichier,
   * dont plusieurs comptent les capsules et les groupes.
   */
  const INTERLOCUTEURS_ET_NOUS: Interlocuteur[] = [
    ...INTERLOCUTEURS,
    inter({ adresse: 'gestion@criterimmo.fr', nom: 'Gestion', nbMails: 1, aEcrit: 1, enCopie: 0, interne: true }),
  ];

  /**
   * 🔴🔴 LE SERVEUR EST REJOUÉ À PARTIR DE L'ADRESSE DEMANDÉE, et non d'une réponse écrite d'avance. C'est ce qui
   * rend l'épreuve honnête : elle n'impose pas le résultat, elle l'applique — avec la MÊME règle que le SQL de
   * `conditions` (`avec` = l'adresse apparaît dans le mail ; `sauf` = l'adresse en est l'EXPÉDITEUR).
   */
  const servir = (): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return reponse({ etat: 'ok', geste: null });
      const u = String(url);
      appels.push(u);
      if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (u.includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });

      const p = new URL(u, 'http://local').searchParams;
      const avec = (p.get('avec') ?? '').split(',').filter((x) => x !== '');
      const sauf = (p.get('sauf') ?? '').split(',').filter((x) => x !== '');
      /** Qui apparaît dans un mail : son expéditeur, et le correspondant de son échange. */
      const dedans = (l: typeof M_PROPRIO): string[] => (l.filId === 100
        ? [l.de, 'proprio@fictif.test', 'gestion@criterimmo.fr']
        : [l.de, 'gestion@criterimmo.fr']);

      const lignes = [M_PROPRIO, M_LOCATAIRE, M_CONTACT, M_AGENCE]
        .filter((l) => avec.length === 0 || dedans(l).some((a) => avec.includes(a)))
        .filter((l) => !sauf.includes(l.de));
      return reponse({
        etat: 'ok',
        data: {
          lignes, suite: false, entete: { nbMails: lignes.length },
          interlocuteurs: INTERLOCUTEURS_ET_NOUS, interlocuteursTronques: false,
        },
      });
    }));
  };

  const objets = (): string[] => [...hote.querySelectorAll('.hdb-ancre')]
    .map((x) => (x.textContent ?? '')).filter((t) => t !== '');
  const contient = (mot: string): boolean => objets().some((t) => t.includes(mot));

  const cocherGroupe = async (titre: string): Promise<void> => {
    const g = ([...hote.querySelectorAll('.hdb-groupe')] as HTMLElement[])
      .find((x) => (x.querySelector('.hdb-replier')?.textContent ?? '').includes(titre));
    await cliquer(g?.querySelector('.hdb-case--groupe input') ?? undefined);
  };

  /** ① RIEN DE COCHÉ → TOUS LES MAILS DU BIEN. */
  it('🔴🔴 ① RIEN DE COCHÉ → tous les mails du bien', async () => {
    servir();
    await monter();
    expect(contient('Charges 2026')).toBe(true);
    expect(contient('État des lieux')).toBe(true);
    expect(contient('Sinistre')).toBe(true);
    expect(appels.some((a) => a.includes('avec='))).toBe(false);
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('tous les mails du bien');
  });

  /**
   * ② 🔴🔴 PROPRIÉTAIRE SEUL → AUCUN MAIL DU LOCATAIRE. C'est LE cas d'Arno, et celui qui échouait.
   */
  it('🔴🔴 ② PROPRIÉTAIRE SEUL → aucun mail du locataire', async () => {
    servir();
    await monter();
    await cocherGroupe('Propriétaire');
    expect(contient('Charges 2026')).toBe(true);
    /* 🔴 LA PREUVE DEMANDÉE : plus aucun mail du locataire, ni du tiers. */
    expect(contient('État des lieux')).toBe(false);
    expect(contient('Sinistre')).toBe(false);
    expect(appels.some((a) => a.includes('avec=proprio%40fictif.test'))).toBe(true);
  });

  it('🔴🔴 ③ LOCATAIRE SEUL → ses échanges, et rien du propriétaire', async () => {
    servir();
    await monter();
    await cocherGroupe('Locataire');
    expect(contient('État des lieux')).toBe(true);
    expect(contient('Charges 2026')).toBe(false);
    expect(contient('Sinistre')).toBe(false);
  });

  it('🔴🔴 ④ LES DEUX → les deux familles, et toujours rien du tiers', async () => {
    servir();
    await monter();
    await cocherGroupe('Propriétaire');
    await cocherGroupe('Locataire');
    expect(contient('Charges 2026')).toBe(true);
    expect(contient('État des lieux')).toBe(true);
    expect(contient('Sinistre')).toBe(false);
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('2 parties cochées');
  });

  /** ⑤ UN CONTACT SEUL : l'assureur est « non affecté » ici — une capsule comme une autre. */
  it('🔴🔴 ⑤ UN CONTACT SEUL → son échange seulement', async () => {
    servir();
    await monter();
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    await cliquer(gris.querySelector('.hdb-capsule input') ?? undefined);
    expect(contient('Sinistre')).toBe(true);
    expect(contient('Charges 2026')).toBe(false);
    expect(contient('État des lieux')).toBe(false);
  });

  /**
   * ⑥ 🔴🔴 AGENCE DÉCOCHÉE → NOS MAILS PARTENT, ET EUX SEULS. Le mail de l'agence a le même objet et le même
   * échange que celui du propriétaire : c'est ce qui rend le cas probant — seul celui que NOUS avons écrit s'en
   * va, celui du propriétaire reste.
   */
  it('🔴🔴 ⑥ AGENCE DÉCOCHÉE → les mails que nous avons écrits disparaissent', async () => {
    servir();
    await monter();
    expect(objets().filter((t) => t.includes('Charges 2026'))).toHaveLength(2);

    const bande = hote.querySelector('.hdb-groupe--nous') as HTMLElement;
    await cliquer(bande.querySelector('.hdb-replier') ?? undefined);
    await cliquer(bande.querySelector('.hdb-case--groupe input') ?? undefined);

    /* 🔴 LE NÔTRE EST PARTI, CELUI DU PROPRIÉTAIRE EST RESTÉ — et les autres n'ont pas bougé. */
    expect(objets().filter((t) => t.includes('Charges 2026'))).toHaveLength(1);
    expect(contient('État des lieux')).toBe(true);
    expect(contient('Sinistre')).toBe(true);
    /* 🔴 ET ÇA NE COMPTE PAS COMME UNE PARTIE COCHÉE. */
    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('Aucune partie cochée');
  });

  /** 🔴 LES DEUX SE COMPOSENT : les échanges du propriétaire, sauf ce que nous y avons écrit. */
  it('🔴🔴 ⑦ PROPRIÉTAIRE COCHÉ **ET** AGENCE DÉCOCHÉE : son échange, sans nos mails', async () => {
    servir();
    await monter();
    await cocherGroupe('Propriétaire');
    const bande = hote.querySelector('.hdb-groupe--nous') as HTMLElement;
    await cliquer(bande.querySelector('.hdb-replier') ?? undefined);
    await cliquer(bande.querySelector('.hdb-case--groupe input') ?? undefined);
    expect(objets().filter((t) => t.includes('Charges 2026'))).toHaveLength(1);
    expect(contient('État des lieux')).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 2 — « 0 ÉCRIT · 0 EN COPIE » COCHÉ SEUL AFFICHE 0 MAIL ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026), sur lot-290 : le propriétaire décoché, seules Jessica TADEU et Kelly VANKESBEULQUE
 * cochées — « a écrit : 0 · en copie : 0 » toutes les deux —, et le listing montrait **2 mails** de Gabrielle
 * Garreau, dont celui du 20/11/2025 « IMPORTANT CHANGEMENT CODE IMMEUBLE ».
 *
 * LE DIAGNOSTIC, MESURÉ EN BASE : ces deux adresses n'existent sur ce bien que sous le rôle `transfere` — une
 * adresse lue DANS LE CORPS d'un mail transféré (« Fwd: »). Le compteur ne compte que `expediteur` (a écrit) et
 * `destinataire`+`copie` (en copie) : « 0 · 0 » était EXACT. C'est le FILTRE qui acceptait tous les rôles.
 *
 * NI LE COMPTEUR NI L'AGENCE N'Y ÉTAIENT POUR QUELQUE CHOSE : l'agence n'est qu'un filtre d'EXCLUSION (`sauf=`),
 * elle ne fait jamais entrer un mail. Les deux cas ci-dessous tiennent les deux moitiés de la règle d'Arno.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⑤-novodecies 🔴🔴 le compteur et le filtre, un seul calcul', () => {
  /** Le mail d'Arno : écrit par la propriétaire, reçu par nous, et qui CITE un contact dans son corps. */
  const M_FWD = ligne({
    messageId: 20, filId: 200, recuLe: '2025-11-20T20:22:00Z',
    objet: 'Fwd: 2039-28/32 AVENUE MARCEAU - IMPORTANT CHANGEMENT CODE IMMEUBLE',
    de: 'proprio@fictif.test', deNom: 'Gabrielle GARREAU',
  });

  /** Une capsule à 0 · 0 : elle n'existe sur ce bien que par le rôle `transfere` du mail ci-dessus. */
  const CITEE: Interlocuteur[] = [
    ...INTERLOCUTEURS,
    inter({ adresse: 'citee@fictif.test', nom: 'Jessica TADEU', nbMails: 1, aEcrit: 0, enCopie: 0 }),
    inter({ adresse: 'gestion@criterimmo.fr', nom: 'Gestion', nbMails: 1, aEcrit: 0, enCopie: 1, interne: true }),
  ];

  /**
   * 🔴🔴 LE SERVEUR EST REJOUÉ AVEC LA RÈGLE CORRIGÉE : un mail n'entre que si l'adresse cochée y est
   * expéditeur, destinataire ou en copie. Le rôle `transfere` de « citee@fictif.test » ne la fait PAS entrer.
   */
  const servir = (): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return reponse({ etat: 'ok', geste: null });
      const u = String(url);
      appels.push(u);
      if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
      if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
      if (u.includes('/historique/parties')) return reponse({ etat: 'ok', data: { parties: [], cartes: [] } });

      const p = new URL(u, 'http://local').searchParams;
      const avec = (p.get('avec') ?? '').split(',').filter((x) => x !== '');
      const sauf = (p.get('sauf') ?? '').split(',').filter((x) => x !== '');
      /* De / À / Cc du mail — et SURTOUT PAS son `transfere` : c'est tout l'objet de la correction. */
      const departAcc = ['proprio@fictif.test', 'gestion@criterimmo.fr'];
      const lignes = [M_FWD]
        .filter(() => avec.length === 0 || departAcc.some((a) => avec.includes(a)))
        .filter((l) => !sauf.includes(l.de));
      return reponse({
        etat: 'ok',
        data: {
          lignes, suite: false, entete: { nbMails: lignes.length },
          interlocuteurs: CITEE, interlocuteursTronques: false,
        },
      });
    }));
  };

  const nbMails = (): number => hote.querySelectorAll('.hdb-ancre').length;

  /**
   * 🔴🔴 LE CAS D'ARNO, MOT POUR MOT : une capsule à « 0 · 0 » cochée SEULE affiche 0 mail. Avant ce lot, elle
   * en ramenait deux — et aucun des deux ne la nommait nulle part dans son en-tête.
   */
  it('🔴🔴 UNE CAPSULE À « 0 ÉCRIT · 0 EN COPIE » COCHÉE SEULE AFFICHE 0 MAIL', async () => {
    servir();
    await monter();
    expect(nbMails()).toBe(1);

    /* On coche la capsule à 0 · 0 — elle est « non affectée » ici, comme TADEU sur lot-290. */
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    const citee = [...gris.querySelectorAll('.hdb-capsule')]
      .find((c) => (c.textContent ?? '').includes('Jessica TADEU'));
    expect(citee?.textContent).toContain('a écrit : 0 · en copie : 0');
    await cliquer(citee?.querySelector('input') ?? undefined);

    expect(hote.querySelector('.hdb-selection')?.textContent).toContain('1 partie cochée');
    /* 🔴 ZÉRO MAIL — et le compteur de la capsule ne mentait pas : il n'y en a aucun qui la nomme. */
    expect(nbMails()).toBe(0);
  });

  /**
   * 🔴🔴 ET L'AGENCE, COCHÉE PAR DÉFAUT, NE FAIT JAMAIS ENTRER UN MAIL À ELLE SEULE. Elle n'est pas dans `avec`
   * — elle ne vit que dans `sauf`, qui EXCLUT. Le vérifier sur l'adresse demandée est plus fort que de le
   * vérifier à l'écran : c'est la requête elle-même qui ne peut pas la porter.
   */
  it('🔴🔴 L’AGENCE N’ENTRE JAMAIS DANS `avec=` — elle ne sait qu’exclure', async () => {
    servir();
    await monter();
    const gris = hote.querySelector('.hdb-groupe--gris') as HTMLElement;
    await cliquer(gris.querySelector('.hdb-replier') ?? undefined);
    const citee = [...gris.querySelectorAll('.hdb-capsule')]
      .find((c) => (c.textContent ?? '').includes('Jessica TADEU'));
    await cliquer(citee?.querySelector('input') ?? undefined);

    const avecs = appels.filter((a) => a.includes('avec=')).map((a) => new URL(a, 'http://l').searchParams.get('avec'));
    expect(avecs.length).toBeGreaterThan(0);
    for (const a of avecs) expect(a, a ?? '').not.toContain('gestion@criterimmo.fr');
  });
});
