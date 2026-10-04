// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriqueDuBien } from './HistoriqueDuBien';
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
  de: 'proprio@fictif.test', deNom: 'M. ROI Nathan', destinataires: [], objet: 'Quittance de février',
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
       pas touché — sans quoi un ajustement d'une borne élargirait silencieusement la période de l'autre côté. */
    expect(texte()).toContain('du 15/01/2026 au 04/10/2026');
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

  it('🔴 « Tous les mails du bien pendant la période » est COCHÉ au départ, et ignore les parties', async () => {
    await monter();
    const cases = [...hote.querySelectorAll('.hdb-case input')] as HTMLInputElement[];
    expect(cases[0].checked).toBe(true);
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
    const groupe = hote.querySelector('.hdb-case--groupe input') as HTMLInputElement;
    expect(groupe.checked).toBe(false);
    expect(groupe.indeterminate).toBe(true);
  });

  /**
   * 🔴 LE REPLI : un groupe de plus de six personnes s'ouvre REPLIÉ, et son compte se lit SANS clic.
   * ⚠️ On monte ici un groupe « À répartir » de sept personnes — le cas réel du lot 155 (76 adresses).
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
    const replier = hote.querySelector('.hdb-replier') as HTMLButtonElement;
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
  it('🔴 les trois filtres de pièces sont offerts, et « Toutes » est le départ', async () => {
    await monter();
    expect(parMot('Toutes')?.getAttribute('aria-pressed')).toBe('true');
    await cliquer(parMot('Avec pièces jointes'));
    expect(appels.some((a) => a.includes('pieces=avec'))).toBe(true);
    await cliquer(parMot('Sans pièce jointe'));
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
    const grouper = [...hote.querySelectorAll('.hdb-case input')].at(-1) as HTMLInputElement;
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
  it('🔴🔴 le résumé du HAUT est replié avec son compte, celui du BAS est ouvert', async () => {
    await monter();
    const haut = hote.querySelector('.hdb-resume--haut') as HTMLElement;
    const bouton = haut.querySelector('button') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    // LE COMPTE SE LIT SANS CLIC.
    expect(bouton.textContent).toContain('2 pièces');
    expect(haut.querySelectorAll('.pdc-carte')).toHaveLength(0);

    const bas = hote.querySelector('.hdb-resume--bas') as HTMLElement;
    expect(bas.querySelectorAll('.pdc-carte')).toHaveLength(2);

    await cliquer(bouton);
    expect(haut.querySelectorAll('.pdc-carte')).toHaveLength(2);
  });

  /** 🔴 LES MINIATURES PORTENT LES TROIS GESTES D'ARNO : l'œil, le téléchargement, le picto Drive (vide ici). */
  it('🔴 chaque miniature porte « Visualiser » et « Télécharger »', async () => {
    await monter();
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
    await cliquer(parMot('Avec pièces jointes'));
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

describe('⑤-bis 🔴🔴 ranger une partie non affectée, et la période d’un locataire', () => {
  /** Le jeu d'essai : AXA est « Non affectée », le locataire a un bail, le propriétaire est rangé. */
  const PERIODES = new Map([
    ['locataire@fictif.test', { mot: 'du 01/05/2025 au 28/09/2026', du: '2025-05-01', au: '2026-09-28' }],
  ]);

  /**
   * 🔴🔴 LE « + » N'APPARAÎT QUE SUR « NON AFFECTÉS », et c'est la condition d'Arno mot pour mot : « Pour chaque
   * partie NON encore affectée à une catégorie ». Le proposer partout aurait invité à reclasser un propriétaire
   * — or un client n'est jamais un contact, et un rangement manuel PRIME sur tout le reste.
   */
  it('🔴🔴 le « + » n’est offert que sur les parties non affectées', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    const plus = [...hote.querySelectorAll('.hdb-plus')] as HTMLButtonElement[];
    expect(plus).toHaveLength(1);
    /* ⚠️ L'INTITULÉ DIT LE NOM LISIBLE, PAS L'ADRESSE (changé au lot HISTORIQUE-BIEN-3) : la capsule affiche
       « AXA », et un lecteur d'écran qui annoncerait « assureur@fictif.test » nommerait autre chose que ce
       qu'on voit. `libelleInterlocuteur` est la même fonction qui écrit le nom dans la capsule. */
    expect(plus[0].getAttribute('aria-label')).toContain('AXA');
  });

  /**
   * 🔴🔴 LA CARTE PRÉ-REMPLIT L'ADRESSE, ET LAISSE LA CATÉGORIE VIDE QUAND RIEN N'A ÉTÉ DÉDUIT. Pré-cocher
   * « Propriétaire » par défaut aurait fait ranger des gens dans une catégorie fausse d'un clic distrait.
   */
  it('🔴🔴 la carte pré-remplit l’adresse, laisse la catégorie vide, et refuse de valider', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    expect(carte).not.toBeNull();
    const adresse = carte.querySelector('input[type="email"]') as HTMLInputElement;
    expect(adresse.value).toBe('assureur@fictif.test');
    // ⚠️ NON MODIFIABLE : c'est l'adresse qu'on range, pas une saisie libre.
    expect(adresse.readOnly).toBe(true);
    expect((carte.querySelector('select') as HTMLSelectElement).value).toBe('');
    expect(texte()).toContain('elle n’a pas été déduite pour cette adresse');
    expect((parMot('Valider') as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * 🔴🔴 UN TIERS INDÉPENDANT NE REÇOIT AUCUNE CARTE, et l'écran le DIT AVANT de valider : la règle du lot
   * précédent est inchangée, et la surprise après le clic est évitée.
   */
  it('🔴🔴 l’écran dit ce que chaque catégorie fera, avant le clic', async () => {
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const select = hote.querySelector('.hdb-creation select') as HTMLSelectElement;

    await changer(select, 'independant');
    expect(texte()).toContain('rangé une fois pour TOUS les biens');
    expect(texte()).toContain('ne sert jamais à l’automatisation');

    await changer(select, 'locataire');
    expect(texte()).toContain('Rangée côté locataire de ce bien');
    expect((parMot('Valider') as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * 🔴🔴 VALIDER POSTE, PUIS **RELIT** — et c'est la relecture qui fait changer la partie de groupe. Poser la
   * catégorie dans l'état local aurait affiché un rangement que le serveur a peut-être refusé en partie.
   */
  it('🔴🔴 valider poste la catégorie et la carte, puis relit les rangements', async () => {
    const envois: { url: string; corps: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        envois.push({ url: String(url), corps: JSON.parse(String(init.body)) });
        return reponse({ etat: 'ok', carteRefusee: null });
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
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    const carte = hote.querySelector('.hdb-creation') as HTMLElement;
    await changer(carte.querySelectorAll('input')[1] as HTMLInputElement, 'Sophie AXA');
    await changer(carte.querySelectorAll('input')[2] as HTMLInputElement, '06 11 22 33 44');
    await changer(carte.querySelector('select') as HTMLSelectElement, 'locataire');
    const avant = appels.filter((a) => a.includes('/historique/parties')).length;
    await cliquer(parMot('Valider'));

    expect(envois).toHaveLength(1);
    expect(envois[0].corps).toEqual({
      cible: 'lot-155', adresse: 'assureur@fictif.test', categorie: 'locataire',
      nom: 'Sophie AXA', telephone: '06 11 22 33 44',
    });
    /* 🔴 LA RELECTURE A BIEN EU LIEU : une requête de plus sur la route des parties, après le POST. */
    expect(appels.filter((a) => a.includes('/historique/parties')).length).toBe(avant + 1);
    // …et la carte s'est fermée.
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
    await monter({ periodes: PERIODES });
    await deplierGroupe('Non affectés');
    await cliquer(hote.querySelector('.hdb-plus') ?? undefined);
    await changer(hote.querySelector('.hdb-creation select') as HTMLSelectElement, 'proprietaire');
    await cliquer(parMot('Valider'));
    expect(texte()).toContain('l’auteur doit être identifié');
    expect(hote.querySelector('.hdb-creation')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 « CHACUN AVEC SA PÉRIODE », ET LE CLIC LA RÈGLE ════════════════════════════════════════════════════
   *
   * C'est ici que le geste du lot précédent — choisir la période d'un locataire — est repris, à l'endroit où
   * Arno place désormais cette information. Le groupe ② le dit : rien ne se perd, le geste change d'endroit.
   */
  it('🔴🔴 la période d’un locataire est écrite sous son nom, et son clic règle les dates', async () => {
    await monter({ periodes: PERIODES });
    const bouton = parMot('du 01/05/2025 au 28/09/2026');
    expect(bouton).toBeDefined();
    await cliquer(bouton);
    const dates = [...hote.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    expect(dates.map((d) => d.value)).toEqual(['2025-05-01', '2026-09-28']);
    expect(texte()).toContain('du 01/05/2025 au 28/09/2026');
  });

  /** ⚠️ UNE PARTIE SANS BAIL N'AFFICHE AUCUNE PÉRIODE : l'assureur n'en a pas, et lui en inventer une mentirait. */
  it('🔴 une partie sans bail n’affiche aucune période', async () => {
    await monter({ periodes: PERIODES });
    expect(hote.querySelectorAll('.hdb-periode-partie')).toHaveLength(1);
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
    const groupe = hote.querySelector('.hdb-groupe') as HTMLElement;
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
      await cliquer((hote.querySelector('.hdb-groupe') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
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
      await cliquer((hote.querySelector('.hdb-groupe') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
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
      await cliquer((hote.querySelector('.hdb-groupe') as HTMLElement).querySelector('.hdb-replier') ?? undefined);
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
    // ① la recherche, dans l'objet ET le texte — le même intitulé que le bloc supprimé.
    expect(SRC).toContain('Chercher dans l’objet et le texte…');
    expect(SRC).toContain('setSaisie(e.target.value)');
    // ② les pièces jointes, avec leur complément.
    expect(SRC).toContain("['avec', 'Avec pièces jointes']");
    expect(SRC).toContain("['sans', 'Sans pièce jointe']");
    // ③ l'événement ouvert, et le cartouche qui y arrive déjà allumé.
    expect(SRC).toContain('Avec événement ouvert');
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
