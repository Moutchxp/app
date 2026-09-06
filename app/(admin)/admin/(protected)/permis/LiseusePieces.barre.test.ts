// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * LOT 94 — BARRE DE COMMANDES sous l'aperçu : on MONTE réellement le composant (jsdom) et on pilote l'axe de navigation des PAGES du
 * fichier ouvert (distinct de l'axe best-of « plan i sur N »). On prouve le COMPORTEMENT observable (DOM), jamais la forme du code :
 *   • fichier MULTIPAGE → la barre affiche « page i / n » (contrôle DISCRET, distinct de la paire de PLANS « plan i sur N »), boutons actifs/désactivés aux bornes, la page courante suit les clics ;
 *   • fichier 1 PAGE → aucune navigation de pages (rien à feuilleter) ;
 *   • l'axe PAGES (contrôle discret) ne touche PAS l'axe best-of (« Plan suivant » reste présent, descendu sous l'image).
 * Aucun appel réseau réel : fetch et pdf.js sont mockés.
 */
const mocks = vi.hoisted(() => {
  const state = { numPages: 3 };
  const pageObj = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 100 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  };
  const fakeDoc = { get numPages() { return state.numPages; }, getPage: () => Promise.resolve(pageObj), destroy: () => {} };
  const getDocument = vi.fn(() => ({ promise: Promise.resolve(fakeDoc) }));
  return { state, getDocument };
});
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));

import { LiseusePieces } from './LiseusePieces';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.getDocument.mockClear();
  mocks.state.numPages = 3;
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  (HTMLCanvasElement.prototype.getContext as unknown) = () => ({ drawImage: () => {} });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async (src: { width: number; height: number }) => ({ width: src.width, height: src.height, close: () => {} }));
  // GET /emprise → 1 pièce proposée ; POST signer_piece → URL signée ; POST lire_valeurs_page → issue serveur (LOT 95). Le NOMBRE DE
  //   PAGES vient de pdf.js (mocks.state.numPages). Les actions POST sont routées par `action` (aucun appel réseau réel).
  global.fetch = vi.fn(async (_input: unknown, init?: { method?: string; body?: string }) => {
    if ((init?.method ?? 'GET') === 'POST') {
      const action = (() => { try { return JSON.parse(init?.body ?? '{}').action as string; } catch { return ''; } })();
      if (action === 'lire_valeurs_page') return { ok: true, json: async () => ({ ok: true, resume: { envoyee: true, action: 'ecrire', valeur: 61.09, ecrit: true, coutUsd: 0.000001, texte: 'altitude de sommet 61,09 m NGF lue et écrite (champ vide rempli — à vérifier).' } }) } as unknown as Response;
      return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ pieces: [
      { id: 55, nomFichier: 'A.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] },
    ] }) } as unknown as Response;
  }) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

async function flush(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
function bouton(aria: string): HTMLButtonElement | null {
  return container.querySelector(`button[aria-label="${aria}"]`) as HTMLButtonElement | null;
}
function cliquer(aria: string): void {
  const b = bouton(aria);
  if (!b) throw new Error(`bouton « ${aria} » introuvable`);
  act(() => { b.click(); });
}

describe('LOT 94 — navigation de PAGES dans la barre (fichier multipage)', () => {
  it('affiche « page 1 / 3 », « précédent » désactivé en tête, « suivant » actif ; les deux axes coexistent', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    expect(container.textContent).toContain('page 1 / 3');
    expect(bouton('Page précédente du fichier')?.disabled).toBe(true);   // borne basse → désactivé (pas masqué)
    expect(bouton('Page suivante du fichier')?.disabled).toBe(false);
    // AXE BEST-OF INTACT : la navigation de PLANS (paire unique, sous l'image) reste présente ; l'axe pages (discret) ne l'a pas remplacée.
    expect(bouton('Plan suivant')).not.toBeNull();
  });

  it('« suivant » avance la page courante ; en fin de fichier « suivant » se désactive et « précédent » s’active', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    cliquer('Page suivante du fichier'); await flush();
    expect(container.textContent).toContain('page 2 / 3');
    expect(bouton('Page précédente du fichier')?.disabled).toBe(false);
    expect(bouton('Page suivante du fichier')?.disabled).toBe(false);

    cliquer('Page suivante du fichier'); await flush();
    expect(container.textContent).toContain('page 3 / 3');
    expect(bouton('Page suivante du fichier')?.disabled).toBe(true);     // borne haute → désactivé
    expect(bouton('Page précédente du fichier')?.disabled).toBe(false);
  });
});

function boutonTexte(txt: string): HTMLButtonElement | null {
  return (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === txt) as HTMLButtonElement | undefined) ?? null;
}

describe('LOT 95 — « analyse de la page » ACTIVÉE : clic → issue serveur + réversibilité', () => {
  it('le bouton est ENABLED (plus désactivé) ; un clic affiche l’issue serveur et propose d’annuler la valeur écrite', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    const btn = boutonTexte('analyse de la page');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);               // activée (LOT 94 la livrait disabled ; LOT 95 l'active)

    act(() => { btn!.click(); });
    await flush();
    // l'issue AFFICHÉE vient du serveur (honnêteté), jamais forgée côté client.
    expect(container.textContent).toContain('lue et écrite');
    // une valeur a été écrite → geste d'ANNULATION proposé (réversibilité).
    expect(boutonTexte('annuler la valeur écrite (remettre le champ à vide)')).not.toBeNull();
  });
});

describe('LOT 94 — fichier d’UNE seule page : aucune navigation de pages', () => {
  it('un fichier à 1 page n’affiche NI boutons de page NI indicateur « sur »', async () => {
    mocks.state.numPages = 1;
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    expect(bouton('Page précédente du fichier')).toBeNull();
    expect(bouton('Page suivante du fichier')).toBeNull();
    // La barre reste présente (bascule best-of + analyses), seule la LIGNE de navigation de pages disparaît.
    expect(container.textContent).not.toContain('page 1 / 1');
  });
});

describe('LOT 96 — liste « pages ajoutées à la main » repliable (reproduit le dossier 470 : 3 ajouts PC5)', () => {
  // GET renvoie 1 pièce AUTO (best-of) + 3 pièces PC5 NON proposées, incluses à la main → 3 pages « ajoutées » (manuel).
  function monterAvecAjouts(): void {
    global.fetch = vi.fn(async (_i: unknown, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'POST') return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response;
      return { ok: true, json: async () => ({
        pieces: [
          { id: 55, nomFichier: 'A.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] },
          { id: 481, nomFichier: 'PC5_AUTRES__20250515130657.pdf', propose: false, famille: null },
          { id: 484, nomFichier: 'PC5_SUD__20250515130517.pdf', propose: false, famille: null },
          { id: 485, nomFichier: 'PC5_TOITURE__20250515130635.pdf', propose: false, famille: null },
        ],
        inclusionsBestOf: [{ pieceId: 481, page: 1 }, { pieceId: 484, page: 1 }, { pieceId: 485, page: 1 }],
      }) } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('ligne REPLIÉE par défaut : « 3 pages ajoutées au best-of à la main », détail caché ; dépliage → 3 boutons « retirer »', async () => {
    monterAvecAjouts();
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 470 })); });
    await flush();
    // ligne repliée : le COMPTE est visible sans déplier (accord pluriel), déclencheur aria-expanded=false.
    const ligne = boutonTexte('3 pages ajoutées au best-of à la main ▾');
    expect(ligne).not.toBeNull();
    expect(ligne!.getAttribute('aria-expanded')).toBe('false');
    // détail replié → aucun bouton « retirer » visible.
    expect(Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'retirer')).toHaveLength(0);

    // UN clic → détail ouvert : les 3 entrées et leurs 3 boutons « retirer ».
    act(() => { ligne!.click(); });
    await flush();
    expect(container.textContent).toContain('PC5_AUTRES__20250515130657.pdf — page 1');
    expect(container.textContent).toContain('PC5_SUD__20250515130517.pdf — page 1');
    expect(container.textContent).toContain('PC5_TOITURE__20250515130635.pdf — page 1');
    expect(Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'retirer')).toHaveLength(3);
  });

  it('0 ajout → la ligne ne s’affiche PAS du tout (jamais « 0 page ajoutée »)', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); }); // mock par défaut : aucune inclusion
    await flush();
    expect(container.textContent).not.toContain('ajoutée');
  });
});

describe('LOT 99 — statut par page (reproduit 470 : PC5_AUTRES 3 pages, page 1 lue au grain page ; famille connue)', () => {
  function monterAvecLecturePage1(): void {
    mocks.state.numPages = 3;
    global.fetch = vi.fn(async (_i: unknown, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'POST') return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response;
      return { ok: true, json: async () => ({
        pieces: [{ id: 481, nomFichier: 'PC5_AUTRES.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] }],
        lecturesPages: { 481: [{ page: 1, envoyee: true, motif: null, nbValeurs: 1, resume: 'ok', coutUsd: 0.000001, creeLe: '2026-09-05T10:00:00Z' }] },
      }) } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it('page 1 (valeurs lues au grain page, IA) → libellé « valeurs lues et intégrées » + bouton « ré-analyser cette page »', async () => {
    monterAvecLecturePage1();
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 470 })); });
    await flush(); // ouvre sur page 1 (best-of)
    expect(container.textContent).toContain('valeurs lues et intégrées');       // ÉTAT « lu » (mesuré, page grain)
    expect(container.textContent).toContain('Page déjà analysée individuellement : 1.'); // vue d'ensemble
    expect(boutonTexte('ré-analyser cette page')).not.toBeNull();
    expect(boutonTexte('analyse de la page')).toBeNull(); // requalifié : jamais le libellé neutre quand les valeurs sont lues
  });

  it('page 2 (valeurs NON lues) → « page identifiée mais non analysée » DÉRIVÉ du fichier (famille connue), bouton « analyse de la page »', async () => {
    monterAvecLecturePage1();
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 470 })); });
    await flush();
    cliquer('Page suivante du fichier'); await flush(); // page 2
    expect(container.textContent).toContain('page 2 / 3');
    expect(container.textContent).not.toContain('valeurs lues et intégrées');   // ses valeurs n'ont PAS été lues
    expect(container.textContent).toContain('page identifiée mais non analysée'); // identifiée SANS IA (famille), dérivé
    expect(container.textContent).toContain('d’après l’analyse du fichier');      // honnêteté : dérivé, pas mesuré page par page
    expect(boutonTexte('analyse de la page')).not.toBeNull();                     // travail neuf : lire ses valeurs
    expect(boutonTexte('ré-analyser cette page')).toBeNull();
    expect(container.textContent).toContain('Page déjà analysée individuellement : 1.'); // la vue d'ensemble décrit la pièce
  });
});
