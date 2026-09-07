// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * P3 (perfo) — SUPPRESSION DU DOUBLON `GET /emprise`. La liseuse peut RÉUTILISER la donnée déjà chargée par un frère (BlocTraceEmprise)
 * via `donneesPrechargees`, au lieu de refaire le GET (le poste de coût dominant : ré-extraction PDF côté serveur). On MONTE réellement
 * la liseuse (jsdom) et on ESPIONNE fetch : COMPORTEMENT, jamais la forme du code. Garde : au 1er chargement, un seul GET /emprise au plus.
 */
const mocks = vi.hoisted(() => {
  const pageObj = { getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 100 * scale }), render: () => ({ promise: Promise.resolve() }) };
  const fakeDoc = { numPages: 1, getPage: () => Promise.resolve(pageObj), destroy: () => {} };
  const getDocument = vi.fn(() => ({ promise: Promise.resolve(fakeDoc) }));
  return { getDocument };
});
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));

import { LiseusePieces, type DonneesLiseuse } from './LiseusePieces';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PIECES = [
  { id: 55, nomFichier: 'A.pdf', propose: true, famille: 'masse' as const, confirme: true, planches: [{ page: 1, echelle: null }] },
  { id: 56, nomFichier: 'B.pdf', propose: true, famille: 'masse' as const, confirme: true, planches: [{ page: 1, echelle: null }] },
];
const DONNEES: DonneesLiseuse = { pieces: PIECES };

let container: HTMLDivElement;
let root: Root;
let getsEmprise: number; // nb de GET /api/admin/permis/emprise émis

beforeEach(() => {
  mocks.getDocument.mockClear();
  getsEmprise = 0;
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  (HTMLCanvasElement.prototype.getContext as unknown) = () => ({ drawImage: () => {} });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async (src: { width: number; height: number }) => ({ width: src.width, height: src.height, close: () => {} }));
  global.fetch = vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.includes('/api/admin/permis/emprise')) { getsEmprise += 1; return { ok: true, json: async () => ({ pieces: PIECES }) } as unknown as Response; }
    if (method === 'POST') return { ok: true, json: async () => ({ url: 'blob:fake' }) } as unknown as Response; // signer_piece (rendu)
    return { ok: true, json: async () => ({}) } as unknown as Response;
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

describe('P3 — la liseuse réutilise la donnée préchargée sans refaire le GET /emprise', () => {
  it('🔴 avec donneesPrechargees : AUCUN GET /emprise (doublon supprimé) ; les MÊMES pièces sont chargées (rendu démarré)', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 7424, donneesPrechargees: DONNEES })); });
    await flush();
    expect(getsEmprise).toBe(0);                       // 🔴 le doublon est supprimé
    expect(mocks.getDocument).toHaveBeenCalled();      // les pièces sont là → le 1er plan du best-of s'ouvre (mêmes pièces qu'un fetch)
  });

  it('🔴 sans donneesPrechargees : le GET /emprise reste émis (fallback inchangé), une seule fois', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 7424 })); });
    await flush();
    expect(getsEmprise).toBe(1);                       // comportement d'origine préservé quand rien n'est partagé
    expect(mocks.getDocument).toHaveBeenCalled();
  });

  it('🔴 donneesPrechargees NULL explicite = fallback (charge elle-même)', async () => {
    await act(async () => { root.render(h(LiseusePieces, { dossierId: 7424, donneesPrechargees: null })); });
    await flush();
    expect(getsEmprise).toBe(1);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

describe('P3 — câblage anti-doublon (garde de source : la donnée /emprise est PARTAGÉE, jamais re-fetchée par un frère)', () => {
  it('ProjectionVue remonte la donnée du bloc « Bâtiments et projection » et la partage à la liseuse de la planche', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
    expect(s).toContain('onDonneesLiseuse={setDonneesLiseuse}'); // BlocTraceEmprise → ProjectionVue
    expect(s).toContain('donneesLiseuse={donneesLiseuse}');       // ProjectionVue → PlancheParcelles
  });
  it('BlocTraceEmprise partage sa donnée /emprise à sa liseuse embarquée (0 bâtiment)', () => {
    expect(lire('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx')).toContain('donneesPrechargees={donneesLiseuse}');
  });
  it('PlancheParcelles transmet la donnée préchargée à sa liseuse', () => {
    expect(lire('app/(admin)/admin/(protected)/permis/PlancheParcelles.tsx')).toContain('donneesPrechargees={donneesLiseuse}');
  });
});
