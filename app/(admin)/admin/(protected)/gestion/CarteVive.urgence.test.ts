// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
import { NIVEAUX_URGENCE } from '../../../../lib/gestion/evenementQualite';

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
 *   4.  « Le double-clic ne fait PAS la même chose selon l'écran :
 *         A. ÉCRAN PARTAGÉ → ouvre l'écran Événements en plein écran, la liste défilée et CENTRÉE sur l'événement
 *            double-cliqué, cet événement mis en évidence (liseré de sélection) et déplié ;
 *         B. ÉCRAN ÉVÉNEMENTS EN PLEIN ÉCRAN → ouvre la fiche du bien sur cet événement, exactement comme le
 *            bouton rouge (même lien, même code).
 *       Règles communes : simple clic et double-clic proprement distingués (un double-clic ne doit pas d'abord
 *       déplier puis replier la carte) ; un double-clic sur un bouton ou un contrôle interne ne déclenche rien ;
 *       un événement sans bien rattaché n'ouvre pas de fiche (cas B). »
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
   POINT 3a — LE SÉLECTEUR, DANS LA CARTE DÉPLIÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① le sélecteur à trois boutons, dans la carte dépliée', () => {
  it('🔴🔴 trois boutons, Normal / Intermédiaire / Urgent, chacun dans sa couleur', async () => {
    await monter(CARTE());
    /* 🔴 REPLIÉE, IL N'EST PAS LÀ : le corps n'est monté qu'au premier dépliage (patron `BlocRepliable`). */
    expect(boutonsUrgence()).toHaveLength(0);
    await deplier();
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
    detailServi = { ...DETAIL_BASE, urgence: 'haute' };
    await monter(CARTE({ urgence: 'haute' }));
    await deplier();
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
    await monter(CARTE({ urgence: null }));
    await deplier();
    expect(boutonsUrgence().filter((b) => b.className.includes('gurg-voie--active'))).toHaveLength(0);
    expect(container.querySelector('.gurg-absent')?.textContent).toBe('Aucun niveau enregistré');
  });

  /**
   * 🔴🔴 « LE CHOIX EST ENREGISTRÉ TOUT DE SUITE » (Arno) — par la porte qui existait déjà, et par aucune autre.
   */
  it.each(NIVEAUX_URGENCE.map((n) => [n.mot, n.cle] as const))(
    '🔴🔴 « %s » écrit { urgence: "%s" } par PATCH /evenements/7', async (mot, cle) => {
      await monter(CARTE());
      await deplier();
      const b = boutonsUrgence().find((x) => x.textContent === mot) as HTMLButtonElement;
      await act(async () => { b.click(); });
      await calmer();
      const patch = ecritures.filter((e) => e.methode === 'PATCH');
      expect(patch).toHaveLength(1);
      expect(patch[0].url).toBe('/api/admin/gestion/evenements/7');
      expect(patch[0].corps).toEqual({ urgence: cle });
    });

  /**
   * 🔴🔴 « LA COULEUR DE LA CAPSULE CHANGE SANS RECHARGER » (Arno). C'est la propriété la plus facile à perdre : il
   * suffirait que l'écriture ne relise pas la carte, et la capsule garderait sa couleur jusqu'au prochain
   * rechargement de toute la page.
   *
   * 🔴 ON LE PROUVE EN DÉCALANT LA RÉPONSE DE LA ROUTE : avant le clic, la route sert `urgence: null` (capsule
   * grise) ; après, elle sert `urgence: 'urgent'`. Si la carte se RELIT, la capsule devient rouge — sans qu'aucun
   * rechargement n'ait eu lieu, puisque le composant n'est jamais remonté.
   */
  it('🔴🔴 la capsule change de couleur sans rechargement', async () => {
    await monter(CARTE({ urgence: null }));
    await deplier();
    expect(capsule()?.className).toContain('gst-type-capsule--sans-urgence');

    detailServi = { ...DETAIL_BASE, urgence: 'urgent' };
    const b = boutonsUrgence().find((x) => x.textContent === 'Urgent') as HTMLButtonElement;
    await act(async () => { b.click(); });
    await calmer();

    expect(capsule()?.className).toContain('gst-type-capsule--urg-rouge');
    expect(capsule()?.className).not.toContain('gst-type-capsule--sans-urgence');
    /* 🔴 ET LE TEXTE N'A PAS BOUGÉ : c'est le TYPE, pas le niveau. */
    expect(capsule()?.textContent).toContain('Travaux');
  });

  /**
   * 🔴 IL EST LÀ DANS LES DEUX ÉCRANS. Tout le reste du corps est encadré par `partage ? null :` (l'écran partagé
   * est une LISTE, accord d'Arno au lot EVENEMENT-MINIMALISTE) : enfermer le sélecteur dans le plein écran
   * l'aurait rendu absent là où Arno travaille le plus.
   */
  it('🔴 il est là dans l’écran partagé aussi', async () => {
    await monter(CARTE(), { partage: true });
    await deplier();
    expect(boutonsUrgence()).toHaveLength(3);
    /* ⚠️ ET LE RESTE DU CORPS EST TOUJOURS ABSENT de l'écran partagé : le lot ne renverse rien de ce choix-là. */
    expect(container.querySelector('.gst-sous-titre')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   POINT 4 — LE DOUBLE-CLIC, ET IL NE FAIT PAS LA MÊME CHOSE SELON L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② A — écran PARTAGÉ : le double-clic mène au plein écran, sur cet événement', () => {
  it('🔴🔴 double-clic → l’écran Événements, centré sur cet événement', async () => {
    const vus: number[] = [];
    await monter(CARTE(), { partage: true, onPleinEcranSurEvenement: (id) => vus.push(id) });
    await cliquer(titre(), 2);
    expect(vus).toEqual([7]);
  });

  /** 🔴 ET IL N'OUVRE PAS LA FICHE DU BIEN : c'est le geste de l'AUTRE écran. */
  it('🔴 il n’ouvre PAS la fiche du bien', async () => {
    const fiches: string[] = [];
    await monter(CARTE(), {
      partage: true, onOuvrirBien: (cle) => fiches.push(cle),
      onPleinEcranSurEvenement: () => {},
    });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([]);
  });

  /** ⚠️ SANS LA FONCTION, RIEN NE SE PASSE — et surtout pas une bascule de plus. La carte reste rendable ailleurs. */
  it('⚠️ sans `onPleinEcranSurEvenement`, le double-clic ne fait rien', async () => {
    await monter(CARTE(), { partage: true });
    await cliquer(titre(), 2);
    expect(container.querySelector('button[aria-expanded="true"]')).toBeNull();
  });
});

describe('🔴🔴 ② B — plein écran : le double-clic ouvre la fiche du bien', () => {
  it('🔴🔴 double-clic → la fiche du bien, sur cet événement', async () => {
    const fiches: { cle: string; id: number }[] = [];
    await monter(CARTE(), { onOuvrirBien: (cle, id) => fiches.push({ cle, id }) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([{ cle: '315', id: 7 }]);
  });

  /** 🔴 ET IL NE PART PAS VERS LE PLEIN ÉCRAN : on y est déjà. */
  it('🔴 il ne redemande pas le plein écran', async () => {
    const vus: number[] = [];
    await monter(CARTE(), { onOuvrirBien: () => {}, onPleinEcranSurEvenement: (id) => vus.push(id) });
    await cliquer(titre(), 2);
    expect(vus).toEqual([]);
  });

  /** 🔴🔴 « UN ÉVÉNEMENT SANS BIEN RATTACHÉ N'OUVRE PAS DE FICHE » (Arno), et rien d'autre ne change. */
  it('🔴🔴 aucun bien : aucune ouverture', async () => {
    const fiches: string[] = [];
    await monter(CARTE({ bien: null, nbBiens: 0 }), { onOuvrirBien: (cle) => fiches.push(cle) });
    await cliquer(titre(), 2);
    expect(fiches).toEqual([]);
  });

  /**
   * ⚠️ PLUSIEURS BIENS : AUCUNE OUVERTURE NON PLUS, ET C'EST DÉLIBÉRÉ. Le bouton rouge ouvre alors un CHOIX du
   * bien (« petit choix du bien d'abord », lot VIGNETTE-EVENEMENT) ; un double-clic n'a pas d'endroit où le poser,
   * et en désigner un d'office serait choisir à la place d'Arno, silencieusement, dans le seul cas où la question
   * se pose. Signalé à Arno plutôt que deviné.
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
  it('🔴 simple clic : il déplie, et n’ouvre aucune fiche', async () => {
    const fiches: string[] = [];
    const vus: number[] = [];
    await monter(CARTE(), {
      onOuvrirBien: (cle) => fiches.push(cle), onPleinEcranSurEvenement: (id) => vus.push(id),
    });
    await cliquer(titre(), 1);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(fiches).toEqual([]);
    expect(vus).toEqual([]);
  });

  /**
   * 🔴🔴 « UN DOUBLE-CLIC NE DOIT PAS D'ABORD DÉPLIER PUIS REPLIER LA CARTE » (Arno). C'est le défaut d'un
   * double-clic naïf : deux clics, deux bascules, la carte revient où elle était et l'on croit que rien n'a marché.
   *
   * 🔴 ON REJOUE LE GESTE ENTIER — premier clic, puis second — et l'on exige que la carte soit DÉPLIÉE à la fin.
   * Le second clic est intercepté en phase de capture : il n'atteint jamais le bouton du repli.
   */
  it('🔴🔴 double-clic : la carte ne revient PAS à son état de départ', async () => {
    await monter(CARTE(), { onOuvrirBien: () => {} });
    expect(container.querySelector('button[aria-expanded="true"]')).toBeNull();
    await cliquer(titre(), 1);
    await cliquer(titre(), 2);
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
  });

  /**
   * 🔴🔴 « UN DOUBLE-CLIC SUR UN BOUTON OU UN CONTRÔLE À L'INTÉRIEUR DE LA CARTE (sélecteur d'urgence, liens) NE
   * DÉCLENCHE PAS L'OUVERTURE DE LA FICHE » (Arno). On éprouve le cas qu'il nomme : le sélecteur d'urgence.
   */
  it('🔴🔴 double-clic sur le sélecteur d’urgence : aucune ouverture', async () => {
    const fiches: string[] = [];
    await monter(CARTE(), { onOuvrirBien: (cle) => fiches.push(cle) });
    await deplier();
    const b = boutonsUrgence()[2];
    await cliquer(b, 2);
    expect(fiches).toEqual([]);
  });

  /** 🔴 ET SUR UN BOUTON DE L'ÉCRAN PARTAGÉ non plus : même règle, autre écran. */
  it('🔴 double-clic sur le gros bouton rouge : pas de saut vers le plein écran', async () => {
    const vus: number[] = [];
    await monter(CARTE(), {
      partage: true, onOuvrirBien: () => {}, onPleinEcranSurEvenement: (id) => vus.push(id),
    });
    await deplier();
    const gros = container.querySelector('.gst-ouvrir-fiche') as HTMLElement;
    expect(gros).not.toBeNull();
    await cliquer(gros, 2);
    expect(vus).toEqual([]);
  });

  /**
   * 🔴 LA CAPSULE « Type à définir » GARDE SON CLIC, au simple comme au double : c'est un contrôle interne, et son
   * geste est d'ouvrir le choix du type — jamais de changer d'écran.
   */
  it('🔴 double-clic sur « Type à définir » : il ouvre le choix du type, et rien d’autre', async () => {
    const vus: number[] = [];
    detailServi = { ...DETAIL_BASE, categorie: null };
    await monter(CARTE({ categorie: null }), {
      partage: true, onOuvrirBien: () => {}, onPleinEcranSurEvenement: (id) => vus.push(id),
    });
    await cliquer(capsule() as Element, 2);
    expect(vus).toEqual([]);
  });
});

describe('🔴🔴 ③ l’événement VISÉ : liseré, déplié, centré', () => {
  it('🔴🔴 il porte le liseré de sélection, et le dit au lecteur d’écran', async () => {
    await monter(CARTE(), { vise: true });
    const li = container.querySelector('li.gst-item');
    expect(li?.className).toContain('gst-item--vise');
    expect(li?.getAttribute('aria-current')).toBe('true');
  });

  it('🔴🔴 il est DÉPLIÉ d’emblée', async () => {
    await monter(CARTE(), { vise: true });
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(boutonsUrgence()).toHaveLength(3);
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
    await monter(CARTE());
    await deplier();
    expect(container.querySelector('.gst-parties')).toBeNull();
    /* 🔴 ET LE RESTE DE LA CARTE EST BIEN LÀ : la preuve qu'elle n'a pas jeté. */
    expect(boutonsUrgence()).toHaveLength(3);
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
