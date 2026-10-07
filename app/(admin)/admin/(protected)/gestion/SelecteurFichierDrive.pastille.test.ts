// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { ecouterPiecesDrive } from '../../../../lib/gestion/signalPieceDrive';
/* ⚠️ LE LIBELLÉ VIENT DE SA SEULE DÉFINITION, jamais recopié ici : voir le cas « nom accessible ». */
import { bulleCompteurRange } from '../../../../lib/gestion/localisationDrive';

/**
 * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA PASTILLE VERTE BOUGE DANS LA SECONDE ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026, fil 36669 / message 57427, « test gigout.pdf ») : « après un glisser-déposer dans
 * Test / Test creation dossier drive (✓ Rangée dans…), la vignette n'affiche pas la pastille verte ».
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE ET REPRODUITE ICI. Le compteur vert est demandé UNE FOIS par vignette, et la clé
 * entre alors dans `comptesDemandes` — un garde-fou nécessaire (sans lui, chaque rendu de la colonne relancerait
 * autant de requêtes qu'elle porte de vignettes) mais DÉFINITIF : une fois la clé dedans, le compteur n'était plus
 * jamais redemandé. La pastille restait donc à la valeur qu'elle avait à l'OUVERTURE de la fenêtre — c'est-à-dire
 * absente (0) pour une pièce qu'on n'avait pas encore rangée.
 *
 * 🔴 CE FICHIER REPRODUIT LE DÉFAUT AVANT DE LE TENIR : il monte la fenêtre pendant que le serveur annonce 0, puis
 * fait le geste d'Arno. Vérifié : en retirant les deux lignes `bougerCompte` / `relireComptes` de `ranger`, la
 * première épreuve retombe sur « aucune pastille » — c'est le défaut, et il est ici dans sa forme exacte.
 *
 * CE QUE CE FICHIER TIENT :
 *   ① avant tout rangement, AUCUNE pastille (un « 0 » vert se lirait comme une bonne nouvelle) ;
 *   ② 🔴🔴 un dépôt → « 1 » TOUT DE SUITE (optimiste), confirmé par la relecture serveur ;
 *   ③ 🔴🔴 deux dépôts du même document, dans deux dossiers → « 2 » ;
 *   ④ 🔴🔴 « Annuler le dernier déplacement » → le compteur SUIT le serveur, et redescend ;
 *   ⑤ 🔴🔴 le mail est prévenu : le signal part avec l'identifiant de la pièce rangée ;
 *   ⑥ ⚠️ un « déjà là » ne compte pas deux fois le même emplacement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Ce que le REGISTRE annonce, pièce par pièce — c'est la seule vérité, et l'écran la redemande. */
let compteDuRegistre: Map<number, number>;
/** Les dépôts reçus par la route : `{pièce, dossier}`. */
let depots: { pieceId: number; dossierId: string }[];
/** L'état que la route du dépôt doit rendre : `depose` d'ordinaire, `deja` pour l'épreuve ⑥. */
let etatDepot: 'depose' | 'deja';
/** Ce que le signal a annoncé aux AUTRES écrans (les cartes du mail, le récapitulatif). */
let signaux: number[][];
let desabonner: () => void;

const PIECE = { pieceId: 11, nom: 'test gigout.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' };

const fichier = (id: string, nom: string, dossier = false, parentId = '') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId,
});

/** Deux dossiers : il en faut DEUX pour que « deux dépôts du même document » fasse bien deux emplacements. */
const CONTENUS: Record<string, ReturnType<typeof fichier>[]> = {
  '': [fichier('d1', 'Test', true), fichier('d2', 'Baux', true), fichier('f1', 'bail.pdf')],
  d1: [fichier('f10', 'deja.pdf', false, 'd1')],
  d2: [],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  compteDuRegistre = new Map();
  depots = [];
  etatDepot = 'depose';
  signaux = [];
  desabonner = ecouterPiecesDrive((s) => { signaux.push([...s.pieceIds]); });

  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    /* ── LE DÉPÔT D'UNE PIÈCE. 🔴 IL ÉCRIT AU REGISTRE, comme la vraie route : c'est ce qui fait que la relecture
          serveur trouve un emplacement de plus. Sans cela, l'épreuve ne mesurerait que l'optimisme. ───────── */
    const m = /\/api\/admin\/gestion\/pieces\/(\d+)\/drive/.exec(url);
    if (m !== null && (init?.method ?? 'GET') === 'POST') {
      const corps = JSON.parse(String(init?.body ?? '{}')) as { dossierId?: string };
      const id = Number(m[1]);
      depots.push({ pieceId: id, dossierId: corps.dossierId ?? '' });
      if (etatDepot === 'depose') compteDuRegistre.set(id, (compteDuRegistre.get(id) ?? 0) + 1);
      return new Response(JSON.stringify({
        etat: 'ok',
        resultats: [{
          pieceId: id, nomFichier: PIECE.nom, etat: etatDepot,
          lien: 'https://drive/F1', driveFileId: `F${depots.length}`,
        }],
      }), { status: 200 });
    }
    /* ── LE COMPTEUR VERT : `?compte=1` ne lit que la base (registre + index), jamais Google. ─────────────── */
    if (url.includes('/drive/localiser')) {
      const piece = Number(new URL(url, 'http://local').searchParams.get('piece') ?? '0');
      return new Response(JSON.stringify({
        etat: 'ok', nombre: compteDuRegistre.get(piece) ?? 0, parRegistre: compteDuRegistre.get(piece) ?? 0,
        md5: null, occurrences: [], indexes: 0,
      }), { status: 200 });
    }
    /* ── LE DÉPLACEMENT : sa réponse porte la ligne de journal qui rend « Annuler » possible. ─────────────── */
    if (url.includes('/drive/deplacer')) {
      if ((init?.method ?? 'GET') === 'POST') {
        const corps = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
        if (corps.action === 'annuler') return new Response(JSON.stringify({ etat: 'ok', refuses: [] }), { status: 200 });
        return new Response(JSON.stringify({
          etat: 'ok', action: corps.action, cible: 'd2', nomCible: 'Baux',
          faits: [{ id: 'f1' }], refuses: [], mouvements: [77],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/drive/corbeille')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({ etat: 'ok', mode: 'accueil', dernier: null, recents: [] }), { status: 200 });
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
      fichiers: CONTENUS[d] ?? [],
    }), { status: 200 });
  }));
});
afterEach(() => {
  desabonner();
  act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals();
});

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };

const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 57427, filId: 36669, pieces: [PIECE],
      onRangement: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};

const ligneDe = (nom: string) => [...container.querySelectorAll('.sfd-ligne')]
  .find((x) => (x.querySelector('.sfd-nom')?.textContent ?? '') === nom);
const carteDeLaPiece = () => [...container.querySelectorAll('.sfd-piece')]
  .find((x) => (x.querySelector('.sfd-piece-nom')?.textContent ?? '') === PIECE.nom);
/** 🔴 LA PASTILLE VERTE elle-même. `null` = elle n'est pas affichée, ce qui est le cas à zéro. */
const pastille = () => carteDeLaPiece()?.querySelector('.sfd-piece-range') ?? null;

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
/** LE GESTE D'ARNO : on saisit la pièce dans la colonne de gauche, et on la lâche sur un dossier de l'arbre. */
async function rangerDans(nomDossier: string) {
  const t = await glisser('dragstart', carteDeLaPiece());
  await glisser('drop', ligneDe(nomDossier), t);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① ET ② — LE DÉFAUT D'ARNO, ET SA CORRECTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la pastille verte après un rangement', () => {
  /** ⚠️ MASQUÉE À ZÉRO : un « 0 » vert se lirait comme une bonne nouvelle alors qu'il dit le contraire. */
  it('⚠️ avant tout rangement, aucune pastille', async () => {
    await monter();
    expect(pastille()).toBeNull();
  });

  /**
   * 🔴🔴 L'ÉPREUVE DU CONSTAT D'ARNO. Elle échoue sur le code d'avant ce lot : `comptesDemandes` avait retenu la
   * clé à l'ouverture de la fenêtre, et le compteur n'était plus jamais redemandé.
   */
  it('🔴🔴 un dépôt fait apparaître « 1 »', async () => {
    await monter();
    expect(pastille()).toBeNull();
    await rangerDans('Test');
    // 🔴 LE DÉPÔT A BIEN EU LIEU : sans cela, l'épreuve mesurerait l'écran d'un geste qui n'est pas parti.
    expect(depots).toEqual([{ pieceId: 11, dossierId: 'd1' }]);
    expect(pastille()?.textContent).toBe('1');
  });

  /**
   * 🔴 LA BULLE DIT CE QUE LE NOMBRE SIGNIFIE. Un chiffre vert tout seul dans une colonne de rangement se lirait
   * aussi bien « 1 à ranger » — ce qui serait le contraire.
   *
   * ⚠️ LE LIBELLÉ EST NOMMÉ, PAS DEVINÉ PAR UN MOTIF. Ce cas cherchait `/rang/i`, et il est devenu rouge le jour
   * où Arno a décidé de « Déjà dans le Drive (N) » (07/10/2026) — alors que l'écran disait exactement la bonne
   * chose. Un motif approximatif sur un libellé n'éprouve ni le libellé ni l'écran : il éprouve le motif. On
   * compare donc à la seule définition du libellé (`bulleCompteurRange`), qui a ses propres épreuves.
   */
  it('🔴 la pastille porte son nom accessible', async () => {
    await monter();
    await rangerDans('Test');
    expect(pastille()?.getAttribute('aria-label')).toBe(bulleCompteurRange(1));
  });

  /** 🔴🔴 « deux dépôts du même document → 2 » (Arno), dans DEUX dossiers : ce sont deux emplacements. */
  it('🔴🔴 deux dépôts dans deux dossiers → « 2 »', async () => {
    await monter();
    await rangerDans('Test');
    expect(pastille()?.textContent).toBe('1');
    await rangerDans('Baux');
    expect(depots).toHaveLength(2);
    expect(pastille()?.textContent).toBe('2');
  });

  /**
   * ⚠️ UN « DÉJÀ LÀ » NE COMPTE PAS. La même pièce dans le MÊME dossier est refusée par l'index unique
   * `(piece_id, drive_dossier_id)` : l'emplacement existait, il ne s'en crée pas un second. Compter quand même
   * aurait fait monter la pastille puis la faire redescendre à la relecture — un clignotement illisible.
   */
  it('⚠️ un « déjà là » ne compte pas un second emplacement', async () => {
    await monter();
    etatDepot = 'deja';
    await rangerDans('Test');
    expect(depots).toHaveLength(1);
    expect(pastille()).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ — « ANNULER LE DERNIER DÉPLACEMENT » FAIT REDESCENDRE LE COMPTEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’annulation fait suivre le compteur', () => {
  /**
   * 🔴 LE COMPTEUR SUIT LE SERVEUR, ET NE DEVINE RIEN. L'écran ne sait pas de quelle pièce un fichier du Drive
   * est la copie : il redemande, et le registre tranche. Ici le registre annonce 0 après l'annulation (la copie a
   * été marquée disparue par la route), et la pastille s'éteint.
   *
   * ⚠️ AUCUN DELTA DEVINÉ : si l'écran avait appliqué « −1 » de sa propre initiative, il se serait trompé sur un
   * simple déplacement — qui ne change PAS le nombre d'emplacements, seulement leur chemin.
   */
  it('🔴🔴 après « Annuler », la pastille suit ce que dit le registre', async () => {
    await monter();
    await rangerDans('Test');
    expect(pastille()?.textContent).toBe('1');

    // Un déplacement DANS l'arbre : c'est lui qui offre « Annuler » dans son bandeau.
    const t = await glisser('dragstart', ligneDe('bail.pdf'));
    await glisser('drop', ligneDe('Baux'), t);
    const bandeau = container.querySelector('.sfd-bandeau');
    const annuler = [...(bandeau?.querySelectorAll('button') ?? [])]
      .find((b) => (b.textContent ?? '').trim() === 'Annuler');
    expect(annuler).not.toBeUndefined();

    // 🔴 LE REGISTRE A CHANGÉ D'AVIS (la copie n'est plus là) : l'écran doit le DEMANDER pour l'apprendre.
    compteDuRegistre.set(11, 0);
    await act(async () => { (annuler as HTMLElement).click(); });
    await calmer();
    expect(pastille()).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ — LE MAIL EST PRÉVENU, SANS RECHARGEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 les autres écrans sont prévenus', () => {
  /**
   * 🔴🔴 LA SECONDE MOITIÉ DU CONSTAT D'ARNO : « de retour dans le mail, la miniature n'a pas le picto cylindre ».
   * Le signal part avec l'identifiant de la pièce rangée — les cartes du mail et le récapitulatif de la
   * conversation s'y abonnent et relisent leur statut (voir `signalPieceDrive`).
   */
  it('🔴🔴 le rangement annonce la PIÈCE touchée', async () => {
    await monter();
    await rangerDans('Test');
    expect(signaux).toContainEqual([11]);
  });

  /**
   * ⚠️ UN GESTE SUR UN FICHIER DU DRIVE ANNONCE SANS LISTE : l'écran ne sait pas de quelle pièce ce fichier est
   * la copie. « On ne sait pas lesquelles » fait relire tout le monde, et c'est la bonne réponse — ne pas savoir
   * ne doit jamais faire ignorer.
   */
  it('⚠️ un déplacement annonce sans liste de pièces', async () => {
    await monter();
    signaux = [];
    const t = await glisser('dragstart', ligneDe('bail.pdf'));
    await glisser('drop', ligneDe('Baux'), t);
    expect(signaux).toContainEqual([]);
  });
});
