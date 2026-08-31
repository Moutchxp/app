// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * LOT 24 — NON-RÉGRESSION du correctif bloquant : sous le StrictMode de React (montage → démontage → REMONTAGE sur la MÊME fibre, où les
 * refs PERSISTENT mais les effets rejouent), la liseuse doit TOUJOURS afficher le plan courant et retirer l'overlay « Chargement… ».
 *
 * Le bug LOT 23 : un flag `monteRef` mis false au démontage et jamais remis true au remontage restait false sur le montage réel →
 * l'overlay n'était jamais effacé et le rendu était abandonné → écran gris figé. Ce test MONTE réellement le composant sous StrictMode
 * (donc déclenche le double-invoke) et prouve que l'état « chargement » RETOMBE. Il ÉCHOUE sur le code d'avant correctif (overlay collant),
 * PASSE après. On assère le COMPORTEMENT (DOM observable + tentative de chargement du plan), jamais la forme du code.
 */

// pdf.js est importé DYNAMIQUEMENT par le composant : on mocke le module ESM chargé, avec un getDocument espionné (spy) et un faux document.
const mocks = vi.hoisted(() => {
  const fakeDoc = {
    numPages: 1,
    getPage: () => Promise.resolve({ getViewport: () => ({ width: 100, height: 100 }) }),
    destroy: () => {},
  };
  const getDocument = vi.fn(() => ({ promise: Promise.resolve(fakeDoc) }));
  return { fakeDoc, getDocument };
});
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));

// Le composant s'importe APRÈS le vi.mock (hoisté), pour que l'import dynamique voie bien le module mocké.
import { LiseusePieces } from './LiseusePieces';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.getDocument.mockClear();
  // jsdom n'implémente pas le contexte 2D : on le force à null → le rendu s'arrête proprement AVANT de peindre (le finally doit tout de même retomber).
  (HTMLCanvasElement.prototype.getContext as unknown) = () => null;
  // GET /emprise → 1 plan proposé ; POST signer_piece → URL signée. (bande d'un seul plan → aucun préchargement voisin à gérer ici.)
  global.fetch = vi.fn(async (_input: unknown, init?: { method?: string }) => {
    if ((init?.method ?? 'GET') === 'POST') return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response;
    return { ok: true, json: async () => ({ pieces: [{ id: 55, nomFichier: 'PC02_5-1.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] }] }) } as unknown as Response;
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

async function flush(n = 8): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('LOT 24 — StrictMode : le plan courant s’affiche et « Chargement… » retombe (échoue sur le bug LOT 23)', () => {
  it('après montage/démontage/remontage StrictMode, l’overlay « Chargement… » a disparu et le document courant a bien été chargé', async () => {
    await act(async () => { root.render(h(StrictMode, null, h(LiseusePieces, { dossierId: 1 }))); });
    await flush();

    // COMPORTEMENT 1 — l'état « chargement » est RETOMBÉ : aucun overlay figé (le bug laissait « Chargement… » à l'infini sur fond gris).
    expect(container.textContent).not.toContain('Chargement…');
    // COMPORTEMENT 2 — le plan COURANT a réellement été demandé au moteur pdf.js (le rendu n'a pas été abandonné en amont).
    expect(mocks.getDocument).toHaveBeenCalled();
    // COMPORTEMENT 3 — aucun message d'erreur : le chargement a abouti (pas de « pièce indisponible » ni « PDF illisible »).
    expect(container.textContent).not.toContain('indisponible');
    expect(container.textContent).not.toContain('illisible');
  });
});
