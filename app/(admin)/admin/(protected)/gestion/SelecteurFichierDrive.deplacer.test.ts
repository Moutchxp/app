// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { MOT_FICHIER_SYSTEME } from '../../../../lib/gestion/driveDeplacement';

/**
 * LOT DRIVE-DEPLACER — LES QUATRE VOIES DU GESTE, MONTÉES POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER GARDE. Arno : « je ne peux pas saisir un fichier ou un document pour le glisser-déposer,
 * ni copier / couper / coller un fichier ou un dossier pour le déplacer via une mémoire tampon. Je veux ces
 * fonctionnalités. » Elles arrivent par QUATRE portes, et les quatre doivent mener au MÊME endroit :
 *   ① le glisser-déposer sur un dossier (⌥ pour copier) ;
 *   ② ⌘X / ⌘C / ⌘V, et Échap qui rend la coupe ;
 *   ③ le menu du clic droit (Couper, Copier, Coller ici) ;
 *   ④ la zone « Pièces jointes », qui JOINT et n'écrit rien dans le Drive.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS, ET NE PEUT PAS PROUVER : que l'archive est protégée. Un écran ne protège
 * rien — il explique. La protection est prouvée là où elle vit : `driveDeplacement.test.ts` (la règle) et
 * `deplacer/route.test.ts` (le refus, même appelée directement). Ce qui se prouve ICI, c'est que chacune des
 * quatre portes passe bien par cette route-là, et n'a pas son petit chemin de traverse.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let choisis: unknown[];
/** Ce qui a été envoyé à la route de déplacement : le seul endroit où un geste devient une écriture. */
let envois: { url: string; corps: Record<string, unknown> }[];
let journalPret: boolean;
let reponseMouvement: Record<string, unknown>;
/** Une promesse que le test débloque : elle laisse observer l'écran PENDANT que le serveur réfléchit. */
let lentEnCours: Promise<void> | null;
/** Vrai = le `fetch` du déplacement jette, comme un Drive muet. */
let echecReseau: boolean;

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  /**
   * 🔴 ON VIDE LA MÉMOIRE DE SESSION ENTRE DEUX TESTS (lot DRIVE-RETOUCHES-2). Les dossiers dépliés y sont
   * désormais retenus, d'une ouverture de la fenêtre à l'autre : sans ce nettoyage, un test hériterait de
   * l'arbre du précédent et ne prouverait plus ce qu'il croit prouver — un triangle « déplierait » un dossier
   * déjà ouvert, donc le refermerait.
   */
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide, ce qui convient */ }
  choisis = []; envois = [];
  journalPret = true;
  lentEnCours = null;
  echecReseau = false;
  reponseMouvement = {
    etat: 'ok', nomCible: 'Artisans', faits: [{ id: 'f1', nom: 'bail.pdf' }], refuses: [], mouvements: [101],
  };
  const contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
    fichiers: [
      fichier('d1', 'Artisans', true),
      fichier('d2', 'Baux', true),
      fichier('f1', 'bail.pdf'),
      fichier('f2', 'devis.pdf'),
      // 🔴 LE JUMEAU TECHNIQUE DE macOS, déposé à côté d'un vrai document.
      fichier('f3', '._bail.pdf'),
    ],
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (url.includes('/drive/deplacer')) {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ etat: 'ok', disponible: journalPret, motif: null }), { status: 200 });
      }
      const corps = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      envois.push({ url, corps });
      if (echecReseau) throw new Error('réseau coupé');
      if (lentEnCours !== null) await lentEnCours;
      if (corps.action === 'compter') {
        return new Response(JSON.stringify({ etat: 'ok', possible: true, elements: 4, phrase: 'Copier « Artisans » et son contenu, soit 4 éléments ?' }), { status: 200 });
      }
      return new Response(JSON.stringify(reponseMouvement), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    if (url.includes('/drive/apercu')) {
      return new Response(JSON.stringify({ etat: 'ok', nom: 'x', sorte: 'pdf', typeMime: 'application/pdf' }), { status: 200 });
    }
    return new Response(JSON.stringify(contenu), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      onChoisir: (c: unknown) => { choisis.push(c); }, onFermer: () => {},
    } as never));
  });
  await calmer();
};
/**
 * ⚠️ ON COMPARE LE NOM EXACT, dans sa propre case. « bail.pdf » est CONTENU dans « ._bail.pdf » — c'est même tout
 * le sujet de ce lot — et une recherche par inclusion attraperait la mauvaise ligne, en silence.
 */
const ligneDe = (nom: string) =>
  [...container.querySelectorAll('.sfd-ligne')]
    .find((x) => (x.querySelector('.sfd-nom')?.textContent ?? '') === nom);

/** 🔴 ⌘V COLLE DANS LE DOSSIER AFFICHÉ : il faut donc être DANS un dossier, et non à la racine du Drive. */
const entrerDansArtisans = async () => {
  await souris('Artisans', 'dblclick');
  expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const souris = async (nom: string, type: string, init: MouseEventInit = {}) => {
  await act(async () => { ligneDe(nom)?.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });
  await calmer();
};
const touche = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    container.querySelector('.sfd')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
  await calmer();
};

/**
 * ⚠️ `DataTransfer` N'EST PAS CONSTRUCTIBLE DANS jsdom. On en pose un faux sur un événement ordinaire : React lit
 * `dataTransfer` et `altKey` sur l'événement NATIF, donc un objet suffit — et c'est ce que l'application lit
 * vraiment, pas un double de l'application.
 */
function faireTransfert(charge: { id: string; nom: string; dossier?: boolean }[] | null) {
  const poses: Record<string, string> = {};
  if (charge !== null) poses['application/x-svv-drive'] = JSON.stringify(charge);
  return {
    poses,
    setData: (t: string, v: string) => { poses[t] = v; },
    getData: (t: string) => poses[t] ?? '',
    setDragImage: () => {},
    effectAllowed: '',
    dropEffect: '',
  };
}

async function glisser(
  type: string, cible: Element | null | undefined,
  o: {
    charge?: { id: string; nom: string; dossier?: boolean }[] | null;
    alt?: boolean;
    /** ⚠️ Un transfert DÉJÀ ouvert : une rafale (dragstart → dragover → drop) doit en partager un seul, comme
     *  dans le navigateur — en fabriquer un par événement ferait perdre ce qu'on tient entre deux. */
    transfert?: ReturnType<typeof faireTransfert>;
  } = {},
) {
  const transfert = o.transfert ?? faireTransfert(o.charge ?? null);
  await act(async () => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: transfert });
    Object.defineProperty(e, 'altKey', { value: o.alt === true });
    (cible as HTMLElement | undefined)?.dispatchEvent(e);
  });
  await calmer();
  return transfert;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE GLISSER-DÉPOSER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① glisser-déposer', () => {
  it('🔴 une ligne est SAISISSABLE — c’est exactement ce qui manquait', async () => {
    await monter();
    expect(ligneDe('bail.pdf')?.getAttribute('draggable')).toBe('true');
  });

  /**
   * 🔴 CE QUI VOYAGE TIENT EN UN TYPE MIME À NOUS. Pas de `text/plain`, pas de `text/uri-list` : un nom de
   * document du cabinet lâché dans le champ de recherche d'un autre onglet serait une fuite silencieuse.
   */
  it('🔴 le transfert ne porte QUE notre type MIME interne', async () => {
    await monter();
    const t = await glisser('dragstart', ligneDe('bail.pdf'));
    expect(Object.keys(t.poses)).toEqual(['application/x-svv-drive']);
    expect(JSON.parse(t.poses['application/x-svv-drive'])).toEqual([
      expect.objectContaining({ id: 'f1', nom: 'bail.pdf' }),
    ]);
  });

  it('déposer sur un DOSSIER déplace, par la route', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.action).toBe('deplacer');
    expect(envois[0].corps.cible).toBe('d1');
  });

  /** 🔴 OPTION (⌥) = COPIE, comme dans le Finder. Un fichier seul ne demande aucune confirmation. */
  it('déposer avec Option (⌥) copie au lieu de déplacer', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }], alt: true });
    expect(envois.map((e) => e.corps.action)).toEqual(['copier']);
  });

  /**
   * ⚠️ UN FICHIER N'EST PAS UNE DESTINATION. L'application ne fait pas `preventDefault` sur son survol, et c'est
   * le navigateur qui affiche alors le curseur « interdit » — le retour visuel demandé, rendu par le système.
   */
  it('un FICHIER n’accepte pas le dépôt : son survol n’est jamais « accepté »', async () => {
    await monter();
    await glisser('dragstart', ligneDe('bail.pdf'));
    const surDossier = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(surDossier, 'dataTransfer', { value: faireTransfert(null) });
    const surFichier = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(surFichier, 'dataTransfer', { value: faireTransfert(null) });
    await act(async () => {
      ligneDe('Artisans')?.dispatchEvent(surDossier);
      ligneDe('devis.pdf')?.dispatchEvent(surFichier);
    });
    // `defaultPrevented` EST la réponse « oui, on peut déposer ici ».
    expect(surDossier.defaultPrevented).toBe(true);
    expect(surFichier.defaultPrevented).toBe(false);
  });

  it('le dossier survolé s’allume, et s’éteint quand on le quitte', async () => {
    await monter();
    await glisser('dragstart', ligneDe('bail.pdf'));
    await glisser('dragover', ligneDe('Artisans'));
    expect(ligneDe('Artisans')?.className).toContain('sfd-ligne--vise');
    await glisser('dragleave', ligneDe('Artisans'));
    expect(ligneDe('Artisans')?.className).not.toContain('sfd-ligne--vise');
  });

  /**
   * ⚠️ ON DESCEND DE DEUX CRANS pour viser le crayon du MILIEU : le premier pas du fil (« Google Drive ») n'est pas
   * un dossier du Drive — c'est l'écran d'accueil, et rien ne s'y dépose.
   */
  it('le fil d’Ariane accepte le dépôt : c’est le geste « remonter d’un cran »', async () => {
    await monter();
    await entrerDansArtisans();
    await souris('Artisans', 'dblclick');
    const pas = [...container.querySelectorAll('.sfd-ariane-bouton')].find((b) => b.textContent === 'Artisans');
    await glisser('drop', pas, { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.action).toBe('deplacer');
    expect(envois[0].corps.cible).toBe('d1');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-RETOUCHES-2 — LE LÂCHER QUI NE DÉPLAÇAIT RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Constat d'Arno : « je prends un dossier, je le glisse sur un autre et je lâche AVANT que le dossier visé ait eu
   le temps de s'ouvrir tout seul → rien n'est déplacé. »

   🔴 LA CAUSE, TROUVÉE EN REPRODUISANT SUR LE VRAI DRIVE : `setGlisse` n'est pas appliqué avant la fin du
   gestionnaire de `dragstart`. Le PREMIER `dragover` lisait donc « rien en main » et refusait la cible — or
   Chrome n'émet `drop` QUE si le DERNIER `dragover` a été annulé. Un lâcher rapide ne déplaçait rien, en silence.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 lâcher AVANT que le dossier visé s’ouvre', () => {
  /**
   * ⚠️ CE TEST IMITE CHROME, PAS UNE COMMODITÉ : il ne dépose QUE si le dernier survol a été accepté. Un test qui
   * dispatcherait `drop` quoi qu'il arrive serait plus indulgent que le navigateur — et il aurait laissé passer
   * exactement ce défaut-là. (C'est ce qui s'est produit au premier jet de la reproduction.)
   */
  const glisserCommeChrome = async (source: string, cible: string, survols: number) => {
    const t = faireTransfert(null);
    let accepte = false;
    /* 🔴🔴 LE `dragstart` ET LE PREMIER `dragover` PARTENT DANS LE MÊME TOUR, SANS RENDU ENTRE LES DEUX — et
       c'est CE DÉTAIL qui reproduit le défaut. Le navigateur n'attend pas que React ait appliqué son état entre
       deux événements de la même rafale ; un test qui les sépare par un rendu est plus indulgent que Chrome, et
       laisse passer exactement ce qu'on cherche. (Vérifié : séparés, ce test passe MÊME sur le code fautif.) */
    await act(async () => {
      const d = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(d, 'dataTransfer', { value: t });
      ligneDe(source)?.dispatchEvent(d);
      const e = new Event('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'dataTransfer', { value: t });
      Object.defineProperty(e, 'altKey', { value: false });
      ligneDe(cible)?.dispatchEvent(e);
      accepte = e.defaultPrevented;
    });
    await calmer();
    for (let i = 1; i < survols; i += 1) {
      const e = new Event('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'dataTransfer', { value: t });
      Object.defineProperty(e, 'altKey', { value: false });
      await act(async () => { ligneDe(cible)?.dispatchEvent(e); });
      await calmer();
      accepte = e.defaultPrevented;
    }
    if (accepte) await glisser('drop', ligneDe(cible), { transfert: t });
    else await glisser('dragend', ligneDe(source), { transfert: t });
    return accepte;
  };

  it('🔴🔴 UN SEUL survol, puis on lâche : le déplacement part', async () => {
    await monter();
    const accepte = await glisserCommeChrome('bail.pdf', 'Artisans', 1);
    expect(accepte).toBe(true);
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.cible).toBe('d1');
  });

  /** 🔴 LE CAS D'ARNO : un DOSSIER lâché sur un dossier fermé, tout de suite. */
  it('🔴🔴 un DOSSIER lâché aussitôt sur un dossier fermé part aussi', async () => {
    await monter();
    const accepte = await glisserCommeChrome('Artisans', 'Baux', 1);
    expect(accepte).toBe(true);
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.elements).toEqual([expect.objectContaining({ id: 'd1' })]);
  });

  it('une sélection multiple part au premier survol, elle aussi', async () => {
    await monter();
    await souris('bail.pdf', 'click');
    await souris('devis.pdf', 'click', { metaKey: true });
    const accepte = await glisserCommeChrome('bail.pdf', 'Artisans', 1);
    expect(accepte).toBe(true);
    expect((envois[0].corps.elements as unknown[])).toHaveLength(2);
  });

  /** ⚠️ ET ON NE S'ACCEPTE PAS SOI-MÊME : un dossier lâché sur lui-même reste refusé au survol. */
  it('🔴 un dossier ne s’accepte pas lui-même comme cible', async () => {
    await monter();
    const accepte = await glisserCommeChrome('Artisans', 'Artisans', 2);
    expect(accepte).toBe(false);
    expect(envois).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LE RESSORT DÉPLIE SUR PLACE — IL N'ENTRE PLUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le ressort du glisser', () => {
  /**
   * 🔴🔴 IL DÉPLIE, IL N'ENTRE PAS (demande d'Arno). Avant, il appelait « entrer » : la vue changeait de racine en
   * plein glisser, le fil d'Ariane bougeait, et la ligne visée DISPARAISSAIT sous le curseur — le lâcher ne
   * tombait plus sur rien.
   */
  it('🔴🔴 après le délai, le dossier se DÉPLIE et la racine ne bouge pas', async () => {
    vi.useFakeTimers();
    try {
      await monter();
      const ariane = () => [...container.querySelectorAll('.sfd-ariane-bouton')].map((b) => b.textContent);
      const avant = ariane();
      const t = faireTransfert(null);
      await glisser('dragstart', ligneDe('bail.pdf'), { transfert: t });
      await glisser('dragover', ligneDe('Artisans'), { transfert: t });
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      // La racine n'a pas bougé, et le contenu du dossier est apparu SOUS lui.
      expect(ariane()).toEqual(avant);
      expect(ligneDe('Artisans')).toBeDefined();
    } finally { vi.useRealTimers(); }
  });

  /** 🔴 UN GESTE ABANDONNÉ REFERME CE QUE LE RESSORT AVAIT OUVERT : « seul Arno ouvre ou ferme un dossier ». */
  it('🔴 Échap (ou un lâcher dans le vide) referme les dépliages automatiques', async () => {
    vi.useFakeTimers();
    try {
      await monter();
      const t = faireTransfert(null);
      await glisser('dragstart', ligneDe('bail.pdf'), { transfert: t });
      await glisser('dragover', ligneDe('Artisans'), { transfert: t });
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const deplie = [...container.querySelectorAll('.sfd-ligne')].length;
      await glisser('dragend', ligneDe('bail.pdf'), { transfert: t });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect([...container.querySelectorAll('.sfd-ligne')].length).toBeLessThanOrEqual(deplie);
      expect(ligneDe('Artisans')?.querySelector('.sfd-triangle')?.getAttribute('aria-expanded')).toBe('false');
    } finally { vi.useRealTimers(); }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES DOSSIERS DÉPLIÉS RESTENT DÉPLIÉS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Constat d'Arno : « je déplie plusieurs dossiers, j'entre dans l'un d'eux, je ressors, et tous les dossiers
   dépliés sont refermés. » C'était `setOuverts(new Set())` dans la navigation. Le dépliage est un TRAVAIL de la
   personne : entrer quelque part ne doit pas le défaire. ════════════════════════════════════════════════════ */

describe('🔴 les dossiers dépliés survivent à la navigation', () => {
  const triangleDe = (nom: string) => ligneDe(nom)?.querySelector('.sfd-triangle');
  const estDeplie = (nom: string) => triangleDe(nom)?.getAttribute('aria-expanded') === 'true';

  it('🔴 déplier A et B, entrer dans A, ressortir → A et B toujours dépliés', async () => {
    await monter();
    await cliquer(triangleDe('Artisans'));
    await cliquer(triangleDe('Baux'));
    expect(estDeplie('Artisans')).toBe(true);
    expect(estDeplie('Baux')).toBe(true);

    // On entre dans « Artisans »…
    await souris('Artisans', 'dblclick');
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Artisans');
    // …puis on ressort par le bandeau des parents.
    await cliquer([...container.querySelectorAll('.sfd-ariane-bouton')].find((b) => b.textContent === 'Google Drive'));

    expect(estDeplie('Artisans')).toBe(true);
    expect(estDeplie('Baux')).toBe(true);
  });

  /** 🔴 ET D'UNE OUVERTURE DE LA FENÊTRE À L'AUTRE, dans la même session du navigateur. */
  it('🔴 l’arbre déplié est retrouvé à la réouverture de la fenêtre', async () => {
    await monter();
    await cliquer(triangleDe('Artisans'));
    expect(estDeplie('Artisans')).toBe(true);

    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await monter();
    expect(estDeplie('Artisans')).toBe(true);
  });

  /** ⚠️ ET SEUL ARNO REFERME : un replis explicite est respecté, et retenu lui aussi. */
  it('replier reste possible, et se retient', async () => {
    await monter();
    await cliquer(triangleDe('Artisans'));
    await cliquer(triangleDe('Artisans'));
    expect(estDeplie('Artisans')).toBe(false);
    await souris('Artisans', 'dblclick');
    await cliquer([...container.querySelectorAll('.sfd-ariane-bouton')].find((b) => b.textContent === 'Google Drive'));
    expect(estDeplie('Artisans')).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 « ↶ ANNULER LE DERNIER DÉPLACEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le bouton « Annuler le dernier déplacement »', () => {
  const bouton = () => [...container.querySelectorAll('.sfd-pied button')]
    .find((b) => (b.textContent ?? '').includes('Annuler le dernier')) as HTMLButtonElement | undefined;

  it('grisé tant que rien n’a été déplacé, et l’infobulle dit pourquoi', async () => {
    await monter();
    expect(bouton()?.disabled).toBe(true);
    expect(bouton()?.getAttribute('title')).toContain('Aucun déplacement à annuler');
    // ⚠️ ET LE CAS QUI SURPRENT Y EST NOMMÉ : une copie ne s'annule pas.
    expect(bouton()?.getAttribute('title')).toContain('copie');
  });

  it('🔴 actif après un déplacement, et son infobulle dit ce qu’il va défaire', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(bouton()?.disabled).toBe(false);
    expect(bouton()?.getAttribute('title')).toContain('Remettre « bail.pdf »');
  });

  it('🔴 un clic défait le pas le plus récent, par la route et le journal', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    envois = [];
    await cliquer(bouton());
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.action).toBe('annuler');
    expect(envois[0].corps.mouvements).toEqual([101]);
    // Le pas est consommé : le bouton se regrise.
    expect(bouton()?.disabled).toBe(true);
  });

  /**
   * 🔴🔴 UNE COPIE N'ENTRE PAS DANS LA PILE : l'annuler voudrait dire la SUPPRIMER, et l'application ne supprime
   * rien. Le bouton reste donc grisé après une copie — il ne « saute » pas un pas, il n'y en a jamais eu.
   */
  it('🔴🔴 une copie ne rend pas le bouton actif', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }], alt: true });
    expect(container.querySelector('.sfd-bandeau')?.textContent).toContain('copié');
    expect(bouton()?.disabled).toBe(true);
  });

  /** ⚠️ ON PEUT REMONTER PLUSIEURS PAS : un lot = un pas, et les clics se suivent. */
  it('deux déplacements, deux annulations', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    reponseMouvement = { ...reponseMouvement, mouvements: [102], faits: [{ id: 'f2', nom: 'devis.pdf' }] };
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f2', nom: 'devis.pdf' }] });
    envois = [];
    await cliquer(bouton());
    await cliquer(bouton());
    expect(envois.map((e) => e.corps.mouvements)).toEqual([[102], [101]]);
    expect(bouton()?.disabled).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② ⌘X / ⌘C / ⌘V, ET ÉCHAP
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② couper / copier / coller au clavier', () => {
  it('⌘X puis ⌘V : la route reçoit un DÉPLACEMENT vers le dossier affiché', async () => {
    await monter();
    await entrerDansArtisans();
    await souris('bail.pdf', 'click');
    await touche('x', { metaKey: true });
    await touche('v', { metaKey: true });
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.action).toBe('deplacer');
    expect(envois[0].corps.elements).toEqual([expect.objectContaining({ id: 'f1' })]);
  });

  it('⌘C puis ⌘V : la route reçoit une COPIE', async () => {
    await monter();
    await entrerDansArtisans();
    await souris('bail.pdf', 'click');
    await touche('c', { metaKey: true });
    await touche('v', { metaKey: true });
    expect(envois.map((e) => e.corps.action)).toEqual(['copier']);
  });

  /** 🔴 « Les éléments coupés apparaissent estompés jusqu'au collage » (Arno) — et ils N'ONT PAS BOUGÉ. */
  it('🔴 un élément coupé est estompé, et rien n’est encore parti', async () => {
    await monter();
    await souris('bail.pdf', 'click');
    await touche('x', { metaKey: true });
    expect(ligneDe('bail.pdf')?.className).toContain('sfd-ligne--coupee');
    expect(ligneDe('devis.pdf')?.className).not.toContain('sfd-ligne--coupee');
    expect(envois).toHaveLength(0);
  });

  /** 🔴 « Échap annule la coupe » (Arno) — et ne ferme PAS la fenêtre tant qu'il y a une coupe à rendre. */
  it('🔴 Échap rend la coupe, et un ⌘V ensuite n’envoie rien', async () => {
    let fermetures = 0;
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: () => {}, onFermer: () => { fermetures += 1; },
      } as never));
    });
    await calmer();
    await entrerDansArtisans();
    await souris('bail.pdf', 'click');
    await touche('x', { metaKey: true });
    await touche('Escape');
    expect(fermetures).toBe(0);
    expect(ligneDe('bail.pdf')?.className).not.toContain('sfd-ligne--coupee');
    await touche('v', { metaKey: true });
    expect(envois).toHaveLength(0);
    // La coupe rendue, Échap retrouve son rôle ordinaire.
    await touche('Escape');
    expect(fermetures).toBe(1);
  });

  it('⌘V sans rien dans la mémoire tampon ne fait rien du tout', async () => {
    await monter();
    await touche('v', { metaKey: true });
    expect(envois).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE MENU DU CLIC DROIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ le menu contextuel', () => {
  const entrees = () => [...container.querySelectorAll('.sfd-menu-item')].map((b) => ({
    mot: (b.textContent ?? '').trim(), eteint: (b as HTMLButtonElement).disabled,
    motif: b.getAttribute('title'),
  }));

  it('porte Couper, Copier et Coller ici', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    const mots = entrees().map((e) => e.mot);
    expect(mots).toContain('Couper');
    expect(mots).toContain('Copier');
    expect(mots.some((m) => m.startsWith('Coller'))).toBe(true);
  });

  /** 🔴🔴 ET JAMAIS CE QUE L'APPLICATION NE FAIT PAS : supprimer, renommer, corbeille, partager. */
  it('🔴🔴 et jamais Supprimer, Renommer, Corbeille ni Partager', async () => {
    await monter();
    await souris('Artisans', 'contextmenu');
    const texte = entrees().map((e) => e.mot).join(' ').toLowerCase();
    for (const mot of ['supprim', 'renomm', 'corbeille', 'partag']) expect(texte).not.toContain(mot);
  });

  it('« Couper » puis « Coller ici » sur un dossier collent DANS ce dossier', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    await cliquer([...container.querySelectorAll('.sfd-menu-item')].find((b) => b.textContent === 'Couper'));
    await souris('Artisans', 'contextmenu');
    await cliquer([...container.querySelectorAll('.sfd-menu-item')]
      .find((b) => (b.textContent ?? '').startsWith('Coller')));
    expect(envois).toHaveLength(1);
    expect(envois[0].corps.cible).toBe('d1');
    expect(envois[0].corps.action).toBe('deplacer');
  });

  it('« Coller » est éteint quand la mémoire tampon est vide, et dit le geste à faire d’abord', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    const coller = entrees().find((e) => e.mot.startsWith('Coller'));
    expect(coller?.eteint).toBe(true);
    expect(coller?.motif).toContain('⌘X');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 SANS LA MIGRATION 274 : LE GESTE EST ÉTEINT, AVEC SON MOTIF
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 sans le journal en base', () => {
  beforeEach(() => { journalPret = false; });

  it('les trois entrées du menu sont éteintes, avec le motif écrit en toutes lettres', async () => {
    await monter();
    await souris('bail.pdf', 'contextmenu');
    const boutons = [...container.querySelectorAll('.sfd-menu-item')]
      .filter((b) => ['Couper', 'Copier'].includes((b.textContent ?? '').trim())
        || (b.textContent ?? '').startsWith('Coller'));
    expect(boutons).toHaveLength(3);
    for (const b of boutons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toContain('base');
    }
  });

  it('⌘X puis ⌘V n’envoie rien : l’écran ne tente pas ce que la route refusera', async () => {
    await monter();
    await souris('bail.pdf', 'click');
    await touche('x', { metaKey: true });
    await touche('v', { metaKey: true });
    expect(envois).toHaveLength(0);
  });

  it('un dépôt sur un dossier est refusé, avec son motif — et rien n’est envoyé', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(envois).toHaveLength(0);
    expect(container.textContent).toContain('n’est pas appliquée');
  });

  /** 🔴 MAIS LE GLISSER VERS LE MAIL RESTE (demande d'Arno) : il n'écrit rien dans le Drive, il joint. */
  it('🔴 la zone « Pièces jointes », elle, fonctionne toujours', async () => {
    await monter();
    await glisser('drop', container.querySelector('.sfd-depot'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(choisis).toHaveLength(1);
    expect(envois).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA ZONE « PIÈCES JOINTES »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ le dépôt sur les pièces jointes', () => {
  it('joint le fichier déposé, sans rien écrire dans le Drive', async () => {
    await monter();
    await glisser('drop', container.querySelector('.sfd-depot'), {
      charge: [{ id: 'f1', nom: 'bail.pdf' }, { id: 'f2', nom: 'devis.pdf' }],
    });
    expect(choisis).toHaveLength(2);
    expect(envois).toHaveLength(0);
  });

  it('un DOSSIER déposé là est refusé, et le dit : un dossier ne se joint pas', async () => {
    await monter();
    await glisser('drop', container.querySelector('.sfd-depot'), {
      charge: [{ id: 'd1', nom: 'Artisans', dossier: true }],
    });
    expect(choisis).toHaveLength(0);
    expect(container.textContent).toContain('ne se joint pas');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES FICHIERS « ._ »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les fichiers système de macOS restent affichés, mais grisés', () => {
  /** ⚠️ La colonne « Type » est masquée à l'ouverture depuis le lot DRIVE-UNIQUE : on l'affiche pour la lire. */
  it('affiché, grisé, et son type dit ce qu’il est', async () => {
    await monter();
    const l = ligneDe('._bail.pdf');
    expect(l).toBeDefined();
    expect(l?.className).toContain('sfd-ligne--systeme');
    expect(l?.getAttribute('title')).toContain('ouvrez ou joignez « bail.pdf »');
    await cliquer(container.querySelector('.sfd-outil[aria-label="Afficher les colonnes"]'));
    expect(ligneDe('._bail.pdf')?.querySelector('.sfd-col-type')?.textContent).toBe(MOT_FICHIER_SYSTEME);
  });

  it('🔴 ni « Visualiser » ni « Joindre » — le vrai fichier, lui, les a', async () => {
    await monter();
    const gestes = (nom: string) => [...(ligneDe(nom)?.querySelectorAll('.sfd-geste') ?? [])]
      .map((b) => b.getAttribute('title'));
    expect(gestes('._bail.pdf')).toEqual(['Insérer un lien']);
    expect(gestes('devis.pdf')).toContain('Visualiser');
    expect(gestes('devis.pdf')).toContain('Joindre au message');
  });

  it('le double-clic ne l’ouvre pas : il n’y a rien à voir dedans', async () => {
    await monter();
    await souris('._bail.pdf', 'dblclick');
    expect(container.querySelector('.apd')).toBeNull();
    expect(container.textContent).toContain('ne contient pas le document');
  });

  it('déposé sur les pièces jointes, il est ÉCARTÉ, et on dit pourquoi', async () => {
    await monter();
    await glisser('drop', container.querySelector('.sfd-depot'), { charge: [{ id: 'f3', nom: '._bail.pdf' }] });
    expect(choisis).toHaveLength(0);
    expect(container.textContent).toContain('Rien de joignable');
  });

  it('mais il se DÉPLACE comme les autres : c’est un fichier du Drive comme un autre', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f3', nom: '._bail.pdf' }] });
    expect(envois).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-DEPLACER-RAPIDE — L'ÉCRAN RÉPOND AU LÂCHER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Arno : « au lâcher, l'élément quitte la source et apparaît dans la cible IMMÉDIATEMENT (moins de 100 ms), avec
   un petit indicateur discret “en cours”. Si le serveur refuse ou échoue, l'élément revient à sa place d'origine,
   avec le motif en clair. » ══════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’écran optimiste', () => {
  /** Une réponse qu'on fait attendre : c'est le seul moyen d'observer l'écran PENDANT que le serveur réfléchit. */
  const reponseLente = () => {
    let debloquer: () => void = () => {};
    const attente = new Promise<void>((r) => { debloquer = r; });
    return { attente, debloquer };
  };

  it('🔴 la ligne quitte la source et paraît « en cours » AVANT la réponse du serveur', async () => {
    const lent = reponseLente();
    lentEnCours = lent.attente;
    await monter();
    expect(ligneDe('bail.pdf')).toBeDefined();

    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });

    // ① La ligne a quitté la liste affichée, et le serveur n'a pas encore répondu.
    expect(ligneDe('bail.pdf')).toBeUndefined();
    // ② Le bandeau est là, AU PRÉSENT, et sans « Annuler » — rien n'est encore fait.
    expect(container.querySelector('.sfd-bandeau')?.textContent).toContain('en cours de déplacement');
    expect(container.querySelector('.sfd-bandeau-annuler')).toBeNull();

    lent.debloquer();
    await calmer();
    // ③ À la réponse : le bandeau devient définitif, et son « Annuler » paraît.
    expect(container.querySelector('.sfd-bandeau')?.textContent).toContain('déplacé vers « Artisans »');
    expect(container.querySelector('.sfd-bandeau-annuler')).not.toBeNull();
  });

  /**
   * 🔴 LE TEST QUI COMPTE : un refus doit DÉFAIRE l'affichage. Sans lui, l'écran garderait un fichier là où il
   * n'est pas — et on ne s'en apercevrait qu'en le cherchant.
   */
  it('🔴🔴 un refus ramène la ligne à sa place, avec le motif', async () => {
    reponseMouvement = {
      etat: 'ok', nomCible: 'Artisans', faits: [], mouvements: [],
      refuses: [{ id: 'f1', nom: 'bail.pdf', motif: 'Refusé : c’est l’archive du cabinet.' }],
    };
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });

    expect(ligneDe('bail.pdf')).toBeDefined();
    expect(container.textContent).toContain('archive du cabinet');
    expect(container.querySelector('.sfd-bandeau')).toBeNull();
  });

  it('🔴 un lot mêlé : le refusé revient, le réussi reste parti', async () => {
    reponseMouvement = {
      etat: 'ok', nomCible: 'Artisans', mouvements: [101],
      faits: [{ id: 'f1', nom: 'bail.pdf' }],
      refuses: [{ id: 'f2', nom: 'devis.pdf', motif: 'Refusé : emplacement inconnu.' }],
    };
    await monter();
    await glisser('drop', ligneDe('Artisans'), {
      charge: [{ id: 'f1', nom: 'bail.pdf' }, { id: 'f2', nom: 'devis.pdf' }],
    });
    expect(ligneDe('bail.pdf')).toBeUndefined();
    expect(ligneDe('devis.pdf')).toBeDefined();
    expect(container.textContent).toContain('emplacement inconnu');
  });

  it('🔴 le Drive muet ramène tout, et le dit', async () => {
    echecReseau = true;
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(ligneDe('bail.pdf')).toBeDefined();
    expect(container.textContent).toContain('n’a pas répondu');
    expect(container.querySelector('.sfd-bandeau')).toBeNull();
  });

  /**
   * ⚠️ PAS DE RECHARGEMENT COMPLET. `charger()` viderait l'écran, remettrait le défilement en haut et repasserait
   * par l'état « chargement » — exactement ce qu'on vient d'éviter. La revalidation relit en silence.
   */
  it('🔴 aucun squelette de chargement après un déplacement', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(container.querySelector('.sfd-squelette')).toBeNull();
    expect(ligneDe('Artisans')).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE BANDEAU « ANNULER », ET LA CONFIRMATION D'UNE COPIE DE DOSSIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le bandeau « déplacé vers X — Annuler »', () => {
  it('paraît après un déplacement, et son « Annuler » repasse par la route avec le numéro de journal', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    const bandeau = container.querySelector('.sfd-bandeau');
    expect(bandeau?.textContent).toContain('déplacé vers « Artisans »');

    await cliquer(container.querySelector('.sfd-bandeau-annuler'));
    expect(envois).toHaveLength(2);
    expect(envois[1].corps.action).toBe('annuler');
    expect(envois[1].corps.mouvements).toEqual([101]);
  });

  /** ⚠️ UNE COPIE NE S'ANNULE PAS : l'annuler voudrait dire SUPPRIMER la copie, et l'application ne supprime rien. */
  it('🔴 après une COPIE, le bandeau ne propose AUCUN retour', async () => {
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }], alt: true });
    expect(container.querySelector('.sfd-bandeau')?.textContent).toContain('copié');
    expect(container.querySelector('.sfd-bandeau-annuler')).toBeNull();
  });

  it('un refus est dit AVEC son motif, et non avalé en silence', async () => {
    reponseMouvement = {
      etat: 'ok', nomCible: 'Artisans', faits: [], mouvements: [],
      refuses: [{ id: 'f1', nom: 'bail.pdf', motif: 'Refusé : c’est l’archive du cabinet.' }],
    };
    await monter();
    await glisser('drop', ligneDe('Artisans'), { charge: [{ id: 'f1', nom: 'bail.pdf' }] });
    expect(container.textContent).toContain('archive du cabinet');
    expect(container.querySelector('.sfd-bandeau')).toBeNull();
  });
});

describe('🔴 copier un DOSSIER : on annonce le nombre avant', () => {
  it('le serveur compte, l’écran demande confirmation, et rien n’est copié avant le « Copier »', async () => {
    await monter();
    await entrerDansArtisans();
    await souris('Artisans', 'click');
    await touche('c', { metaKey: true });
    await touche('v', { metaKey: true });

    // Un seul envoi pour l'instant : le COMPTAGE, qui n'écrit rien.
    expect(envois.map((e) => e.corps.action)).toEqual(['compter']);
    expect(container.textContent).toContain('soit 4 éléments');

    await cliquer([...container.querySelectorAll('.svv-btn')].find((b) => b.textContent === 'Copier'));
    expect(envois.map((e) => e.corps.action)).toEqual(['compter', 'copier']);
  });

  it('« Annuler » dans la confirmation ne copie rien', async () => {
    await monter();
    await entrerDansArtisans();
    await souris('Artisans', 'click');
    await touche('c', { metaKey: true });
    await touche('v', { metaKey: true });
    await cliquer([...container.querySelectorAll('.sfd-creer-boutons .svv-btn')]
      .find((b) => b.textContent === 'Annuler'));
    expect(envois.map((e) => e.corps.action)).toEqual(['compter']);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
