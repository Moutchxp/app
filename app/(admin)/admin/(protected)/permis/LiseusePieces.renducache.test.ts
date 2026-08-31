// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * LOT 25 — CACHE DE RENDU : un retour sur une page déjà peinte à la MÊME échelle ne rappelle PAS render() (affichage instantané via le
 * bitmap mémorisé) ; un changement d'ÉCHELLE, lui, rappelle bien render() (nouvelle clé, l'ancienne échelle restant en cache). On monte
 * réellement le composant (jsdom), on pilote la navigation best-of (suivant/précédent) et on ESPIONNE page.render() — assertion de
 * COMPORTEMENT sur l'espion, jamais sur la forme du code. Le premier test ÉCHOUE sur le code d'avant LOT 25 (render rappelé à chaque retour).
 */
const mocks = vi.hoisted(() => {
  const renderSpy = vi.fn((args: { viewport: { width: number } }) => { void args; return { promise: Promise.resolve() }; });
  const pageObj = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 100 * scale }),
    render: renderSpy,
  };
  const fakeDoc = { numPages: 1, getPage: () => Promise.resolve(pageObj), destroy: () => {} };
  const getDocument = vi.fn(() => ({ promise: Promise.resolve(fakeDoc) }));
  return { renderSpy, getDocument };
});
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));

import { LiseusePieces } from './LiseusePieces';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function fixerDpr(v: number) { Object.defineProperty(window, 'devicePixelRatio', { value: v, configurable: true }); }

beforeEach(() => {
  mocks.renderSpy.mockClear();
  mocks.getDocument.mockClear();
  fixerDpr(1);
  // Contexte 2D minimal (offscreen + visible) : drawImage suffit ; le rendu pdf.js réel est espionné, pas exécuté.
  (HTMLCanvasElement.prototype.getContext as unknown) = () => ({ drawImage: () => {} });
  // Le résultat peint est figé en « bitmap » (objet léger avec width/height) — pas d'ImageBitmap réel en jsdom.
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async (src: { width: number; height: number }) => ({ width: src.width, height: src.height, close: () => {} }));
  // Best-of à DEUX plans (pièces 55 et 56) → on peut quitter un plan et y revenir.
  global.fetch = vi.fn(async (_input: unknown, init?: { method?: string }) => {
    if ((init?.method ?? 'GET') === 'POST') return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response;
    return { ok: true, json: async () => ({ pieces: [
      { id: 55, nomFichier: 'A.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] },
      { id: 56, nomFichier: 'B.pdf', propose: true, famille: 'masse', confirme: true, planches: [{ page: 1, echelle: null }] },
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
function cliquer(aria: string): void {
  const btn = container.querySelector(`button[aria-label="${aria}"]`) as HTMLButtonElement | null;
  if (!btn) throw new Error(`bouton « ${aria} » introuvable`);
  act(() => { btn.click(); });
}

describe('LOT 25 — le cache de rendu évite un nouvel appel à render() au RETOUR sur une page déjà peinte', () => {
  it('revenir sur un plan à la même échelle ne rappelle PAS render() (2 rendus pour 2 plans, pas 3 au retour)', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    expect(mocks.renderSpy).toHaveBeenCalledTimes(1); // plan 1 (pièce 55) peint une fois

    cliquer('Plan suivant'); await flush();
    expect(mocks.renderSpy).toHaveBeenCalledTimes(2); // plan 2 (pièce 56) peint une fois

    cliquer('Plan précédent'); await flush();
    // RETOUR sur le plan 1, même page, même échelle → CACHE DE RENDU → aucun nouvel appel : le compteur reste à 2 (et non 3).
    expect(mocks.renderSpy).toHaveBeenCalledTimes(2);
  });

  it('un changement d’ÉCHELLE (densité écran) rappelle bien render() (nouvelle clé de cache), l’ancienne échelle restant en cache', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    expect(mocks.renderSpy).toHaveBeenCalledTimes(1); // pièce 55 à l'échelle dpr=1 (canvas 480)

    fixerDpr(2); // l'échelle de rendu double → nouvelle clé « pièce:page:échelle »
    cliquer('Plan suivant'); await flush();           // pièce 56 à la nouvelle échelle (canvas 960)
    cliquer('Plan précédent'); await flush();          // RETOUR pièce 55 mais à une AUTRE échelle → MISS → render rappelé
    expect(mocks.renderSpy).toHaveBeenCalledTimes(3);
    // Preuve explicite : un rendu a bien eu lieu à la nouvelle échelle (largeur de viewport 960), distincte de la première (480).
    const largeurs = mocks.renderSpy.mock.calls.map((c) => c[0].viewport.width);
    expect(largeurs).toContain(480);
    expect(largeurs).toContain(960);
  });
});
