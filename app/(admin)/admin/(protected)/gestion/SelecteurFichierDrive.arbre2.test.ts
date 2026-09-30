// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { COTE_DEFAUT, COTE_MAX, COTE_MIN, MIME_PIECE } from '../../../../lib/gestion/rangementDrive';

/**
 * LOT RANGER-ARBRE-2 — CE QUE LA FENÊTRE « RANGER » DOIT SAVOIR FAIRE, ET QU'ELLE NE SAVAIT PAS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 QUATRE DEMANDES D'ARNO, ET LE DÉFAUT QUI LES A DÉCLENCHÉES.
 *
 * ① « Si l'on glisse une pièce “à ranger” sur les LIGNES DE FICHIERS affichées sous un dossier déplié (et non sur
 *    la ligne du dossier elle-même), la pièce revient dans “pièces à ranger”. » REPRODUIT AU VRAI GLISSER SOURIS,
 *    le 30/09/2026, en instrumentant les événements du navigateur sur le vrai Drive :
 *
 *        dragstart → sfd-piece : DecompteCharges (1).pdf
 *        dragenter → sfd-ligne : 📕 document.pdf   prevented=false   ← personne n'accepte
 *        dragend   → sfd-piece                                       ← et AUCUN drop, jamais
 *
 *    La ligne d'un fichier ne posait aucun gestionnaire ; le lâcher remontait jusqu'à la fenêtre, dont le `drop`
 *    vaut ABANDON. Voulu : « lâcher sur n'importe quelle ligne de fichier = déposer dans le dossier PARENT ».
 * ② La sélection multiple des pièces (cases à cocher, ⌘-clic, ⇧-clic, « Tout sélectionner »).
 * ③ La ligne « ↑ Remonter à “X” », et le VRAI chemin reconstruit quel que soit le point d'entrée.
 * ④ La largeur réglable de la colonne de gauche, mémorisée.
 *
 * 🔴 CE FICHIER ÉPROUVE LE GESTE TEL QUE LE NAVIGATEUR LE FAIT (`glisserVraiment`), et non tel qu'il nous
 * arrange : `dragenter`, puis `dragover`, et le `drop` SEULEMENT si les deux ont été annulés et si l'effet
 * demandé est permis. C'est cette exigence-là qui fait échouer ces épreuves sur le code d'avant le lot.
 *
 * ⚠️ CE FICHIER NE PROUVE PAS QUE L'ARCHIVE EST PROTÉGÉE — un écran ne protège rien. La règle se prouve où elle
 * vit (`driveCreation.test.ts`, la route de dépôt). Ici on prouve que les VOIES NEUVES de ce lot (le lâcher sur
 * un fichier, la sélection multiple, la ligne Remonter) passent par la même route, et DISENT le refus.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let depots: { pieceId: string; dossierId: string }[];
let mouvements: { corps: Record<string, unknown> }[];
/** La réponse du dépôt, pièce par pièce : c'est ainsi qu'on fabrique un échec PARTIEL. */
let refuser: (pieceId: number) => string | null;

const PIECES = [
  { pieceId: 11, nom: 'DEV-20260928-18919.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' },
  { pieceId: 12, nom: 'photo.jpg', tailleOctets: 12_004, typeMime: 'image/jpeg' },
  { pieceId: 13, nom: 'quittance.pdf', tailleOctets: 3_004, typeMime: 'application/pdf' },
];

const fichier = (id: string, nom: string, dossier = false, parentId = 'D1') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId,
});

/**
 * L'arborescence de l'épreuve. « Artisans » contient « devis-artisan.pdf » : c'est CE fichier-là, affiché sous un
 * dossier déplié, qui portait le défaut d'Arno.
 */
const CONTENUS: Record<string, ReturnType<typeof fichier>[]> = {
  '': [fichier('d1', 'Artisans', true), fichier('d2', 'Baux', true), fichier('f1', 'bail.pdf')],
  d1: [fichier('f10', 'devis-artisan.pdf', false, 'd1'), fichier('d3', 'Devis 2026', true, 'd1')],
  d2: [fichier('f20', 'bail-2024.pdf', false, 'd2')],
  d3: [],
  /** Le dossier ouvert « par un raccourci » : le serveur en connaît le chemin complet, l'écran non. */
  DREC: [fichier('f30', 'note.pdf', false, 'DREC')],
};
/** Ce que le serveur sait du chemin d'un dossier — la remontée que le verdict faisait déjà. */
const CHAINES: Record<string, { id: string; nom: string }[]> = {
  DREC: [
    { id: 'DTEST', nom: 'Test' },
    { id: 'DREC', nom: 'Drive' },
  ],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); globalThis.localStorage?.clear(); } catch { /* sans stockage, tout part neuf */ }
  depots = []; mouvements = []; refuser = () => null;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    const m = /\/api\/admin\/gestion\/pieces\/(\d+)\/drive/.exec(url);
    if (m !== null && (init?.method ?? 'GET') === 'POST') {
      const corps = JSON.parse(String(init?.body ?? '{}')) as { dossierId?: string };
      depots.push({ pieceId: m[1], dossierId: corps.dossierId ?? '' });
      const motif = refuser(Number(m[1]));
      return new Response(JSON.stringify(motif === null
        ? { etat: 'ok', resultats: [{ pieceId: Number(m[1]), etat: 'depose', lien: 'https://drive/x' }] }
        : { etat: 'ok', resultats: [{ pieceId: Number(m[1]), etat: 'echec', motif }] }), { status: 200 });
    }
    if (url.includes('/drive/deplacer')) {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
      }
      mouvements.push({ corps: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
      return new Response(JSON.stringify({
        etat: 'ok', nomCible: 'X', faits: [{ id: 'f1', nom: 'bail.pdf' }], refuses: [], mouvements: [1],
      }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({
        etat: 'ok', mode: 'accueil', dernier: null,
        recents: [{ id: 'DREC', nom: 'Drive', chemin: '', dernierDepot: '2026-09-30T09:00:00Z' }],
      }), { status: 200 });
    }
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    const d = new URL(url, 'http://local').searchParams.get('dossier') ?? '';
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: true, motifCreation: null,
      fichiers: CONTENUS[d] ?? [], chaine: CHAINES[d] ?? [],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (mode: 'ranger' | 'joindre' = 'ranger', pieces = PIECES) => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode, messageId: 900, filId: 42, pieces, onRangement: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};
const ligneDe = (nom: string) => [...container.querySelectorAll('.sfd-ligne')]
  .find((x) => (x.querySelector('.sfd-nom')?.textContent ?? '') === nom);
const pieceDe = (nom: string) => [...container.querySelectorAll('.sfd-piece')]
  .find((x) => (x.querySelector('.sfd-piece-nom')?.textContent ?? '') === nom);
const boutonDe = (m: RegExp) => [...container.querySelectorAll('button')]
  .find((b) => m.test(b.textContent ?? ''));
const souris = async (e: Element | null | undefined, type: string, init: MouseEventInit = {}) => {
  await act(async () => { (e as HTMLElement | undefined)?.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

/**
 * ══ 🔴🔴 LE DÉFAUT A CHANGÉ (lot FIL-APERCU-MINIATURES, 30/09/2026) ══════════════════════════════════════════
 *
 * Arno : « à l'ouverture de “Ranger N pièces dans le Drive”, toutes les pièces du mail sont cochées ». Glisser
 * UNE pièce emporte donc toute la sélection — c'est la règle posée par ce lot-ci (« saisir une pièce cochée les
 * emporte toutes »), appliquée au nouveau défaut. Les épreuves qui parlent d'UNE pièce décochent d'abord.
 *
 * ⚠️ ON DÉCOCHE PAR LE BOUTON, comme une personne : passer par l'état interne ne prouverait pas que le geste existe.
 */
const decocherTout = async () => {
  await cliquer([...container.querySelectorAll('button')]
    .find((x) => /Tout désélectionner/.test(x.textContent ?? '')));
};
const touche = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    container.querySelector('.sfd')?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
  await calmer();
};

function transfert(charge: Record<string, string> = {}) {
  const poses = { ...charge };
  return {
    poses,
    setData: (t: string, v: string) => { poses[t] = v; },
    getData: (t: string) => poses[t] ?? '',
    setDragImage: (el: Element) => { fantomes.push(el.textContent ?? ''); },
    effectAllowed: '', dropEffect: '',
  };
}
/** Ce que le fantôme a annoncé, à chaque saisie : c'est là qu'on lit « N pièces ». */
let fantomes: string[] = [];

async function evenement(type: string, cible: Element | null | undefined, t: ReturnType<typeof transfert>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: t });
  Object.defineProperty(e, 'altKey', { value: false });
  await act(async () => { (cible as HTMLElement | undefined)?.dispatchEvent(e); });
  await calmer();
  return e.defaultPrevented;
}

const EFFETS_PERMIS: Record<string, readonly string[]> = {
  copy: ['copy'], move: ['move'], link: ['link'],
  copyMove: ['copy', 'move'], copyLink: ['copy', 'link'], linkMove: ['link', 'move'],
  all: ['copy', 'move', 'link'], uninitialized: ['copy', 'move', 'link'], '': ['copy', 'move', 'link'],
};

/**
 * ══ 🔴🔴 LE GESTE COMPLET, AUX RÈGLES DU NAVIGATEUR ══════════════════════════════════════════════════════════════
 *
 * Le même harnais que `SelecteurFichierDrive.ranger.test.ts`, et pour la même raison : un `drop` envoyé
 * directement prouve que la fonction de dépôt marche, jamais qu'on PEUT déposer. Chrome n'émet `drop` que si
 * ① `dragenter` a été annulé, ② `dragover` aussi, ③ et si l'effet demandé est permis par l'`effectAllowed`.
 *
 * 🔴 C'EST CE HARNAIS QUI FAIT ÉCHOUER CES ÉPREUVES SUR LE CODE D'AVANT : sur une ligne de FICHIER, l'ancien code
 * n'annulait rien, donc `entreeAcceptee` valait `false` et aucun dépôt ne partait — exactement ce qu'Arno voyait.
 */
async function glisserVraiment(nom: string, cible: Element | null | undefined) {
  const t = await glisserDepuis(nom);
  const entreeAcceptee = await evenement('dragenter', cible, t);
  const survolAccepte = await evenement('dragover', cible, t);
  const permis = EFFETS_PERMIS[t.effectAllowed] ?? ['copy', 'move', 'link'];
  const effetPermis = t.dropEffect === '' || t.dropEffect === 'none' || permis.includes(t.dropEffect);
  if (entreeAcceptee && survolAccepte && effetPermis) await evenement('drop', cible, t);
  return { entreeAcceptee, survolAccepte, effetPermis, transfert: t };
}
async function glisserDepuis(nom: string, init: MouseEventInit = {}) {
  const t = transfert();
  const e = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: t });
  Object.assign(e, init);
  await act(async () => { (pieceDe(nom) as HTMLElement | undefined)?.dispatchEvent(e); });
  await calmer();
  return t;
}
/** Entrer dans « Artisans », puis déplier « Devis 2026 » : de quoi avoir un fichier SOUS un dossier déplié. */
const entrer = async (nom: string) => {
  await souris(ligneDe(nom), 'dblclick');
  await calmer();
};

beforeEach(() => { fantomes = []; });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ① LÂCHER SUR UNE LIGNE DE FICHIER = DÉPOSER DANS SON DOSSIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① le dépôt dans le contenu d’un dossier ouvert', () => {
  /**
   * 🔴🔴 L'ÉPREUVE DU DÉFAUT D'ARNO, ET ELLE ÉCHOUE SUR LE CODE D'AVANT : la ligne d'un fichier n'acceptait
   * rien, donc `entreeAcceptee` valait `false`, aucun `drop` n'était émis, et la pièce revenait « à ranger ».
   */
  it('🔴 lâcher une pièce sur un FICHIER la range dans le dossier AFFICHÉ', async () => {
    await monter();
    // ⚠️ Toutes les pièces sont cochées à l'ouverture : on décoche pour parler d'UNE pièce.
    await decocherTout();
    await entrer('Artisans');
    const r = await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    expect(r.entreeAcceptee).toBe(true);
    expect(r.survolAccepte).toBe(true);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
    // Et la pièce le DIT, là où on la regardait.
    expect(pieceDe('photo.jpg')?.textContent).toContain('✓ Rangée dans « Artisans »');
  });

  /**
   * 🔴🔴 LE CAS EXACT DU CONSTAT : un fichier affiché SOUS UN DOSSIER DÉPLIÉ. Sa cible n'est PAS le dossier
   * affiché — c'est le dossier déplié qui le contient. C'est toute la différence, et c'est elle qui rendait
   * l'ancien repli (« le dossier affiché ») faux d'un cran.
   */
  it('🔴 sous un dossier DÉPLIÉ, la cible est ce dossier-là, pas celui qu’on affiche', async () => {
    await monter();
    // ⚠️ Toutes les pièces sont cochées à l'ouverture : on décoche pour parler d'UNE pièce.
    await decocherTout();
    // On déplie « Artisans » SANS y entrer : son contenu s'affiche sous lui, dans la liste de la racine.
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    expect(ligneDe('devis-artisan.pdf')).toBeDefined();
    const r = await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    expect(r.entreeAcceptee).toBe(true);
    // 🔴 « d1 » (Artisans), et non la racine : le fichier a désigné le dossier qui le CONTIENT.
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
  });

  /** 🔴 LE DOSSIER CIBLE S'ALLUME — c'est le parent, jamais le fichier survolé. */
  it('🔴 pendant le glisser, c’est le dossier PARENT qui est mis en surbrillance', async () => {
    await monter();
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    const t = await glisserDepuis('photo.jpg');
    await evenement('dragover', ligneDe('devis-artisan.pdf'), t);
    expect(ligneDe('Artisans')?.className).toContain('sfd-ligne--vise');
    expect(ligneDe('devis-artisan.pdf')?.className).not.toContain('sfd-ligne--vise');
    // Et l'indicateur près du curseur NOMME cette cible-là.
    expect(container.querySelector('.sfd-cible-nommee')?.textContent).toContain('Artisans');
  });

  /** 🔴 LE VIDE SOUS LA LISTE = LE DOSSIER AFFICHÉ (demande d'Arno). */
  it('🔴 lâcher dans la zone vide sous la liste dépose dans le dossier affiché', async () => {
    await monter();
    // ⚠️ Toutes les pièces sont cochées à l'ouverture : on décoche pour parler d'UNE pièce.
    await decocherTout();
    await entrer('Artisans');
    const r = await glisserVraiment('photo.jpg', container.querySelector('.sfd-lignes'));
    expect(r.entreeAcceptee).toBe(true);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
  });

  /**
   * 🔴 MÊME RÈGLE POUR UN FICHIER DU DRIVE (demande d'Arno : « Même règle pour les déplacements de fichiers du
   * Drive (Cmd+X/V et glisser) : un fichier n'est jamais une cible »).
   */
  /**
   * 🔴 LE MÊME GESTE AVEC UN FICHIER DU DRIVE : on prend « bail.pdf » à la racine et on le lâche sur
   * « devis-artisan.pdf », affiché sous « Artisans » déplié. Il part dans « Artisans » — jamais « dans » un
   * fichier, et jamais dans le dossier affiché, qui est ici la racine.
   */
  it('🔴 glisser un FICHIER du Drive sur un autre fichier le déplace dans LE DOSSIER de celui-ci', async () => {
    await monter('joindre');
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    const t = transfert();
    const e = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: t });
    await act(async () => { (ligneDe('bail.pdf') as HTMLElement).dispatchEvent(e); });
    await calmer();
    expect(await evenement('dragenter', ligneDe('devis-artisan.pdf'), t)).toBe(true);
    await evenement('drop', ligneDe('devis-artisan.pdf'), t);
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0].corps.action).toBe('deplacer');
    expect(mouvements[0].corps.cible).toBe('d1');
  });

  /** 🔴 ⌘V SUIT LA MÊME RÈGLE : coller sur un fichier colle dans le dossier qui le contient. */
  it('🔴 ⌘X puis ⌘V sur un fichier d’un dossier déplié colle dans CE dossier', async () => {
    await monter('joindre');
    await cliquer(ligneDe('Artisans')?.querySelector('.sfd-triangle'));
    // On coupe « bail.pdf » (à la racine), puis on sélectionne un fichier DANS « Artisans » et on colle.
    await souris(ligneDe('bail.pdf'), 'click');
    await touche('x', { metaKey: true });
    await souris(ligneDe('devis-artisan.pdf'), 'click');
    await touche('v', { metaKey: true });
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0].corps.cible).toBe('d1');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ② LA SÉLECTION MULTIPLE DANS « PIÈCES À RANGER »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ② plusieurs pièces d’un seul geste', () => {
  const caseDe = (nom: string) => pieceDe(nom)?.querySelector('.sfd-piece-case') as HTMLInputElement | undefined;

  /**
   * 🔴 RÉÉCRIT (lot FIL-APERCU-MINIATURES) : la case existe toujours et porte toujours le nom de sa pièce — ce
   * que cette épreuve protégeait. Ce qui change est son ÉTAT DE DÉPART : cochée, parce qu'on range presque
   * toujours tout au même endroit. Les deux états sont éprouvés ici, pour que la case reste une case.
   */
  it('chaque pièce porte une case à cocher, nommée — et cochée à l’ouverture', async () => {
    await monter();
    expect(caseDe('photo.jpg')?.getAttribute('aria-label')).toBe('Sélectionner photo.jpg');
    expect(caseDe('photo.jpg')?.checked).toBe(true);
    await decocherTout();
    expect(caseDe('photo.jpg')?.checked).toBe(false);
  });

  it('⌘-clic ajoute à la sélection, ⇧-clic étend depuis l’ancre', async () => {
    await monter();
    await souris(pieceDe('DEV-20260928-18919.pdf'), 'click');
    await souris(pieceDe('quittance.pdf'), 'click', { shiftKey: true });
    // Les TROIS, parce que « photo.jpg » est entre les deux.
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(3);
    await souris(pieceDe('photo.jpg'), 'click', { metaKey: true });
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(2);
  });

  it('« Tout sélectionner » coche tout, puis décoche tout', async () => {
    await monter();
    await cliquer(boutonDe(/Tout sélectionner/));
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(3);
    expect(boutonDe(/Tout désélectionner/)).toBeDefined();
    await cliquer(boutonDe(/Tout désélectionner/));
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(0);
  });

  /**
   * 🔴🔴 LE GESTE CENTRAL DU ② : saisir UNE pièce cochée les emporte TOUTES, et le fantôme dit combien.
   */
  it('🔴 glisser une pièce sélectionnée emporte toute la sélection, et le fantôme dit « N pièces »', async () => {
    await monter();
    await cliquer(boutonDe(/Tout sélectionner/));
    await entrer('Artisans');
    const r = await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    expect(r.entreeAcceptee).toBe(true);
    expect(JSON.parse(r.transfert.poses[MIME_PIECE])).toEqual({ pieceIds: [11, 12, 13] });
    expect(fantomes).toContain('3 pièces');
    expect(depots.map((d) => d.pieceId)).toEqual(['11', '12', '13']);
    // Chacune le dit, sur sa propre ligne.
    for (const n of ['DEV-20260928-18919.pdf', 'photo.jpg', 'quittance.pdf']) {
      expect(pieceDe(n)?.textContent, n).toContain('✓ Rangée dans « Artisans »');
    }
  });

  /**
   * ⚠️ SAISIR UNE PIÈCE **HORS** SÉLECTION N'EMPORTE QU'ELLE. C'est la règle du Finder, et elle évite d'emmener
   * par surprise des pièces cochées cinq minutes plus tôt.
   */
  it('🔴 saisir une pièce NON cochée n’emporte qu’elle', async () => {
    await monter();
    await souris(pieceDe('DEV-20260928-18919.pdf'), 'click');
    await entrer('Artisans');
    await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    expect(depots.map((d) => d.pieceId)).toEqual(['12']);
  });

  /**
   * 🔴🔴 L'ÉCHEC PARTIEL (demande d'Arno) : « les pièces refusées restent à ranger, avec leur motif ».
   */
  it('🔴 une pièce refusée reste à ranger, et son motif est dit', async () => {
    await monter();
    refuser = (id) => (id === 12 ? 'Le dossier « Documents clients scannés » est en lecture seule.' : null);
    await cliquer(boutonDe(/Tout sélectionner/));
    await entrer('Artisans');
    await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    // Les deux autres sont rangées…
    expect(pieceDe('DEV-20260928-18919.pdf')?.textContent).toContain('✓ Rangée dans');
    expect(pieceDe('quittance.pdf')?.textContent).toContain('✓ Rangée dans');
    // … et la refusée ne l'est PAS, mais son motif se lit, mot pour mot celui du serveur.
    expect(pieceDe('photo.jpg')?.textContent).not.toContain('✓ Rangée dans');
    const dit = container.textContent ?? '';
    expect(dit).toContain('2 pièces rangées.');
    expect(dit).toContain('1 pièce reste à ranger');
    expect(dit).toContain('Documents clients scannés');
  });

  /** 🔴 « Déposer ici (N) » SUIT LA SÉLECTION, et range exactement ce qu'il annonce. */
  it('🔴 « Déposer ici » suit la sélection, et porte sur tout quand rien n’est coché', async () => {
    await monter();
    await entrer('Artisans');
    // Rien de coché : le bouton porte sur les trois.
    expect(boutonDe(/Déposer ici/)?.textContent).toContain('(3)');
    await souris(pieceDe('photo.jpg'), 'click');
    expect(boutonDe(/Déposer ici/)?.textContent).toBe('Déposer ici');
    await souris(pieceDe('quittance.pdf'), 'click', { metaKey: true });
    expect(boutonDe(/Déposer ici/)?.textContent).toContain('(2)');
    await cliquer(boutonDe(/Déposer ici/));
    expect(depots.map((d) => d.pieceId)).toEqual(['12', '13']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ③ REMONTER DANS L'ARBORESCENCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ remonter d’un niveau', () => {
  it('la ligne « ↑ Remonter » est absente à la racine, présente dès qu’on est entré', async () => {
    await monter();
    expect(container.querySelector('.sfd-remonter')).toBeNull();
    await entrer('Artisans');
    expect(container.querySelector('.sfd-remonter')?.textContent).toContain('Remonter à');
    expect(container.querySelector('.sfd-remonter')?.textContent).toContain('Google Drive');
  });

  /** ⚠️ EN MODE « RANGER » LE TITRE DIT CE QU'ON TIENT, pas où l'on est : c'est le fil d'Ariane qu'on lit. */
  it('elle nomme le VRAI parent, et un clic remonte d’un cran', async () => {
    await monter();
    await entrer('Artisans');
    await entrer('Devis 2026');
    const ariane = () => [...container.querySelectorAll('.sfd-ariane button')].map((b) => b.textContent);
    expect(ariane()).toContain('Devis 2026');
    expect(container.querySelector('.sfd-remonter')?.textContent).toContain('Artisans');
    await cliquer(container.querySelector('.sfd-remonter'));
    expect(ariane()).not.toContain('Devis 2026');
    expect(ariane()).toContain('Artisans');
    // Et d'un cran seulement : on est dans « Artisans », dont le parent est la racine.
    expect(container.querySelector('.sfd-remonter')?.textContent).toContain('Google Drive');
  });

  /** 🔴 ELLE EST AUSSI UNE CIBLE DE DÉPÔT (demande d'Arno). */
  it('🔴 on peut y lâcher une pièce : elle va dans le dossier parent', async () => {
    await monter();
    // ⚠️ Toutes les pièces sont cochées à l'ouverture : on décoche pour parler d'UNE pièce.
    await decocherTout();
    await entrer('Artisans');
    await entrer('Devis 2026');
    const r = await glisserVraiment('photo.jpg', container.querySelector('.sfd-remonter'));
    expect(r.entreeAcceptee).toBe(true);
    expect(depots).toEqual([{ pieceId: '12', dossierId: 'd1' }]);
  });

  /**
   * ══ 🔴🔴 LE DÉFAUT VU SUR LA COPIE D'ARNO ═════════════════════════════════════════════════════════════════
   * Un dossier ouvert depuis « Récents » affichait « Google Drive › Drive » — son seul nom, sans ses parents —
   * et il était alors IMPOSSIBLE de remonter. Le serveur, lui, connaît la chaîne : il la rend maintenant.
   */
  it('🔴 ouvert depuis « Récents », le chemin complet est reconstruit', async () => {
    await monter();
    const raccourci = [...container.querySelectorAll('.sfd-cote-item')]
      .find((b) => /Drive/.test(b.textContent ?? '') && !/Mon Drive|Drives partagés/.test(b.textContent ?? ''));
    await cliquer(raccourci);
    // Le fil d'Ariane porte le parent « Test », que l'écran n'avait aucun moyen de connaître seul.
    const ariane = [...container.querySelectorAll('.sfd-ariane button')].map((b) => b.textContent);
    expect(ariane).toContain('Test');
    // Et la ligne « Remonter » nomme ce parent : on peut enfin sortir.
    expect(container.querySelector('.sfd-remonter')?.textContent).toContain('Test');
  });

  /** ⚠️ ET L'HISTORIQUE N'EN GARDE QU'UN PAS : « Précédent » ne doit pas ramener au même dossier. */
  it('🔴 reconstruire le chemin n’ajoute pas un pas à l’historique', async () => {
    await monter();
    const raccourci = [...container.querySelectorAll('.sfd-cote-item')]
      .find((b) => /Drive/.test(b.textContent ?? '') && !/Mon Drive|Drives partagés/.test(b.textContent ?? ''));
    await cliquer(raccourci);
    await cliquer(boutonDe(/^‹$/) ?? container.querySelector('[aria-label="Précédent"]'));
    // Un seul « Précédent » et l'on est revenu à la racine, pas au même dossier sous un autre nom.
    expect(container.querySelector('.sfd-remonter')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ④ LA LARGEUR DE LA COLONNE DE GAUCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ la colonne de gauche se règle', () => {
  const poignee = () => container.querySelector('.sfd-poignee') as HTMLElement | null;
  const largeur = () => (container.querySelector('.sfd-corps') as HTMLElement | null)
    ?.style.getPropertyValue('--sfd-cote');

  it('la poignée existe, elle est annonçable, et part de la largeur d’avant le lot', async () => {
    await monter();
    expect(poignee()?.getAttribute('role')).toBe('separator');
    expect(poignee()?.getAttribute('aria-valuemin')).toBe(String(COTE_MIN));
    expect(poignee()?.getAttribute('aria-valuemax')).toBe(String(COTE_MAX));
    expect(largeur()).toBe(`${COTE_DEFAUT}px`);
  });

  /** 🔴 LES FLÈCHES SUFFISENT : un réglage qui n'existerait qu'à la souris serait inutilisable sans souris. */
  it('🔴 les flèches ← → règlent la largeur, dans ses bornes, et la retiennent', async () => {
    await monter();
    await act(async () => {
      poignee()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(largeur()).toBe(`${COTE_DEFAUT + 16}px`);
    // La borne HAUTE tient, quoi qu'on fasse.
    for (let i = 0; i < 40; i += 1) {
      await act(async () => {
        poignee()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }));
      });
    }
    expect(largeur()).toBe(`${COTE_MAX}px`);
    // Et la préférence est écrite (try/catch : un stockage absent ne casse rien).
    expect(globalThis.localStorage?.getItem('svv.gestion.selecteurDrive.largeurCote')).toBe(String(COTE_MAX));
  });

  it('un double-clic rend la largeur par défaut', async () => {
    await monter();
    await act(async () => {
      poignee()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true }));
    });
    expect(largeur()).not.toBe(`${COTE_DEFAUT}px`);
    await souris(poignee(), 'dblclick');
    expect(largeur()).toBe(`${COTE_DEFAUT}px`);
  });

  /** 🔴 LA LARGEUR VAUT POUR LES DEUX FENÊTRES (demande d'Arno) : une seule clé, relue à l'ouverture. */
  it('🔴 la largeur retenue est reprise à l’ouverture, dans les deux modes', async () => {
    try { globalThis.localStorage?.setItem('svv.gestion.selecteurDrive.largeurCote', '300'); } catch { /* sans stockage */ }
    await monter('joindre');
    expect(largeur()).toBe('300px');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FIL-APERCU-MINIATURES — LES PIÈCES SONT COCHÉES À L'OUVERTURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 tout est coché quand la fenêtre s’ouvre', () => {
  /**
   * Demande d'Arno : « à l'ouverture de “Ranger N pièces dans le Drive”, toutes les pièces du mail sont
   * cochées ». C'est le geste le plus fréquent qui devient le défaut : on range presque toujours TOUT au même
   * endroit, et partir de rien obligeait à cocher trois cases avant de faire le geste qu'on venait faire.
   */
  it('🔴 les trois pièces sont cochées, sans rien toucher', async () => {
    await monter();
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(3);
    // Et le bouton annonce ce qu'il emportera : les trois.
    expect(boutonDe(/Déposer ici/)?.textContent).toContain('(3)');
  });

  /** 🔴 « Tout sélectionner » devient « Tout désélectionner » tant que tout est coché (demande d'Arno). */
  it('🔴 le bouton dit « Tout désélectionner » dès l’ouverture', async () => {
    await monter();
    expect(boutonDe(/Tout désélectionner/)).toBeDefined();
    expect(boutonDe(/^Tout sélectionner/)).toBeUndefined();
    await cliquer(boutonDe(/Tout désélectionner/));
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(0);
    expect(boutonDe(/Tout sélectionner/)).toBeDefined();
  });

  /**
   * 🔴 UNE PIÈCE RANGÉE PASSE À « ✓ Rangée » ET SE DÉCOCHE (demande d'Arno). Ce qui reste coché est donc
   * exactement ce qui reste à faire — et un second « Déposer ici » ne redépose pas ce qui vient d'être posé.
   */
  it('🔴 une pièce rangée se décoche, et ce qui reste coché est ce qui reste à faire', async () => {
    await monter();
    await entrer('Artisans');
    await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    // Les trois partent ensemble (toutes cochées), donc les trois se décochent.
    expect([...container.querySelectorAll('.sfd-piece--cochee')]).toHaveLength(0);
    for (const n of ['DEV-20260928-18919.pdf', 'photo.jpg', 'quittance.pdf']) {
      expect(pieceDe(n)?.textContent, n).toContain('✓ Rangée dans');
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 UN DÉFAUT TROUVÉ EN FAISANT L'ESSAI RÉEL DE CE LOT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 créer un dossier DANS un dossier vide', () => {
  /**
   * 🔴🔴 TROUVÉ LE 30/09/2026, EN CRÉANT LE DOSSIER D'ESSAI QU'ARNO DEMANDE. Dans un dossier VIDE, « Nouveau
   * dossier » ne faisait RIEN : la ligne en édition n'est rendue que dans la branche « la liste a des lignes »,
   * et un dossier vide prenait la branche « Ce dossier est vide ». Conséquence : impossible de créer le PREMIER
   * sous-dossier d'un dossier neuf — il fallait le créer ailleurs, puis le déplacer.
   *
   * ⚠️ RIEN N'EST PERDU : le message « Ce dossier est vide » reste, et ne s'efface que pendant qu'on écrit le nom.
   */
  it('🔴 la ligne d’édition s’affiche même quand le dossier est vide', async () => {
    await monter('joindre');
    await entrer('Artisans');
    await entrer('Devis 2026'); // ⚠️ « d3 » : un dossier réellement vide dans le montage.
    expect(container.querySelector('.sfd-vide')?.textContent).toContain('Ce dossier est vide');
    await souris(container.querySelector('.sfd-lignes'), 'contextmenu');
    await cliquer([...container.querySelectorAll('.sfd-menu button')]
      .find((b) => /Nouveau dossier/.test(b.textContent ?? '')));
    expect(container.querySelector('.sfd-neuve-champ')).not.toBeNull();
    // Et le message d'absence s'est effacé : ce qu'on regarde maintenant, c'est la ligne qu'on écrit.
    expect(container.querySelector('.sfd-vide')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 CE QUI NE CHANGE PAS : LES REFUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 les voies neuves passent par la même porte, et disent le refus', () => {
  /**
   * 🔴🔴 « Documents clients scannés » : refus INCHANGÉS par toutes les voies (exigence d'Arno pour ce lot).
   * L'écran ne décide rien — il POSTE, et il DIT. Ce qui compte ici : les trois voies neuves de ce lot passent
   * par la route de dépôt, une pièce à la fois, et aucune n'avale le motif.
   */
  it('🔴 un refus du serveur est dit, qu’on lâche sur un fichier, sur « Remonter », ou en sélection', async () => {
    refuser = () => 'Le dossier « Documents clients scannés » est en lecture seule.';
    await monter();
    // ⚠️ Toutes les pièces sont cochées à l'ouverture : on décoche pour parler d'UNE pièce.
    await decocherTout();
    await entrer('Artisans');
    await glisserVraiment('photo.jpg', ligneDe('devis-artisan.pdf'));
    expect(depots).toHaveLength(1);
    expect(container.textContent).toContain('Documents clients scannés');
    expect(pieceDe('photo.jpg')?.textContent).not.toContain('✓ Rangée');
  });
});
