// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import { guidesNiveaux, retraitLigne } from '../../../../lib/gestion/finderDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-NIVEAUX — « DEUX CATÉGORIES DE FICHIERS DANS UN MÊME DOSSIER » ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « je crois voir deux catégories de fichiers dans un même dossier ».
 *
 * 🔴 CE QU'IL VOYAIT, ET LE NIVEAU N'ÉTAIT PAS FAUX. Mesuré dans le DOM sur l'arbre réel du Drive « Test » :
 * 6 px à la racine, 22 au niveau 1, 38 au niveau 2, 54 au niveau 3 — un pas EXACT de 16 px, et chaque ligne sous
 * son VRAI parent (les deux fichiers de « _MESURE nom immediat » à 54 px, puis « Test creation dossier drive » et
 * les fichiers du drive « Test » de retour à 38 px). L'arbre disait vrai ; il le disait trop bas.
 *
 * CE QUE CE FICHIER TIENT, ET C'EST L'ARRANGEMENT EXACT QUI TROMPAIT ARNO :
 *   ① les enfants d'un sous-dossier déplié, SUIVIS des fichiers du dossier parent ;
 *   ② 🔴🔴 chaque ligne est au niveau de SON parent — la vérification qu'Arno demande en premier ;
 *   ③ 🔴 le retrait est celui du module pur, et il vaut 20 px par niveau ;
 *   ④ 🔴 chaque ligne porte autant de traits que d'ancêtres, et aucun à la racine ;
 *   ⑤ 🔴 les dossiers passent avant les fichiers, à chaque niveau (« déjà le cas, garde-le ») ;
 *   ⑥ ⚠️ RIEN DU COMPORTEMENT NE CHANGE : la ligne entière reste la surface de dépôt.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const fichier = (id: string, nom: string, dossier = false, parentId = '') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId,
});

/**
 * 🔴 L'ARBRE EST CELUI DU DRIVE « Test » D'ARNO, dans l'ordre qu'il a sous les yeux : un drive, quatre
 * sous-dossiers, et les fichiers du drive lui-même. C'est la succession « sous-dossiers puis fichiers du parent »
 * qui a produit l'illusion des deux catégories.
 */
const CONTENUS: Record<string, ReturnType<typeof fichier>[]> = {
  '': [fichier('test', 'Test', true)],
  test: [
    fichier('d1', '_MESURE dossier instantane', true, 'test'),
    fichier('d2', '_MESURE nom immediat', true, 'test'),
    fichier('f1', '_MESURE coherence.txt', false, 'test'),
    fichier('f2', 'RIB GDS PROPRETE.pdf', false, 'test'),
  ],
  d2: [
    fichier('g1', 'Recommandé M Ahmed KHARRAT.pdf', false, 'd2'),
    fichier('g2', 'test gigout.pdf', false, 'd2'),
  ],
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide */ }
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({ etat: 'ok', mode: 'accueil', dernier: null, recents: [] }), { status: 200 });
    }
    if (url.includes('/drive/deplacer') || url.includes('/drive/corbeille')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: true, motif: null }), { status: 200 });
    }
    if (url.includes('/drive/localiser')) {
      return new Response(JSON.stringify({ etat: 'ok', nombre: 0, parRegistre: 0, md5: null, occurrences: [] }), { status: 200 });
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
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };

const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 57427, filId: 36669,
      pieces: [{ pieceId: 11, nom: 'test gigout.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' }],
      onRangement: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};

const lignes = () => [...container.querySelectorAll('.sfd-ligne')];
const ligneDe = (nom: string) => lignes().find((l) => (l.querySelector('.sfd-nom')?.textContent ?? '') === nom);
const deplier = async (nom: string) => {
  const t = ligneDe(nom)?.querySelector('.sfd-triangle');
  await act(async () => { (t as HTMLElement | undefined)?.click(); });
  await calmer();
};
/** L'arrangement exact qu'Arno avait sous les yeux : « Test » ouvert, et « _MESURE nom immediat » ouvert dedans. */
const arbreDArno = async () => {
  await monter();
  await deplier('Test');
  await deplier('_MESURE nom immediat');
};
const niveau = (nom: string) => {
  const l = ligneDe(nom) as HTMLElement | undefined;
  return l === undefined ? null : {
    pad: l.style.paddingLeft,
    guides: l.style.getPropertyValue('--sfd-guides'),
    depart: l.style.getPropertyValue('--sfd-guide-depart'),
  };
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② AUCUN ÉLÉMENT À UN NIVEAU FAUX — LA VÉRIFICATION QU'ARNO DEMANDE EN PREMIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 chaque ligne est sous son vrai parent', () => {
  it('🔴🔴 l’arrangement qui trompait : enfants du sous-dossier, puis fichiers du parent', async () => {
    await arbreDArno();
    expect(lignes().map((l) => l.querySelector('.sfd-nom')?.textContent)).toEqual([
      'Test',
      '_MESURE dossier instantane',
      '_MESURE nom immediat',
      'Recommandé M Ahmed KHARRAT.pdf',
      'test gigout.pdf',
      // 🔴 ET LES FICHIERS DU DRIVE « Test » REVIENNENT ICI, au niveau du sous-dossier qu'on vient de quitter.
      '_MESURE coherence.txt',
      'RIB GDS PROPRETE.pdf',
    ]);
  });

  it('🔴🔴 et les niveaux sont EXACTS, pas un de travers', async () => {
    await arbreDArno();
    expect(niveau('Test')?.pad).toBe(`${retraitLigne(0)}px`);
    expect(niveau('_MESURE nom immediat')?.pad).toBe(`${retraitLigne(1)}px`);
    // Les deux enfants du sous-dossier déplié : un cran de PLUS.
    expect(niveau('test gigout.pdf')?.pad).toBe(`${retraitLigne(2)}px`);
    expect(niveau('Recommandé M Ahmed KHARRAT.pdf')?.pad).toBe(`${retraitLigne(2)}px`);
    // 🔴 ET LES FICHIERS DU PARENT RESTENT AU NIVEAU DU PARENT : c'est ce que l'œil ne voyait pas.
    expect(niveau('_MESURE coherence.txt')?.pad).toBe(`${retraitLigne(1)}px`);
    expect(niveau('RIB GDS PROPRETE.pdf')?.pad).toBe(`${retraitLigne(1)}px`);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ ET ④ — LE RETRAIT PLUS GRAND, ET LES TRAITS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la hiérarchie se voit', () => {
  /** 🔴 LE PAS EST DE 20 PX (Arno : « nettement plus grand, environ 20 px »), et il vient du module pur. */
  it('🔴🔴 un cran vaut 20 px entre deux niveaux', async () => {
    await arbreDArno();
    const px = (s: string | undefined) => Number((s ?? '0').replace('px', ''));
    expect(px(niveau('_MESURE nom immediat')?.pad) - px(niveau('Test')?.pad)).toBe(20);
    expect(px(niveau('test gigout.pdf')?.pad) - px(niveau('_MESURE nom immediat')?.pad)).toBe(20);
  });

  /** 🔴🔴 UN TRAIT PAR ANCÊTRE : on compte la profondeur sans lire. */
  it('🔴🔴 autant de traits que d’ancêtres, et aucun à la racine', async () => {
    await arbreDArno();
    expect(niveau('Test')?.guides).toBe('0');
    expect(niveau('_MESURE nom immediat')?.guides).toBe('1');
    expect(niveau('test gigout.pdf')?.guides).toBe('2');
    expect(niveau('_MESURE coherence.txt')?.guides).toBe('1');
  });

  /** 🔴 ILS PARTENT DU CENTRE DU TRIANGLE DE LA RACINE : c'est de là qu'on a déplié. */
  it('🔴 le premier trait part du triangle de la racine', async () => {
    await arbreDArno();
    expect(niveau('test gigout.pdf')?.depart).toBe(`${guidesNiveaux(2).depart}px`);
  });

  /**
   * 🔴🔴 UN SEUL PSEUDO-ÉLÉMENT PEINT TOUS LES TRAITS, et c'est une propriété de performance autant que de
   * lisibilité : un nœud par niveau aurait ajouté jusqu'à treize éléments par ligne, dans une liste virtualisée
   * qui en peint une centaine. On vérifie donc qu'AUCUN élément de trait n'est ajouté au DOM.
   */
  it('🔴🔴 les traits ne sont pas des éléments du DOM', async () => {
    await arbreDArno();
    expect(container.querySelectorAll('.sfd-guide, .sfd-trait')).toHaveLength(0);
    // …et le CSS les peint bien par `::before`, avec `pointer-events:none`.
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toContain('.sfd-ligne::before');
    expect(css).toContain('pointer-events:none');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ RIEN DU COMPORTEMENT NE CHANGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⚠️ aucun changement de comportement', () => {
  /**
   * 🔴 LE RETRAIT EST UN `padding`, JAMAIS UNE MARGE : la ligne garde toute sa largeur, donc toute sa surface de
   * dépôt. Un dossier profond ne doit pas être plus dur à viser — règle du lot DRIVE-RETOUCHES-1, et un pas plus
   * grand est exactement l'occasion de la casser.
   */
  it('🔴 la ligne garde toute sa largeur : le retrait est un padding', async () => {
    await arbreDArno();
    const l = ligneDe('test gigout.pdf') as HTMLElement;
    expect(l.style.marginLeft).toBe('');
    expect(l.style.paddingLeft).not.toBe('');
  });

  /** ⚠️ LE TRIANGLE REPLIE TOUJOURS : un style ne doit pas voler un clic. */
  it('⚠️ le triangle replie encore', async () => {
    await arbreDArno();
    expect(ligneDe('test gigout.pdf')).toBeDefined();
    await deplier('_MESURE nom immediat');
    expect(ligneDe('test gigout.pdf')).toBeUndefined();
    expect(ligneDe('_MESURE coherence.txt')).toBeDefined();
  });
});
