// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
import { NIVEAUX_URGENCE } from '../../../../lib/gestion/evenementQualite';
/* 🔴 LOT CARTES-EVENEMENT-MEME-GESTE — le sélecteur a quitté la carte : on l'éprouve dans son propre composant. */
import { SelecteurUrgence } from './SelecteurUrgence';

/**
 * ══ 🔴🔴 LOT URGENCE-EVENEMENT — CE QUE LA CARTE FAIT : LE SÉLECTEUR, LE DOUBLE-CLIC, LES PARTIES ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026), points 3a, 4 et 5 — le point 4 TEL QU'ARNO L'A CORRIGÉ le même jour :
 *
 *   3a. « Dans la carte d'événement DÉPLIÉE (un clic) : un sélecteur à trois boutons Normal / Intermédiaire /
 *       Urgent, chacun dans sa couleur, le niveau actuel mis en évidence. Le choix est enregistré tout de suite, et
 *       la couleur de la capsule change sans recharger. »
 *
 *   4.  ⚠️ CE POINT A ÉTÉ REMPLACÉ LE MÊME JOUR par le lot CARTES-EVENEMENT-MEME-GESTE. Il demandait DEUX gestes
 *       différents (écran partagé → l'écran Événements centré ; plein écran → la fiche du bien) ; Arno tranche
 *       pour UN SEUL : « RÈGLE UNIQUE […] IDENTIQUE sur les deux écrans. […] DOUBLE-CLIC → ouvre directement la
 *       fiche du bien sur cet événement. » Et : « Le double-clic de l'écran partagé N'OUVRE PLUS l'écran
 *       Événements centré. » Les cas ci-dessous disent la règle NEUVE, et nomment celle qu'ils renversent.
 *       Règles communes, inchangées : simple clic et double-clic proprement distingués ; un double-clic sur un
 *       contrôle interne ne déclenche rien ; un événement sans bien (ou à plusieurs biens) n'ouvre pas de fiche.
 *
 *   5.  « Quand on déplie la carte, afficher les noms qui n'apparaissent pas dans la carte repliée : le ou les
 *       locataires actuels, et le ou les propriétaires s'ils manquent. […] Si une partie est déjà affichée dans la
 *       carte repliée, elle n'est pas répétée. Pas de numéro de lot interne. »
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Aucune base. Et aucun mail ni événement RÉEL n'est touché — ce fichier
 * monte le composant sur des cartes fabriquées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-08T12:00:00Z');

const CARTE = (o: Partial<CarteEvenement> = {}): CarteEvenement => ({
  evenementId: 7, reference: 'GES-2026-000007', objet: 'Fuite salle de bain',
  demandeur: null, adresseLibre: null, etat: 'en_cours',
  ouvertLe: '2026-10-01T08:00:00Z', dernierEchangeLe: '2026-10-06T08:00:00Z',
  nbFils: 1, nbMailsDeplaces: 0, attend: false,
  derniereEtape: null, derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: 'travaux', urgence: null,
  bien: { cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE',
    proprietaire: null, locataire: null },
  nbBiens: 1,
  ...o,
});

let container: HTMLDivElement;
let root: Root;
/** Les corps de requête que la carte a ENVOYÉS, dans l'ordre. C'est la preuve du « enregistré tout de suite ». */
let ecritures: { url: string; methode: string; corps: unknown }[];
/** Ce que la route du détail rend quand la carte est dépliée. Piloté par le test. */
let detailServi: Record<string, unknown>;

const DETAIL_BASE = {
  evenementId: 7, reference: 'GES-2026-000007', objet: 'Fuite salle de bain',
  demandeurNom: null, demandeurEmail: null, adresseLibre: null, etat: 'en_cours',
  categorie: 'travaux', urgence: null,
  ouvertLe: '2026-10-01T08:00:00Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
  fils: [], mailsDeplaces: [],
  biens: [{ cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE' }],
  parties: [] as { sorte: string; nom: string }[],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = [];
  detailServi = { ...DETAIL_BASE };
  /* ⚠️ `scrollIntoView` N'EXISTE PAS DANS JSDOM : on le double, et l'on s'en sert comme d'une preuve au point 4. */
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method !== undefined && init.method !== 'GET') {
      ecritures.push({
        url: u, methode: init.method,
        corps: init.body === undefined ? null : JSON.parse(String(init.body)),
      });
    }
    if (/\/evenements\/\d+$/.test(u) && (init?.method ?? 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => detailServi } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await Promise.resolve(); }); };

type Options = {
  partage?: boolean;
  vise?: boolean;
  onOuvrirBien?: (cleBien: string, evenementId: number) => void;
  onPleinEcranSurEvenement?: (evenementId: number) => void;
};

const monter = async (carte: CarteEvenement, o: Options = {}) => {
  await act(async () => {
    root.render(createElement(CarteVive, {
      carte, maintenant: MAINTENANT, onGeste: () => {}, ...o,
    }));
  });
  await calmer();
};

/** Le bouton de titre du repli — celui qui déplie la carte. */
const titre = (): HTMLElement => container.querySelector('.svv-repli-titre') as HTMLElement;
const deplier = async () => { await act(async () => { titre().click(); }); await calmer(); };
const capsule = (): HTMLElement | null => container.querySelector('.gst-type-capsule');
const boutonsUrgence = (): HTMLButtonElement[] => [...container.querySelectorAll('.gurg-voie')] as HTMLButtonElement[];

/**
 * ⚠️ UN CLIC AVEC SON COMPTEUR, parce que c'est LUI que le composant lit. `HTMLElement.click()` envoie toujours un
 * événement dont `detail` vaut 0 : il ne pourrait jamais représenter un second clic. On fabrique donc l'événement.
 */
const cliquer = async (cible: Element, fois: number) => {
  await act(async () => {
    cible.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: fois }));
  });
  await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LE SÉLECTEUR D'URGENCE — IL A QUITTÉ LA CARTE (lot CARTES-EVENEMENT-MEME-GESTE) ══════════════════════

   CE QUE CE BLOC EXIGEAIT : « Dans la carte d'événement DÉPLIÉE : un sélecteur à trois boutons » (lot
   URGENCE-EVENEMENT, point 3a). ARNO REVIENT DESSUS le 08/10/2026 : « le sélecteur d'urgence Normal /
   Intermédiaire / Urgent (il reste dans la fiche du bien) » fait partie des RETRAITS de la carte dépliée.

   🔴 LA COUVERTURE N'EST PAS PERDUE, ELLE CHANGE DE PORTE. Le composant est le MÊME des deux côtés
   (`SelecteurUrgence`, importé et jamais recopié) : on l'éprouve donc DIRECTEMENT, ce qui vaut pour la fiche du
   bien comme pour tout appelant futur. Le câblage de la fiche, lui, est éprouvé par `urgenceEcrans.test.ts`.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① le sélecteur à trois boutons — hors de la carte, dans son composant partagé', () => {
  let choisis: string[];
  const monterSelecteur = async (urgence: string | null, occupe = false) => {
    choisis = [];
    await act(async () => {
      root.render(createElement(SelecteurUrgence, {
        urgence, occupe, onUrgence: (u: string) => choisis.push(u),
      }));
    });
    await calmer();
  };

  it('🔴🔴 trois boutons, Normal / Intermédiaire / Urgent, chacun dans sa couleur', async () => {
    await monterSelecteur(null);
    const b = boutonsUrgence();
    expect(b.map((x) => x.textContent)).toEqual(['Normal', 'Intermédiaire', 'Urgent']);
    expect(b.map((x) => x.className)).toEqual([
      expect.stringContaining('gurg-voie--vert'),
      expect.stringContaining('gurg-voie--orange'),
      expect.stringContaining('gurg-voie--rouge'),
    ]);
  });

  /** 🔴 LE NIVEAU ACTUEL EST MIS EN ÉVIDENCE, et il le dit aussi au lecteur d'écran (`aria-pressed`). */
  it('🔴 le niveau actuel est mis en évidence, et dit autrement que par la couleur', async () => {
    await monterSelecteur('haute');
    const actifs = boutonsUrgence().filter((b) => b.className.includes('gurg-voie--active'));
    expect(actifs).toHaveLength(1);
    expect(actifs[0].textContent).toBe('Intermédiaire');
    expect(actifs[0].getAttribute('aria-pressed')).toBe('true');
  });

  /**
   * 🔴🔴 AUCUN NIVEAU : AUCUN BOUTON EN ÉVIDENCE, et l'absence est ÉCRITE. Sans ce mot, trois boutons éteints se
   * lisent comme un chargement en cours.
   */
  it('🔴🔴 aucun niveau : rien en évidence, et l’absence est écrite', async () => {
    await monterSelecteur(null);
    expect(boutonsUrgence().filter((b) => b.className.includes('gurg-voie--active'))).toHaveLength(0);
    expect(container.querySelector('.gurg-absent')?.textContent).toBe('Aucun niveau enregistré');
  });

  /** 🔴 IL REMONTE LA CLÉ, ET N'ÉCRIT RIEN LUI-MÊME : c'est l'appelant qui écrit, par sa porte habituelle. */
  it.each(NIVEAUX_URGENCE.map((n) => [n.mot, n.cle] as const))(
    '🔴🔴 « %s » remonte « %s », sans toucher au réseau', async (mot, cle) => {
      await monterSelecteur(null);
      const b = boutonsUrgence().find((x) => x.textContent === mot) as HTMLButtonElement;
      await act(async () => { b.click(); });
      await calmer();
      expect(choisis).toEqual([cle]);
      expect(ecritures).toEqual([]);
    });

  /** ⚠️ PENDANT UNE ÉCRITURE, LES TROIS SONT ÉTEINTS — comme partout ailleurs dans le module. */
  it('⚠️ `occupe` désactive les trois boutons', async () => {
    await monterSelecteur('normale', true);
    expect(boutonsUrgence().every((b) => b.disabled)).toBe(true);
  });

  /** 🔴🔴 ET IL N'EST PLUS DANS LA CARTE, sur AUCUN des deux écrans. */
  it.each([true, false])('🔴🔴 la carte dépliée n’en porte plus (partage=%s)', async (partage) => {
    await monter(CARTE(), { partage, onOuvrirBien: () => {} });
    await deplier();
    expect(boutonsUrgence()).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LE DOUBLE-CLIC — UN SEUL GESTE, LE MÊME SUR LES DEUX ÉCRANS ═════════════════════════════════════════

   CE QUE CES DEUX BLOCS EXIGEAIENT, et qui est RENVERSÉ : « A. ÉCRAN PARTAGÉ → ouvre l'écran Événements centré ;
   B. PLEIN ÉCRAN → ouvre la fiche du bien » (lot URGENCE-EVENEMENT, point 4 corrigé). ARNO, le 08/10/2026 :
   « RÈGLE UNIQUE pour les cartes d'événement, IDENTIQUE sur l'écran partagé et sur l'écran Événements en plein
   écran. Un seul code partagé, pas deux comportements. […] DOUBLE-CLIC → ouvre directement la fiche du bien sur
   cet événement (même lien, même code que le bouton rouge). »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le double-clic ouvre la fiche du bien — sur les DEUX écrans', () => {
  it.each([true, false])('🔴🔴 double-clic → la fiche du bien (partage=%s)', async (partage) => {
    const fiches: { cle: string; id: number }[] = [];
    await monter(CARTE(), { partage, onOuvrirBien: (cle, id) => fiches.push({ cle, id }) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([{ cle: '315', id: 7 }]);
  });

  /**
   * 🔴🔴 ET L'ÉCRAN PARTAGÉ NE PART PLUS VERS LE PLEIN ÉCRAN. Arno : « On passe à l'écran Événements UNIQUEMENT
   * par le bouton “Plein écran” de la colonne Événements. » Le composant n'a même plus de quoi le demander : la
   * prop `onPleinEcranSurEvenement` a été retirée, et cette épreuve le tient par le texte — sans quoi on pourrait
   * la remettre sans que rien ne rougisse.
   */
  it('🔴🔴 plus aucun chemin du composant ne mène à ?ecran=evenements', () => {
    const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    expect(SRC).not.toContain('onPleinEcranSurEvenement');
    const VUE = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    /* ⚠️ ON INTERDIT LA FONCTION ET SON BRANCHEMENT, PAS LA MENTION : le commentaire qui explique ce retrait
       nomme `ouvrirPleinEcranSurEvenement`, et il doit pouvoir le faire. */
    expect(VUE).not.toContain('const ouvrirPleinEcranSurEvenement');
    expect(VUE).not.toContain('onPleinEcranSurEvenement=');
    /* 🔴 ET LE BOUTON « Plein écran » RESTE, lui : c'est désormais le SEUL geste qui y mène. */
    expect(VUE).toContain("onClick={() => aller({ ecran: 'evenements', etiquette, filOuvert: null })}");
  });

  /** 🔴🔴 « UN ÉVÉNEMENT SANS BIEN RATTACHÉ N'OUVRE PAS DE FICHE » (Arno), et rien d'autre ne change. */
  it.each([true, false])('🔴🔴 aucun bien : aucune ouverture (partage=%s)', async (partage) => {
    const fiches: string[] = [];
    await monter(CARTE({ bien: null, nbBiens: 0 }), { partage, onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([]);
  });

  /**
   * ⚠️ PLUSIEURS BIENS : AUCUNE OUVERTURE NON PLUS — « Événement à plusieurs biens ou sans bien : pas
   * d'ouverture (comme tu l'as fait) », Arno. Le bouton rouge ouvre alors un CHOIX du bien, et un double-clic
   * n'a pas d'endroit où le poser.
   */
  it('⚠️ plusieurs biens : aucune ouverture — le choix du bien vit dans le bouton rouge', async () => {
    const fiches: string[] = [];
    await monter(CARTE({ nbBiens: 3 }), { onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([]);
  });

  /** ⚠️ UNE CLÉ NON NUMÉRIQUE N'EST PAS ADRESSABLE : la MÊME règle que le bouton rouge (`estCleAdressable`). */
  it('⚠️ une clé non numérique n’ouvre rien', async () => {
    const fiches: string[] = [];
    await monter(
      CARTE({ bien: { cle: 'X-9', adresse: 'a', commune: 'b', proprietaire: null, locataire: null } }),
      { onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([]);
  });
});

describe('🔴🔴 ② règles communes aux deux écrans', () => {
  /** 🔴 LE SIMPLE CLIC CONTINUE DE DÉPLIER, ET N'OUVRE RIEN. */
  it.each([true, false])('🔴 simple clic : il déplie, et n’ouvre aucune fiche (partage=%s)', async (partage) => {
    const fiches: string[] = [];
    await monter(CARTE(), { partage, onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(titre(), 1);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(fiches).toEqual([]);
  });

  /** 🔴 ET UN SECOND SIMPLE CLIC REPLIE LA CARTE (Arno, point 1). */
  it('🔴 un second simple clic replie la carte', async () => {
    await monter(CARTE(), { onOuvrirBien: () => {} });
    await cliquer(titre(), 1);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    await cliquer(titre(), 1);
    expect(container.querySelector('button[aria-expanded="true"]')).toBeNull();
  });

  /**
   * 🔴🔴 « UN DOUBLE-CLIC NE DOIT PAS D'ABORD DÉPLIER PUIS REPLIER LA CARTE » (Arno, règle commune inchangée).
   * C'est le défaut d'un double-clic naïf : deux clics, deux bascules, la carte revient où elle était et l'on
   * croit que rien n'a marché. Le second clic est intercepté en phase de capture.
   */
  it('🔴🔴 double-clic : la carte ne revient PAS à son état de départ', async () => {
    await monter(CARTE(), { onOuvrirBien: () => {} });
    expect(container.querySelector('button[aria-expanded="true"]')).toBeNull();
    await cliquer(titre(), 1);
    await cliquer(titre(), 2);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
  });

  /**
   * 🔴🔴 « UN DOUBLE-CLIC SUR UN BOUTON OU UN CONTRÔLE À L'INTÉRIEUR DE LA CARTE NE DÉCLENCHE RIEN » (Arno). Le
   * contrôle nommé au lot précédent (le sélecteur d'urgence) a quitté la carte ; on éprouve donc celui qui reste,
   * et qui est le plus exposé : le gros bouton rouge lui-même.
   */
  it('🔴🔴 double-clic sur le bouton rouge : il n’ouvre pas DEUX fois', async () => {
    const fiches: string[] = [];
    await monter(CARTE(), { onOuvrirBien: (cle) => fiches.push(cle) });
    await deplier();
    const gros = container.querySelector('.gst-ouvrir-fiche') as HTMLElement;
    expect(gros).not.toBeNull();
    await cliquer(gros, 2);
    /* 🔴 LE BOUTON FAIT SON PROPRE GESTE ; le double-clic de la carte, lui, ne s'ajoute pas. */
    expect(fiches).toEqual(['315']);
  });

  /**
   * 🔴 LA CAPSULE « Type à définir » GARDE SON CLIC, et il DÉPLIE la carte — jamais elle n'ouvre la fiche.
   * Son geste a changé de destination avec ce lot : le formulaire qu'elle ouvrait est parti dans la fiche du bien.
   */
  it('🔴 double-clic sur « Type à définir » : il déplie, et n’ouvre pas la fiche', async () => {
    const fiches: string[] = [];
    detailServi = { ...DETAIL_BASE, categorie: null };
    await monter(CARTE({ categorie: null }), { onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(capsule() as Element, 2);
    expect(fiches).toEqual([]);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'ÉVÉNEMENT VISÉ RESTE UNE FONCTION D'ADRESSE, ET PLUS UN GESTE (lot CARTES-EVENEMENT-MEME-GESTE).
   Arno : « Le lien &evenement=<id> (carte centrée, liserée, dépliée) peut rester comme fonction d'adresse, mais
   plus aucun geste ne doit l'appeler par défaut. » Ce que ces cas éprouvent ne change donc pas d'un cran ; ce qui
   a disparu, c'est le double-clic qui écrivait cette adresse — éprouvé par son absence au bloc ② ci-dessus.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ l’événement VISÉ : liseré, déplié, centré', () => {
  it('🔴🔴 il porte le liseré de sélection, et le dit au lecteur d’écran', async () => {
    await monter(CARTE(), { vise: true });
    const li = container.querySelector('li.gst-item');
    expect(li?.className).toContain('gst-item--vise');
    expect(li?.getAttribute('aria-current')).toBe('true');
  });

  it('🔴🔴 il est DÉPLIÉ d’emblée', async () => {
    await monter(CARTE(), { vise: true, onOuvrirBien: () => {} });
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    /* ⚠️ CE CAS LISAIT LES TROIS BOUTONS D'URGENCE ; ils ont quitté la carte. Ce qu'une carte dépliée montre
       désormais, c'est le bouton rouge — voir le lot CARTES-EVENEMENT-MEME-GESTE. */
    expect(container.querySelector('.gst-ouvrir-fiche')).not.toBeNull();
  });

  it('🔴🔴 et la liste défile pour le CENTRER', async () => {
    await monter(CARTE(), { vise: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  /**
   * ⚠️ UNE SEULE FOIS : sans ce verrou, chaque relecture de la liste — un geste, le battement de 30 s — ramènerait
   * la page sur l'événement, et l'on perdrait l'endroit qu'on regardait.
   */
  it('⚠️ il ne se recentre pas à chaque rendu', async () => {
    await monter(CARTE(), { vise: true });
    await monter(CARTE({ objet: 'Fuite salle de bain (corrigé)' }), { vise: true });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  /** ⚠️ NON VISÉ ⇒ RIEN DU TOUT : ni liseré, ni dépliage, ni défilement. C'est la carte d'avant ce lot. */
  it('⚠️ une carte non visée est exactement celle d’avant ce lot', async () => {
    await monter(CARTE());
    expect(container.querySelector('li.gst-item')?.className).not.toContain('gst-item--vise');
    expect(container.querySelector('li.gst-item')?.getAttribute('aria-current')).toBeNull();
    expect(container.querySelector('button[aria-expanded="true"]')).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   POINT 5 — LES PARTIES QUE LA CARTE REPLIÉE NE DIT PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ les parties manquantes, à l’ouverture de la carte', () => {
  const parties = (): string => container.querySelector('.gst-parties')?.textContent ?? '';

  /** 🔴 LE FORMAT DE LA CARTE REPLIÉE NE CHANGE PAS (Arno) : rien avant le dépliage. */
  it('🔴 repliée, la carte ne montre aucune partie de plus', async () => {
    detailServi = {
      ...DETAIL_BASE,
      parties: [{ sorte: 'locataire', nom: 'DUPONT Marie' }],
    };
    await monter(CARTE());
    expect(container.querySelector('.gst-parties')).toBeNull();
  });

  it('🔴🔴 dépliée, elle écrit les locataires actuels et les propriétaires', async () => {
    detailServi = {
      ...DETAIL_BASE,
      parties: [
        { sorte: 'proprietaire', nom: 'VALET / RAEPSAET Damien et Michelle' },
        { sorte: 'locataire', nom: 'DUPONT Marie' },
        { sorte: 'locataire', nom: 'MARTIN Léo' },
      ],
    };
    await monter(CARTE());
    await deplier();
    expect(parties()).toContain('Propriétaire');
    expect(parties()).toContain('VALET / RAEPSAET Damien et Michelle');
    expect(parties()).toContain('Locataire en place');
    /* 🔴 LE OU LES LOCATAIRES : une colocation s'écrit en entier, séparée par un point médian. */
    expect(parties()).toContain('DUPONT Marie · MARTIN Léo');
  });

  /**
   * 🔴🔴 « SI UNE PARTIE EST DÉJÀ AFFICHÉE DANS LA CARTE REPLIÉE, ELLE N'EST PAS RÉPÉTÉE » (Arno).
   *
   * 🔴 ET LA COMPARAISON EST INSENSIBLE À LA FORME DU NOM, parce que les deux listes ne viennent pas de la même
   * colonne : la carte repliée écrit `proprietaire_texte`, la fiche écrit `nom_complet`. « VALET / RAEPSAET Damien
   * et Michelle » et « Valet-Raepsaet Damien et Michelle » sont la MÊME personne et deux chaînes différentes. Un
   * `===` aurait répété tout le monde — c'est-à-dire exactement ce qu'Arno interdit.
   */
  it('🔴🔴 un nom déjà dit dans la carte repliée n’est pas répété, même écrit autrement', async () => {
    detailServi = {
      ...DETAIL_BASE,
      parties: [
        { sorte: 'proprietaire', nom: 'VALET / RAEPSAET Damien et Michelle' },
        { sorte: 'locataire', nom: 'DUPONT Marie' },
      ],
    };
    await monter(CARTE({
      bien: {
        cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE',
        proprietaire: 'Valet-Raepsaet Damien et Michelle', locataire: null,
      },
    }));
    await deplier();
    expect(parties()).not.toContain('VALET / RAEPSAET');
    expect(parties()).toContain('DUPONT Marie');
  });

  /** ⚠️ ET UNE MÊME PERSONNE SUR DEUX LOTS DU MÊME ÉVÉNEMENT NE S'ÉCRIT QU'UNE FOIS. */
  it('⚠️ un propriétaire de deux lots n’est écrit qu’une fois', async () => {
    detailServi = {
      ...DETAIL_BASE,
      parties: [
        { sorte: 'proprietaire', nom: 'SCI DES LILAS' },
        { sorte: 'proprietaire', nom: 'SCI des Lilas' },
      ],
    };
    await monter(CARTE());
    await deplier();
    expect((parties().match(/Lilas/gi) ?? [])).toHaveLength(1);
  });

  /**
   * 🔴 RIEN À AJOUTER ⇒ RIEN DU TOUT. Un bloc « (aucune autre partie) » sur chaque carte serait deux lignes de
   * vide par dossier : c'est l'absence de la ligne qui dit l'absence, règle de `LignesDuDossier`.
   */
  it('🔴 aucune partie à ajouter : aucune ligne', async () => {
    detailServi = { ...DETAIL_BASE, parties: [] };
    await monter(CARTE());
    await deplier();
    expect(container.querySelector('.gst-parties')).toBeNull();
  });

  /**
   * ⚠️ CHAMP ABSENT (et non vide) ⇒ RIEN : c'est une réponse ANTÉRIEURE à ce lot, servie à une page restée ouverte
   * pendant un déploiement. L'écran doit alors être celui d'avant, jamais une ligne inventée. Même prudence que
   * `biens` et `derniereEtape`, et le même défaut mesuré que la miniature d'étape (14 épreuves tombées sur
   * `undefined` au lot VIGNETTE-EVENEMENT).
   */
  it('⚠️ une réponse sans le champ `parties` ne fait pas tomber la carte', async () => {
    const sansParties = { ...DETAIL_BASE } as Record<string, unknown>;
    delete sansParties.parties;
    detailServi = sansParties;
    await monter(CARTE(), { onOuvrirBien: () => {} });
    await deplier();
    expect(container.querySelector('.gst-parties')).toBeNull();
    /* 🔴 ET LE RESTE DE LA CARTE EST BIEN LÀ : la preuve qu'elle n'a pas jeté. */
    expect(container.querySelector('.gst-ouvrir-fiche')).not.toBeNull();
  });

  /** 🔴 PAS DE NUMÉRO DE LOT INTERNE (Arno) : on n'écrit que des noms et leur rôle. */
  it('🔴 aucun numéro de lot dans le bloc des parties', async () => {
    detailServi = { ...DETAIL_BASE, parties: [{ sorte: 'locataire', nom: 'DUPONT Marie' }] };
    await monter(CARTE());
    await deplier();
    expect(parties()).not.toContain('315');
    expect(parties()).not.toMatch(/lot/i);
  });

  /** 🔴 DANS LES DEUX ÉCRANS, comme le sélecteur : la demande parle de « la carte dépliée », sans distinguer. */
  it('🔴 elles paraissent aussi dans l’écran partagé', async () => {
    detailServi = { ...DETAIL_BASE, parties: [{ sorte: 'locataire', nom: 'DUPONT Marie' }] };
    await monter(CARTE(), { partage: true, onOuvrirBien: () => {} });
    await deplier();
    expect(parties()).toContain('DUPONT Marie');
  });
});
