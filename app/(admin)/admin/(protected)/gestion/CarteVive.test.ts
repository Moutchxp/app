// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CarteVive } from './CarteVive';
import type { CarteDetail } from '../../../../lib/gestion/carteRepo';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';

/**
 * ══ 🔴🔴 FICHIER RÉÉCRIT LE 08/10/2026 — LOT CARTES-EVENEMENT-MEME-GESTE ════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'IL ÉPROUVAIT, ET QUI N'EXISTE PLUS DANS CETTE CARTE. Il tenait, depuis le lot 4c-B, trois promesses de la
 * carte DÉPLIÉE : les pièces servies par l'application, les gestes par échange et par mail (menu « ⋯ », déplacer,
 * détacher, remettre), et le badge Monga avec sa clôture proposée. Six suites, 41 cas.
 *
 * DÉCISION D'ARNO (08/10/2026) : « SIMPLE CLIC → la carte se déplie et montre UNIQUEMENT : les informations
 * absentes de la carte repliée […] ; le bouton rouge “Ouvrir la fiche du bien sur cet événement →”. […] tout ce
 * qui s'y affichait en plus disparaît. » La carte n'est plus un dossier, c'est un TREMPLIN vers la fiche du bien.
 *
 * ═══ 🔴 OÙ EST PASSÉE LA COUVERTURE, PIÈCE PAR PIÈCE (vérifié, pas supposé) ══════════════════════════════════════
 *   · les pièces servies par l'application   → `PiecesDeLaConversation.test.ts` ;
 *   · le menu « ⋯ » d'un échange et d'un mail, « Détacher l'échange », « Déplacer ce mail », « Détacher ce mail »
 *                                            → `Conversation.statut.test.ts` (cas « le menu garde toutes ses
 *                                              entrées ») — ces gestes vivent dans `Conversation.tsx`, qui les
 *                                              rend toujours ;
 *   · la frise, sa clôture proposée, le formulaire « Modifier » et le choix du type
 *                                            → `FriseAvancement.test.ts`, côté fiche du bien ;
 *   · le sélecteur d'urgence                 → `urgenceEvenement.test.ts` et `CarteVive.urgence.test.ts`.
 *
 * ⚠️ UNE COUVERTURE EST RÉELLEMENT PERDUE, ET JE LE DIS PLUTÔT QUE DE LA TAIRE : « Déplacer l'échange… » (déplacer
 * un ÉCHANGE ENTIER vers une autre carte) était rendu par `FilRattache`, qui disparaît avec la carte dépliée. La
 * CAPACITÉ, elle, demeure — `PanneauAffecter` (« Rattacher à : événement existant »), rendu par `Conversation.tsx`.
 *
 * ═══ CE QUE CE FICHIER ÉPROUVE DÉSORMAIS ════════════════════════════════════════════════════════════════════════
 *   ① PARESSE — une carte repliée ne lance AUCUNE requête ; c'est la promesse du lot 4c, et elle ne bouge pas ;
 *   ② LE CONTENU DE LA CARTE DÉPLIÉE — les infos manquantes, le bouton rouge, et RIEN d'autre ;
 *   ③ L'UNIQUE EXCEPTION — les trois boutons d'état, gardés en plein écran parce qu'ils n'existent nulle part
 *      ailleurs (consigne d'Arno : « ne le retire pas ») ;
 *   ④ LE CODE MORT est parti avec sa fonction.
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Aucune base. Aucun mail ni événement RÉEL n'est touché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-09-23T12:00:00Z');

const CARTE: CarteEvenement = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeur: 'Mme M.',
  adresseLibre: '28 avenue Marceau', etat: 'a_traiter', ouvertLe: '2026-09-20T12:00:00Z',
  dernierEchangeLe: '2026-09-22T12:00:00Z', nbFils: 1, nbMailsDeplaces: 0, attend: true,
  derniereEtape: null, derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: null, urgence: null,
  /* 🔴 LOT FILTRES-EVENEMENTS-NEW — aucun mail reçu non lu : la carte n'est pas « New ». */
  nbRecusNonLus: 0, nouveauteLe: null,
  bien: { cle: '315', adresse: '28 avenue Marceau', commune: 'PARIS', proprietaire: null, locataire: null },
  nbBiens: 1,
};

const DETAIL: CarteDetail & { biens: unknown; parties: unknown } = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeurNom: 'Mme M.',
  demandeurEmail: 'm@exemple.test', adresseLibre: '28 avenue Marceau', etat: 'a_traiter',
  categorie: null, urgence: null,
  ouvertLe: '2026-09-20T12:00:00Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
  fils: [], mailsDeplaces: [],
  biens: [{ cle: '315', adresse: '28 avenue Marceau', commune: 'PARIS' }],
  parties: [{ sorte: 'locataire', nom: 'DUPONT Marie' }],
};

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let rapports: { message: string; rechargerTout?: boolean }[];
let detailServi: Record<string, unknown>;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; rapports = [];
  detailServi = { ...DETAIL };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${(init?.method ?? 'GET').toUpperCase()} ${u}`);
    if (/\/evenements\/\d+$/.test(u) && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => detailServi } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await Promise.resolve(); }); };

const monter = async (o: { partage?: boolean } = {}) => {
  await act(async () => {
    root.render(createElement(CarteVive, {
      carte: CARTE, maintenant: MAINTENANT, onOuvrirBien: () => {}, ...o,
      onGeste: (message: string, options?: { rechargerTout?: boolean }) => rapports.push({ message, ...options }),
    }));
  });
  await calmer();
};

/** Remonte à neuf, pour comparer deux rendus dans un même cas. */
const remonter = (): void => {
  act(() => { root.unmount(); });
  container.innerHTML = '';
  root = createRoot(container);
  appels = [];
};

const titre = (): HTMLElement => container.querySelector('.svv-repli-titre') as HTMLElement;
const deplier = async () => { await act(async () => { titre().click(); }); await calmer(); };
const corps = (): string => container.querySelector('.gst-corps')?.textContent ?? '';

describe('① PARESSE — ce qu’on n’ouvre pas ne coûte rien', () => {
  it('une carte repliée n’émet AUCUNE requête', async () => {
    await monter();
    expect(appels).toEqual([]);
    expect(container.querySelector('.gst-corps')).toBeNull();
  });

  /**
   * ⚠️ CE CAS DISAIT « charge son dossier ET sa frise ». La frise a quitté la carte : il ne reste que le dossier,
   * et le marquage « vu » qui l'accompagne depuis le lot VIGNETTE-EVENEMENT.
   */
  it('le dépliage charge le dossier UNE fois, et plus aucune frise', async () => {
    await monter();
    await deplier();
    expect(appels.filter((a) => a === 'GET /api/admin/gestion/evenements/9')).toHaveLength(1);
    expect(appels.filter((a) => a.includes('/frise'))).toHaveLength(0);
    expect(appels.filter((a) => a.includes('/messages'))).toHaveLength(0);
  });

  it('replier puis rouvrir ne relance RIEN (le contenu reste monté)', async () => {
    await monter();
    await deplier();
    const n = appels.length;
    await deplier();
    await deplier();
    expect(appels).toHaveLength(n);
  });
});

describe('🔴🔴 ② la carte dépliée : les infos manquantes, le bouton rouge, et RIEN d’autre', () => {
  it.each([true, false])('🔴 le bouton rouge est là (partage=%s)', async (partage) => {
    await monter({ partage });
    await deplier();
    expect(container.querySelector('.gst-ouvrir-fiche')?.textContent)
      .toContain('Ouvrir la fiche du bien sur cet événement');
  });

  it('🔴 les noms absents de la vignette y sont écrits', async () => {
    await monter();
    await deplier();
    expect(container.querySelector('.gst-parties')?.textContent).toContain('DUPONT Marie');
  });

  /**
   * 🔴🔴 LA LISTE DES RETRAITS, ÉPROUVÉE PAR L'ABSENCE. Chacun de ces blocs était rendu par la carte dépliée avant
   * ce lot ; chacun a été retrouvé ailleurs avant d'être retiré (voir l'encadré de `CorpsCarte`).
   */
  it.each([
    ['le sélecteur d’urgence', '.gurg'],
    ['la frise d’avancement', '.fav-frise'],
    ['le badge Monga', '.gst-monga'],
    ['le résumé et le formulaire', '.gst-fiche'],
    ['le menu discret d’un échange', '.gst-coin'],
  ])('🔴🔴 %s a quitté la carte', async (_mot, selecteur) => {
    await monter();
    await deplier();
    expect(container.querySelector(selecteur)).toBeNull();
  });

  it.each([
    'Avancement',
    'Échanges rattachés',
    'Mails déplacés ici',
    'Tout l’historique des échanges',
    'Modifier',
  ])('🔴🔴 « %s » a quitté la carte', async (mot) => {
    await monter();
    await deplier();
    expect(corps()).not.toContain(mot);
  });

  /**
   * 🔴🔴 ET LE MÊME CODE REND LES DEUX ÉCRANS : c'est le cœur du lot (« Un seul code partagé, pas deux
   * comportements »). On compare ce que la carte dépliée écrit de part et d'autre, aux boutons d'état près —
   * l'unique exception, éprouvée juste en dessous.
   */
  it('🔴🔴 écran partagé et plein écran montrent la même chose, aux boutons d’état près', async () => {
    await monter({ partage: true });
    await deplier();
    const enPartage = corps();
    remonter();

    await monter({ partage: false });
    await deplier();
    const enPlein = corps();

    expect(enPartage).toContain('Ouvrir la fiche du bien sur cet événement');
    expect(enPartage).toContain('DUPONT Marie');
    /* 🔴 LE PLEIN ÉCRAN N'AJOUTE QUE LES TROIS BOUTONS D'ÉTAT. */
    expect(enPlein.replace(/À traiter|En cours|Traité/g, '').trim()).toBe(enPartage.trim());
  });
});

describe('🔴🔴 ③ l’unique exception : les trois boutons d’état, gardés en plein écran', () => {
  /**
   * ══ 🔴🔴 POURQUOI CE BLOC SURVIT, ET C'EST UNE CONSIGNE D'ARNO, PAS UN OUBLI ════════════════════════════════
   *
   * ARNO (08/10/2026) : « Si l'un n'existe nulle part ailleurs […], ne le retire pas : interromps-toi et dis-le
   * à Arno. » Les trois boutons « À traiter / En cours / Traité » sont dans ce cas, et les SEULS : la fiche du
   * bien les a perdus au lot EVENEMENT-MINIMALISTE, dont le commentaire dit « il reste une porte d'écriture :
   * celle de la vue de l'événement en plein écran ». Les retirer ferait perdre « En cours » et la RÉOUVERTURE
   * d'un événement traité — la frise ne sait que clore, et seulement quand elle le propose.
   *
   * ⚠️ CETTE ÉPREUVE TOMBERA LE JOUR OÙ ARNO TRANCHERA, et c'est exactement ce qu'on lui demande : elle est le
   * rappel qu'une décision est en attente.
   */
  it('🔴🔴 ils sont en plein écran, et PAS dans l’écran partagé', async () => {
    await monter({ partage: false });
    await deplier();
    expect([...container.querySelectorAll('.gst-voie')].map((b) => b.textContent))
      .toEqual(['À traiter', 'En cours', 'Traité']);

    remonter();
    await monter({ partage: true });
    await deplier();
    expect(container.querySelectorAll('.gst-voie')).toHaveLength(0);
  });

  it('changer l’état envoie un PATCH et rend compte', async () => {
    await monter({ partage: false });
    await deplier();
    const b = [...container.querySelectorAll('.gst-voie')].find((x) => x.textContent === 'En cours');
    await act(async () => { (b as HTMLElement).click(); });
    await calmer();
    expect(appels).toContain('PATCH /api/admin/gestion/evenements/9');
    expect(rapports.map((r) => r.message)).toContain('Événement GES-2026-000009 : en cours.');
  });

  it('l’état DÉJÀ posé n’est pas cliquable — on ne demande pas à la base ce qu’elle sait déjà', async () => {
    await monter({ partage: false });
    await deplier();
    const b = [...container.querySelectorAll('.gst-voie')].find((x) => x.textContent === 'À traiter');
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('une carte TRAITÉE affiche sa date de traitement, et reste rouvrable', async () => {
    detailServi = { ...DETAIL, etat: 'traite', traiteLe: '2026-09-23T09:00:00Z', traitePar: 'arno' };
    await monter({ partage: false });
    await deplier();
    expect(corps()).toContain('Traité le');
    expect(corps()).toContain('Rouvrable à tout moment');
  });
});

describe('🔴🔴 ④ le code mort est parti avec sa fonction', () => {
  const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');

  /**
   * 🔴 UN IMPORT ORPHELIN FINIT TOUJOURS PAR ÊTRE RECÂBLÉ « parce qu'il est encore là » — c'est la leçon des
   * règles de feuille orphelines du lot EVENEMENT-MINIMALISTE, et elle vaut pour les composants.
   */
  it.each([
    "from './Conversation'",
    "from './MenuDiscret'",
    "from './ChoisirEvenement'",
    "from './FriseAvancement'",
    "from './SelecteurUrgence'",
    "from '../../../../lib/gestion/statutClassement'",
    "from '../../../../lib/gestion/lisibilite'",
  ])('🔴 `CarteVive` n’importe plus %s', (mort) => {
    expect(SRC).not.toContain(mort);
  });

  /**
   * ⚠️ MAIS `FormulaireCarte` RESTE EXPORTÉ, et il le faut : la fiche du bien l'importe depuis ce fichier
   * (« le MÊME formulaire, jamais une copie », lot EVENEMENT-MINIMALISTE). Le retirer aurait emporté avec lui le
   * seul endroit où l'on choisit le TYPE d'un événement.
   */
  it('⚠️ `FormulaireCarte` reste exporté pour la fiche du bien', () => {
    expect(SRC).toContain('export function FormulaireCarte(');
    const BIEN = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
    expect(BIEN).toContain("import { FormulaireCarte } from './CarteVive';");
  });
});
