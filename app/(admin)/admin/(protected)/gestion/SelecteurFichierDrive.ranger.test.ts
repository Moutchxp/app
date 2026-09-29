// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { MIME_PIECE } from '../../../../lib/gestion/rangementDrive';

/**
 * LOT DRIVE-UNIQUE — LA MÊME FENÊTRE, EN MODE « RANGER ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER GARDE. Arno : « il faut uniformiser l'utilisation du Drive […] et l'appliquer aussi quand
 * on reçoit un mail avec des pièces jointes à envoyer dans le Drive. Je veux le même système que la fenêtre Drive
 * façon Finder, partout où on y fait appel, avec l'ouverture d'une modale. »
 *
 * Le panneau en ligne qui servait à cela est supprimé. Ce fichier prouve qu'AUCUNE de ses fonctions n'est perdue :
 *   ① le panneau « À ranger », avec miniature, nom et taille, et chaque pièce saisissable ;
 *   ② le dépôt par GLISSER sur un dossier de l'arbre, sur un parent du bandeau, sur la barre latérale ;
 *   ③ le dépôt par « Déposer ici » ;
 *   ④ « Dernier dossier utilisé pour cet échange » et les « dossiers récents » datés, en tête de la barre latérale ;
 *   ⑤ « ✓ Rangée dans X », avec son lien, et la fenêtre qui RESTE ouverte ;
 *   ⑥ 🔴🔴 le refus, motif compris, quand le serveur dit que la cible est dans l'archive du cabinet.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS : que l'archive est protégée. Un écran ne protège rien. La protection se
 * prouve là où elle vit — `driveCreation.test.ts` pour la règle (`peutDeposer`), et le test de la route de dépôt
 * pour le refus, même appelée directement. Ici, on prouve que l'écran DIT le refus au lieu de l'avaler.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Ce qui a été envoyé aux routes de dépôt : le seul endroit où un geste devient une copie dans le Drive. */
let depots: { pieceId: string; dossierId: string }[];
let rangements: number;
let reponseDepot: { statut: number; corps: Record<string, unknown> };

const PIECES = [
  { pieceId: 11, nom: 'DEV-20260928-18919.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' },
  { pieceId: 12, nom: 'photo.jpg', tailleOctets: 12_004, typeMime: 'image/jpeg' },
];

const fichier = (id: string, nom: string, dossier = false, parentId = 'D1') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId,
});

/** Le contenu d'un dossier : chaque dossier en a un, pour pouvoir en déplier deux à la fois. */
const CONTENUS: Record<string, ReturnType<typeof fichier>[]> = {
  '': [fichier('d1', 'Artisans', true), fichier('d2', 'Baux', true), fichier('f1', 'bail.pdf')],
  d1: [fichier('f10', 'devis-artisan.pdf', false, 'd1')],
  d2: [fichier('f20', 'bail-2024.pdf', false, 'd2')],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  depots = []; rangements = 0;
  reponseDepot = {
    statut: 200,
    corps: { etat: 'ok', resultats: [{ pieceId: 11, nomFichier: 'x', etat: 'depose', lien: 'https://drive/x' }] },
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    // ── LE DÉPÔT D'UNE PIÈCE ──────────────────────────────────────────────────────────────────────────────────
    const m = /\/api\/admin\/gestion\/pieces\/(\d+)\/drive/.exec(url);
    if (m !== null && (init?.method ?? 'GET') === 'POST') {
      const corps = JSON.parse(String(init?.body ?? '{}')) as { dossierId?: string };
      depots.push({ pieceId: m[1], dossierId: corps.dossierId ?? '' });
      return new Response(JSON.stringify(reponseDepot.corps), { status: reponseDepot.statut });
    }
    // ── LA VUE D'OUVERTURE : dernier dossier de l'échange, et dossiers récents datés ───────────────────────────
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({
        etat: 'ok', mode: 'accueil',
        dernier: { id: 'D_DERNIER', nom: 'CHARPENTIER', chemin: 'GESTION LOCATIVE › 1 Propriétaires', dernierDepot: '2026-09-28T10:00:00Z' },
        recents: [{ id: 'D_REC', nom: 'Travaux', chemin: 'GESTION LOCATIVE › Travaux', dernierDepot: '2026-09-20T09:00:00Z' }],
      }), { status: 200 });
    }
    if (url.includes('/drive/deplacer')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    // ── LE CONTENU D'UN DOSSIER ───────────────────────────────────────────────────────────────────────────────
    const d = new URL(url, 'http://local').searchParams.get('dossier') ?? '';
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
      fichiers: CONTENUS[d] ?? [],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (pieces = PIECES) => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 900, filId: 42, pieces,
      onRangement: () => { rangements += 1; }, onFermer: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const ligneDe = (nom: string) => [...container.querySelectorAll('.sfd-ligne')]
  .find((x) => (x.querySelector('.sfd-nom')?.textContent ?? '') === nom);
const pieceDe = (nom: string) => [...container.querySelectorAll('.sfd-piece')]
  .find((x) => (x.querySelector('.sfd-piece-nom')?.textContent ?? '') === nom);
const lateraleDe = (m: RegExp) => [...container.querySelectorAll('.sfd-cote-item')]
  .find((b) => m.test(b.textContent ?? ''));

/** ⚠️ `DataTransfer` n'est pas constructible dans jsdom : on en pose un faux sur un événement ordinaire. */
function transfert(charge: Record<string, string> = {}) {
  const poses = { ...charge };
  return {
    poses,
    setData: (t: string, v: string) => { poses[t] = v; },
    getData: (t: string) => poses[t] ?? '',
    setDragImage: () => {},
    effectAllowed: '', dropEffect: '',
  };
}
async function glisser(type: string, cible: Element | null | undefined, t = transfert()) {
  await act(async () => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: t });
    Object.defineProperty(e, 'altKey', { value: false });
    (cible as HTMLElement | undefined)?.dispatchEvent(e);
  });
  await calmer();
  return t;
}
/** Le geste complet : on saisit la pièce, puis on la lâche sur la cible. */
async function glisserPiece(nom: string, cible: Element | null | undefined) {
  const t = await glisser('dragstart', pieceDe(nom));
  await glisser('drop', cible, t);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE PANNEAU « À RANGER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① le panneau « À ranger »', () => {
  it('liste les pièces avec leur miniature, leur nom et leur taille', async () => {
    await monter();
    const p = pieceDe('DEV-20260928-18919.pdf');
    expect(p).toBeDefined();
    expect(p?.querySelector('.sfd-piece-taille')?.textContent).toBe('84 Ko');
    expect(p?.querySelector('img')?.getAttribute('src')).toBe('/api/admin/gestion/pieces/11/miniature');
  });

  /**
   * 🔴 LA VIGNETTE NE DOIT PAS ÊTRE SAISISSABLE ELLE-MÊME. Une image est glissable NATIVEMENT : sans ce garde,
   * saisir la pièce par sa miniature — le réflexe naturel, c'est la plus grosse cible — démarrait le glisser de
   * l'IMAGE, et le dépôt n'arrivait jamais, en silence. Vu à l'écran, sur la vraie pièce.
   */
  it('🔴 la miniature n’est PAS saisissable : c’est la LIGNE qu’on glisse', async () => {
    await monter();
    expect(pieceDe('photo.jpg')?.querySelector('img')?.getAttribute('draggable')).toBe('false');
  });

  it('chaque pièce est saisissable, et ne porte QUE notre type MIME', async () => {
    await monter();
    expect(pieceDe('photo.jpg')?.getAttribute('draggable')).toBe('true');
    const t = await glisser('dragstart', pieceDe('photo.jpg'));
    expect(Object.keys(t.poses)).toEqual([MIME_PIECE]);
    expect(JSON.parse(t.poses[MIME_PIECE])).toEqual({ pieceId: 12, nom: 'photo.jpg' });
  });

  it('le titre de la fenêtre dit ce qu’on tient, et le panneau ce qui reste', async () => {
    await monter();
    expect(container.querySelector('.sfd-titre')?.textContent).toBe('Ranger 2 pièces dans le Drive');
    expect(container.querySelector('.sfd-ranger-titre')?.textContent).toBe('2 pièces à ranger');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE DÉPÔT PAR GLISSER — sur l'arbre, le bandeau, la barre latérale
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② ranger en glissant', () => {
  it('sur un dossier de l’arbre : la pièce part vers CE dossier', async () => {
    await monter();
    await glisserPiece('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    expect(depots).toEqual([{ pieceId: '11', dossierId: 'd1' }]);
  });

  /** 🔴 « ✓ Rangée dans X », avec son lien — et la fenêtre RESTE ouverte pour la pièce suivante. */
  it('la pièce dit où elle est allée, et la fenêtre reste ouverte', async () => {
    await monter();
    await glisserPiece('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    const p = pieceDe('DEV-20260928-18919.pdf');
    expect(p?.textContent).toContain('✓ Rangée dans « Artisans »');
    expect(p?.querySelector('.sfd-piece-lien')?.getAttribute('href')).toBe('https://drive/x');
    expect(container.querySelector('.sfd')).not.toBeNull();
    expect(container.querySelector('.sfd-ranger-titre')?.textContent).toBe('1 pièce à ranger');
    // L'écran du message est prévenu : c'est lui qui affiche « Dans le Drive » sur la carte de la pièce.
    expect(rangements).toBe(1);
  });

  it('sur un parent du BANDEAU : c’est le geste « remonter d’un cran » du Finder', async () => {
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    // On entre dans « Artisans » : le bandeau porte alors ce dossier, qui devient une cible.
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    const pas = [...container.querySelectorAll('.sfd-ariane-bouton')].find((b) => b.textContent === 'Artisans');
    await glisserPiece('photo.jpg', pas);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
  });

  it('sur « Dernier dossier utilisé pour cet échange », dans la barre latérale', async () => {
    await monter();
    await glisserPiece('photo.jpg', lateraleDe(/CHARPENTIER/));
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'D_DERNIER' }]);
  });

  it('sur un dossier RÉCENT de dépôt', async () => {
    await monter();
    await glisserPiece('photo.jpg', lateraleDe(/Travaux/));
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'D_REC' }]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ « DÉPOSER ICI » — la seconde voie
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ « Déposer ici »', () => {
  const bouton = () => [...container.querySelectorAll('.sfd-pied button')]
    .find((b) => (b.textContent ?? '').startsWith('Déposer ici')) as HTMLButtonElement | undefined;

  /** ⚠️ ÉTEINT À LA RACINE : « Google Drive » n'est pas un dossier, et Google refuserait APRÈS le téléversement. */
  it('est éteint tant qu’on n’est pas DANS un dossier, et dit pourquoi', async () => {
    await monter();
    expect(bouton()?.disabled).toBe(true);
    expect(bouton()?.getAttribute('title')).toContain('Entrez dans un dossier');
  });

  it('dans un dossier : il range TOUT ce qui reste, et annonce combien', async () => {
    await monter();
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    expect(bouton()?.textContent).toBe('Déposer ici (2)');
    await cliquer(bouton());
    expect(depots.map((d) => d.pieceId).sort()).toEqual(['11', '12']);
    expect(depots.every((d) => d.dossierId === 'd1')).toBe(true);
  });

  /** ⚠️ IL NE REDÉPOSE PAS CE QUI EST DÉJÀ RANGÉ : relancer le bouton ne doit pas dupliquer une pièce posée. */
  it('🔴 il ne range que ce qui RESTE à ranger', async () => {
    await monter();
    await glisserPiece('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    depots = [];
    await act(async () => { ligneDe('Baux')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    await cliquer(bouton());
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd2' }]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ L'ARBORESCENCE COMPACTE — deux dossiers ouverts à la fois
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ l’arborescence compacte', () => {
  /**
   * 🔴 LA DEMANDE D'ARNO, MOT POUR MOT : « le déploiement décale mécaniquement les dossiers autour, mais ces
   * derniers restent toujours visibles. On peut ainsi saisir un document dans un dossier ouvert et le
   * glisser-déposer dans un dossier voisin. »
   */
  it('deux dossiers dépliés en même temps, et les voisins restent visibles', async () => {
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    await cliquer(ligneDe('Baux')?.querySelector('.sfd-triangle'));
    const noms = [...container.querySelectorAll('.sfd-nom')].map((x) => x.textContent);
    expect(noms).toEqual(['Artisans', 'devis-artisan.pdf', 'Baux', 'bail-2024.pdf', 'bail.pdf']);
    // Le contenu est INDENTÉ d'un cran sous son dossier, et le dossier voisin n'a pas disparu.
    expect((ligneDe('devis-artisan.pdf') as HTMLElement).style.paddingLeft).toBe('22px');
    expect(ligneDe('Baux')).toBeDefined();
  });

  it('🔴 un document d’un dossier ouvert se glisse dans le dossier voisin ouvert', async () => {
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    await cliquer(ligneDe('Baux')?.querySelector('.sfd-triangle'));
    const t = await glisser('dragstart', ligneDe('devis-artisan.pdf'));
    await glisser('drop', ligneDe('Baux'), t);
    // C'est un DÉPLACEMENT dans le Drive, pas un rangement : il passe par l'autre route, avec l'autre type MIME.
    expect(depots).toEqual([]);
  });

  /**
   * 🔴 UN CLIC SUR LA LIGNE DÉPLIE AUSSI — mais après un court délai, parce qu'un double-clic commence par un
   * clic. Sans ce délai, la liste changeait sous le curseur entre les deux temps du double-clic et celui-ci se
   * perdait : le dossier ne s'ouvrait pas, une fois sur deux, sans que rien ne l'explique. Vu à l'écran.
   */
  it('un clic sur la ligne déplie aussi — après le court délai qui protège le double-clic', async () => {
    vi.useFakeTimers();
    try {
      await monter();
      await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      // Rien n'a encore bougé : le geste peut encore devenir un double-clic.
      expect(ligneDe('devis-artisan.pdf')).toBeUndefined();
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(ligneDe('devis-artisan.pdf')).toBeDefined();
    } finally { vi.useRealTimers(); }
  });

  /** 🔴 ET LE DOUBLE-CLIC L'EMPORTE : il annule le dépliage que son premier temps avait armé, et ENTRE. */
  it('🔴 un double-clic entre dans le dossier, sans laisser le dépliage se déclencher après coup', async () => {
    vi.useFakeTimers();
    try {
      await monter();
      await act(async () => {
        const l = ligneDe('Artisans');
        l?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        l?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      // On est DANS « Artisans » : son contenu est à la racine de la vue, sans indentation.
      const ligne = ligneDe('devis-artisan.pdf') as HTMLElement | undefined;
      expect(ligne).toBeDefined();
      expect(ligne?.style.paddingLeft).toBe('6px');
      expect([...container.querySelectorAll('.sfd-ariane-bouton')].map((b) => b.textContent))
        .toEqual(['Google Drive', 'Artisans']);
    } finally { vi.useRealTimers(); }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LE REFUS DU DOSSIER PROTÉGÉ, EN MODE RANGER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ le refus quand la cible est dans l’archive', () => {
  beforeEach(() => {
    reponseDepot = {
      statut: 403,
      corps: {
        etat: 'cible_invalide',
        message: '« Documents clients scannés » est l’archive du cabinet : l’application n’y dépose aucune pièce.',
      },
    };
  });

  it('le motif est AFFICHÉ, et la pièce n’est pas marquée rangée', async () => {
    await monter();
    await glisserPiece('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    expect(container.textContent).toContain('Documents clients scannés');
    expect(pieceDe('DEV-20260928-18919.pdf')?.textContent).not.toContain('✓ Rangée');
    expect(container.querySelector('.sfd-ranger-titre')?.textContent).toBe('2 pièces à ranger');
    // 🔴 ET L'ÉCRAN DU MESSAGE N'EST PAS PRÉVENU : il n'y a rien de nouveau dans le Drive.
    expect(rangements).toBe(0);
  });

  /** ⚠️ MÊME REFUS PAR « Déposer ici » : deux voies vers le même serveur, donc le même mur. */
  it('par « Déposer ici » aussi', async () => {
    await monter();
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    await cliquer([...container.querySelectorAll('.sfd-pied button')]
      .find((b) => (b.textContent ?? '').startsWith('Déposer ici')));
    expect(container.textContent).toContain('Documents clients scannés');
    expect(container.querySelector('.sfd-ranger-titre')?.textContent).toBe('2 pièces à ranger');
  });

  /** 🔴 UN ÉCHEC PIÈCE PAR PIÈCE SE DIT AUSSI : la route peut répondre « ok » et refuser UNE pièce. */
  it('un échec pièce par pièce est dit, avec son motif', async () => {
    reponseDepot = {
      statut: 200,
      corps: {
        etat: 'ok',
        resultats: [{ pieceId: 11, nomFichier: 'x', etat: 'echec', motif: 'Fichier trop volumineux.' }],
      },
    };
    await monter();
    await glisserPiece('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    expect(container.textContent).toContain('Fichier trop volumineux');
    expect(pieceDe('DEV-20260928-18919.pdf')?.textContent).not.toContain('✓ Rangée');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ CE QUE LE MODE RANGER N'A PAS — et ne doit pas avoir
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ce que le mode RANGER ne propose pas', () => {
  /**
   * ⚠️ LA ZONE « Pièces jointes » DU PIED N'A DE SENS QU'EN MODE JOINDRE : il n'y a pas de message à remplir quand
   * on range un mail reçu. La laisser promettrait un geste qui n'existe pas.
   */
  it('aucune zone de dépôt « Pièces jointes » : il n’y a pas de message à remplir', async () => {
    await monter();
    expect(container.querySelector('.sfd-depot')).toBeNull();
  });

  it('aucun compteur de pièces ajoutées : on pose, on ne prend pas', async () => {
    await monter();
    expect(container.querySelector('.sfd-compteur')?.textContent).not.toContain('ajoutée');
  });
});
