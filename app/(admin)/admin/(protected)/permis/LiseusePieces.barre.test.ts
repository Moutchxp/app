// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * LOT 94 — BARRE DE COMMANDES sous l'aperçu : on MONTE réellement le composant (jsdom) et on pilote l'axe de navigation des PAGES du
 * fichier ouvert (distinct de l'axe best-of « plan i sur N »). On prouve le COMPORTEMENT observable (DOM), jamais la forme du code :
 *   • fichier MULTIPAGE → la barre affiche « page i sur n », boutons actifs/désactivés aux bornes, la page courante suit les clics ;
 *   • fichier 1 PAGE → aucune navigation de pages (rien à feuilleter) ;
 *   • l'axe PAGES ne touche PAS l'axe best-of (« Plan suivant » reste présent en colonne gauche).
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
  it('affiche « page 1 sur 3 », « précédent » désactivé en tête, « suivant » actif ; les deux axes coexistent', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    expect(container.textContent).toContain('page 1 sur 3');
    expect(bouton('Page précédente du fichier')?.disabled).toBe(true);   // borne basse → désactivé (pas masqué)
    expect(bouton('Page suivante du fichier')?.disabled).toBe(false);
    // AXE BEST-OF INTACT : la navigation de plans reste présente (colonne gauche), l'axe pages ne l'a pas remplacée.
    expect(bouton('Plan suivant')).not.toBeNull();
  });

  it('« suivant » avance la page courante ; en fin de fichier « suivant » se désactive et « précédent » s’active', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 1 })); });
    await flush();
    cliquer('Page suivante du fichier'); await flush();
    expect(container.textContent).toContain('page 2 sur 3');
    expect(bouton('Page précédente du fichier')?.disabled).toBe(false);
    expect(bouton('Page suivante du fichier')?.disabled).toBe(false);

    cliquer('Page suivante du fichier'); await flush();
    expect(container.textContent).toContain('page 3 sur 3');
    expect(bouton('Page suivante du fichier')?.disabled).toBe(true);     // borne haute → désactivé
    expect(bouton('Page précédente du fichier')?.disabled).toBe(false);
  });
});

function boutonTexte(txt: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === txt) as HTMLButtonElement | null;
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
    expect(container.textContent).not.toContain('page 1 sur 1');
  });
});
