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
  /**
   * 🔴 ON VIDE LA MÉMOIRE DE SESSION ENTRE DEUX TESTS (lot DRIVE-RETOUCHES-2). Les dossiers dépliés y sont
   * désormais retenus, d'une ouverture de la fenêtre à l'autre : sans ce nettoyage, un test hériterait de
   * l'arbre du précédent et ne prouverait plus ce qu'il croit prouver — un triangle « déplierait » un dossier
   * déjà ouvert, donc le refermerait.
   */
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide, ce qui convient */ }
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

/**
 * ══ 🔴🔴 LE GLISSER TEL QUE LE NAVIGATEUR LE FAIT — PAS TEL QU'IL NOUS ARRANGE ═══════════════════════════════════
 *
 * `glisserPiece` ci-dessus saute le `dragover` et lâche directement. C'est commode, et c'est précisément ce qui a
 * laissé passer le défaut du 29/09/2026 : la fenêtre passait tous ses tests, et GLISSER NE FAISAIT RIEN sur le
 * vrai Drive, sans un mot.
 *
 * CE QUE CE GESTE-CI IMPOSE, et que le navigateur impose vraiment :
 *   ① le `drop` n'arrive QUE si le dernier `dragover` a été annulé (`preventDefault`) — c'est la règle connue ;
 *   ② 🔴 ET SI LE `dropEffect` CHOISI EST PERMIS PAR L'`effectAllowed` POSÉ AU `dragstart`. Sinon l'opération vaut
 *      « none » : Chrome montre le curseur « interdit », CESSE d'émettre `dragover`, et n'émet JAMAIS `drop`.
 *
 * Relevé dans Chrome, sur le vrai Drive, en instrumentant les événements :
 *     dragstart  allowed=copy  effect=none
 *     dragover   allowed=copy  effect=move  prevented=true   ← puis plus AUCUN dragover, et aucun drop
 *
 * Une pièce se RANGE (on la copie dans le Drive, le mail garde la sienne) : `effectAllowed` vaut donc `copy`, et
 * demander `move` était une contradiction que seul le navigateur voyait.
 */
const EFFETS_PERMIS: Record<string, readonly string[]> = {
  copy: ['copy'], move: ['move'], link: ['link'],
  copyMove: ['copy', 'move'], copyLink: ['copy', 'link'], linkMove: ['link', 'move'],
  all: ['copy', 'move', 'link'], uninitialized: ['copy', 'move', 'link'], '': ['copy', 'move', 'link'],
};
async function glisserVraiment(nom: string, cible: Element | null | undefined): Promise<{
  entreeAcceptee: boolean; survolAccepte: boolean; effetPermis: boolean;
}> {
  const t = await glisser('dragstart', pieceDe(nom));
  const jouer = async (type: 'dragenter' | 'dragover') => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: t });
    Object.defineProperty(e, 'altKey', { value: false });
    await act(async () => { (cible as HTMLElement | undefined)?.dispatchEvent(e); });
    await calmer();
    return e.defaultPrevented;
  };
  /**
   * 🔴 L'ENTRÉE D'ABORD, LE SURVOL ENSUITE — l'ordre du navigateur. Et l'entrée DOIT être annulée : une cible
   * déjà établie est PERDUE dès qu'on passe sur un élément dont le `dragenter` ne l'est pas, et Chrome cesse
   * alors d'émettre `dragover`. Le premier `dragover` d'un glisser passe quand même (il n'y a encore aucune
   * cible à perdre) : c'est exactement ce qui rendait le défaut du 29/09/2026 si trompeur.
   */
  const entreeAcceptee = await jouer('dragenter');
  const survolAccepte = await jouer('dragover');
  const permis = EFFETS_PERMIS[t.effectAllowed] ?? ['copy', 'move', 'link'];
  const effetPermis = t.dropEffect === '' || t.dropEffect === 'none' || permis.includes(t.dropEffect);
  // 🔴 LE NAVIGATEUR N'ÉMET `drop` QUE SI LES TROIS CONDITIONS TIENNENT. On ne triche pas ici non plus.
  if (entreeAcceptee && survolAccepte && effetPermis) await glisser('drop', cible, t);
  return { entreeAcceptee, survolAccepte, effetPermis };
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

  /**
   * ══ 🔴 RÉÉCRIT (lot RANGER-ARBRE-2) — LE TRANSFERT PORTE UNE LISTE, ET NON UNE PIÈCE ══════════════════════
   *
   * La charge était `{ pieceId, nom }` : UNE pièce, parce qu'on n'en glissait qu'une. Arno a demandé la
   * sélection multiple (« glisser l'une des pièces sélectionnées emporte toute la sélection »), et une charge
   * qui ne sait nommer qu'une pièce ne peut pas en porter quatre.
   *
   * CE QUE CETTE ÉPREUVE PROTÉGEAIT N'A PAS BOUGÉ, et c'est le plus important : le transfert ne porte QUE notre
   * type MIME. Pas de `text/plain`, pas de `text/uri-list` — un nom de document du cabinet lâché dans le champ
   * de recherche d'un autre onglet serait une fuite que personne ne verrait passer.
   * ⚠️ LE NOM A DISPARU DE LA CHARGE, exprès : l'identifiant suffit à retrouver la pièce dans l'état de la
   * fenêtre, et ce qui ne voyage pas ne peut pas fuir.
   */
  it('chaque pièce est saisissable, et ne porte QUE notre type MIME', async () => {
    await monter();
    expect(pieceDe('photo.jpg')?.getAttribute('draggable')).toBe('true');
    const t = await glisser('dragstart', pieceDe('photo.jpg'));
    expect(Object.keys(t.poses)).toEqual([MIME_PIECE]);
    expect(JSON.parse(t.poses[MIME_PIECE])).toEqual({ pieceIds: [12] });
    expect(t.poses[MIME_PIECE]).not.toContain('photo.jpg');
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
   🔴🔴 ②-bis LE GLISSER TEL QUE CHROME LE FAIT — le défaut du 29/09/2026
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ②-bis glisser une pièce : l’effet demandé doit être PERMIS', () => {
  /**
   * 🔴 LE DÉFAUT D'ARNO, REPRODUIT : « glisser une pièce du panneau “N pièce(s) à ranger” vers un dossier ne fait
   * rien ». Ni message, ni trace, ni erreur. Sur le vrai Drive, dans Chrome, en instrumentant les événements :
   *
   *     dragstart  allowed=copy  effect=none
   *     dragover   allowed=copy  effect=move  prevented=true   ← puis plus aucun dragover, et aucun drop
   *
   * `survolerCible` posait `dropEffect = altKey ? 'copy' : 'move'` — la règle du DÉPLACEMENT d'un fichier du
   * Drive, où `effectAllowed` vaut `copyMove`. Appliquée à une PIÈCE, dont le glisser est déclaré `copy`, elle
   * demande un effet interdit : l'opération vaut « none », et le navigateur refuse tout.
   *
   * ⚠️ POURQUOI AUCUN TEST NE LE VOYAIT : tous lâchaient la pièce sans passer par `dragover`. Le contrat du
   * navigateur n'était donc jamais joué.
   */
  it('🔴 le survol est accepté ET l’effet est permis — sur un dossier de l’arbre', async () => {
    await monter();
    const r = await glisserVraiment('DEV-20260928-18919.pdf', ligneDe('Artisans'));
    expect(r.entreeAcceptee).toBe(true);
    expect(r.survolAccepte).toBe(true);
    expect(r.effetPermis).toBe(true);
    expect(depots).toEqual([{ pieceId: '11', dossierId: 'd1' }]);
  });

  /** 🔴 ET SUR TOUTES LES AUTRES CIBLES : elles passent par le même `survolerCible`, elles ont le même contrat. */
  it('🔴 sur la barre latérale — dernier dossier, et dossier récent', async () => {
    await monter();
    const a = await glisserVraiment('photo.jpg', lateraleDe(/CHARPENTIER/));
    expect([a.entreeAcceptee, a.survolAccepte, a.effetPermis]).toEqual([true, true, true]);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'D_DERNIER' }]);
    depots = [];
    const b = await glisserVraiment('DEV-20260928-18919.pdf', lateraleDe(/Travaux/));
    expect([b.entreeAcceptee, b.survolAccepte, b.effetPermis]).toEqual([true, true, true]);
    expect(depots).toEqual([{ pieceId: '11', dossierId: 'D_REC' }]);
  });

  it('🔴 sur un parent du BANDEAU', async () => {
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    await act(async () => { ligneDe('Artisans')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await calmer();
    const pas = [...container.querySelectorAll('.sfd-ariane-bouton')].find((b) => b.textContent === 'Artisans');
    const r = await glisserVraiment('photo.jpg', pas);
    expect([r.entreeAcceptee, r.survolAccepte, r.effetPermis]).toEqual([true, true, true]);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
  });

  /**
   * ⚠️ ET LE DÉPLACEMENT D'UN FICHIER DU DRIVE GARDE SON EFFET « move » : c'est un déplacement, pas une copie, et
   * son `effectAllowed` (`copyMove`) le permet. Corriger l'un ne doit pas casser l'autre.
   */
  it('🔴 un fichier du Drive, lui, se DÉPLACE — et son effet reste permis', async () => {
    await monter();
    // Il faut d'abord déplier « Artisans » pour que son contenu existe à l'écran : on ne glisse que ce qu'on voit.
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    const t = await glisser('dragstart', ligneDe('devis-artisan.pdf'));
    const entree = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(entree, 'dataTransfer', { value: t });
    Object.defineProperty(entree, 'altKey', { value: false });
    await act(async () => { (ligneDe('Baux') as HTMLElement).dispatchEvent(entree); });
    await calmer();
    const survol = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(survol, 'dataTransfer', { value: t });
    Object.defineProperty(survol, 'altKey', { value: false });
    await act(async () => { (ligneDe('Baux') as HTMLElement).dispatchEvent(survol); });
    await calmer();
    expect(entree.defaultPrevented).toBe(true);
    expect(survol.defaultPrevented).toBe(true);
    expect(t.effectAllowed).toBe('copyMove');
    expect(t.dropEffect).toBe('move');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ②-ter UN DOSSIER RESTÉ OUVERT DOIT MONTRER SON CONTENU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ②-ter l’arbre retrouvé : ouvert VEUT DIRE ouvert', () => {
  /**
   * 🔴 LE DÉFAUT, TROUVÉ EN CHERCHANT LE PREMIER (29/09/2026). Les dossiers dépliés sont retenus d'une ouverture
   * de la fenêtre à l'autre (`sessionStorage`, lot DRIVE-RETOUCHES-2). Mais SEUL L'ÉTAT était retenu : le CONTENU,
   * lui, n'était relu par personne. La fenêtre se rouvrait donc avec des dossiers marqués ouverts — triangle ▾,
   * `aria-expanded="true"` — et RIEN dessous.
   *
   * CE QUE ÇA DONNAIT À L'ÉCRAN : impossible d'atteindre le dossier voulu. Un clic sur le triangle le REFERMAIT
   * (il se croyait ouvert), il fallait cliquer une seconde fois pour qu'il se charge enfin. Vu en vrai en
   * cherchant à atteindre « _TEST CLAUDE rangement2 » : trois tentatives, aucun message, aucune erreur.
   *
   * 🔴 ET C'EST GRAVE ICI PLUS QU'AILLEURS : dans cette fenêtre, un dossier qu'on ne peut pas VOIR est un dossier
   * sur lequel on ne peut pas DÉPOSER. Le rangement d'une pièce s'arrête là, sans rien dire.
   */
  it('🔴 un dossier retenu comme ouvert affiche son contenu, SANS qu’on y touche', async () => {
    globalThis.sessionStorage.setItem('svv.gestion.selecteurDrive.deplies', JSON.stringify(['d1']));
    await monter();
    const tri = ligneDe('Artisans')?.querySelector('.sfd-triangle');
    expect(tri?.getAttribute('aria-expanded')).toBe('true');
    // 🔴 CE QUI MANQUAIT : le contenu. Un triangle ouvert sur un dossier vide est un mensonge.
    expect(ligneDe('devis-artisan.pdf')).toBeDefined();
  });

  /** ⚠️ ET LE PREMIER CLIC SUR LE TRIANGLE REFERME, comme il doit : c'est bien ouvert, donc il ferme. */
  it('🔴 et le premier clic sur son triangle le REFERME — une fois, pas deux', async () => {
    globalThis.sessionStorage.setItem('svv.gestion.selecteurDrive.deplies', JSON.stringify(['d1']));
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    expect(ligneDe('devis-artisan.pdf')).toBeUndefined();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    expect(ligneDe('devis-artisan.pdf')).toBeDefined();
  });

  /** ⚠️ UN IDENTIFIANT RETENU QUI N'EXISTE PLUS ne casse rien : le Drive a bougé entre deux ouvertures. */
  it('un dossier retenu qui n’existe plus est simplement ignoré', async () => {
    globalThis.sessionStorage.setItem('svv.gestion.selecteurDrive.deplies', JSON.stringify(['disparu', 'd1']));
    await monter();
    expect(ligneDe('devis-artisan.pdf')).toBeDefined();
    expect(container.querySelector('.sfd')).not.toBeNull();
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
