// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteRail } from './CarteRail';

/**
 * Lot 2 — carte-rail interactive. On teste le COMPORTEMENT (bascule, non-sélectionnabilité du hors-process, bulle de survol, clavier).
 * NON couverts en jsdom (signalé) : les COULEURS des 4 états, la MISE EN PAGE, et la clicabilité INTÉRIEURE réelle (pointer-events — jsdom
 * n'a pas de hit-testing ; on vérifie que le gestionnaire est atteignable sur la forme).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RING = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][];
function commune(code: string, nom: string, canal: string | null) { return { code, nom, dep: '75', canal, anneaux: [RING] }; }
// Un jeu couvrant les 4 états vus depuis le rail 'email' : courant (email), autre (formulaire), nonAffecte (null), horsProcess (inconnu).
const PAYLOAD = { communes: [
  commune('75001', 'Alphaville', null),        // nonAffecte → sélectionnable
  commune('75002', 'Betaville', 'email'),      // courant → sélectionnable
  commune('75003', 'Gammaville', 'formulaire'),// autre → sélectionnable
  commune('75004', 'Deltaville', 'inconnu'),   // horsProcess → NON sélectionnable
], bbox: [0, 0, 10, 10] };

let root: Root | null = null; const fetchOrig = global.fetch;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; global.fetch = fetchOrig; });
async function flush(n = 10) { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }

async function monter(onToggle: (code: string) => void, selection: Set<string> = new Set(), editable?: boolean) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD }) as unknown as Response) as unknown as typeof fetch;
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(CarteRail, { rail: 'email', selection, onToggle, editable })); });
  await flush();
  return container;
}
/** Le <g> (role=button) d'une commune, repéré par son libellé accessible (commence par le nom). */
function communeNode(c: HTMLElement, nom: string): SVGGElement {
  return [...c.querySelectorAll('[role="button"]')].find((g) => (g.getAttribute('aria-label') ?? '').startsWith(nom)) as unknown as SVGGElement;
}

describe('POINT 1 — au REPOS, « sur ce rail » n’est PAS confondu avec « sélectionnée »', () => {
  it('REPOS (non éditable) : une commune du rail sélectionnée (amorce) reste « sur ce rail », SANS « sélectionnée »', async () => {
    // Betaville est sur le rail email (courant) ET dans la sélection amorcée. Au repos, son libellé accessible dit son ÉTAT réel.
    const c = await monter(vi.fn(), new Set(['75002']), false);
    const label = communeNode(c, 'Betaville').getAttribute('aria-label') ?? '';
    expect(label).toContain('sur ce rail');       // état réel dérivé du canal
    expect(label).not.toContain('sélectionnée');   // PAS traitée comme sélectionnée au repos (le bug : elle l'était)
    expect(communeNode(c, 'Betaville').getAttribute('aria-pressed')).toBeNull(); // au repos, la carte n'annonce pas de sélection
  });
  it('ÉDITION : la même commune sélectionnée est bien annoncée « sélectionnée » (non-régression Lot 2/3)', async () => {
    const c = await monter(vi.fn(), new Set(['75002']), true);
    const label = communeNode(c, 'Betaville').getAttribute('aria-label') ?? '';
    expect(label).toContain('sur ce rail');
    expect(label).toContain('sélectionnée');
    expect(communeNode(c, 'Betaville').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('CarteRail — bascule, hors-process, survol, clavier', () => {
  it('clic sur une commune SÉLECTIONNABLE bascule (illimité : autant de clics que voulu)', async () => {
    const onToggle = vi.fn();
    const c = await monter(onToggle);
    const node = communeNode(c, 'Alphaville');
    for (let i = 0; i < 3; i++) act(() => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onToggle.mock.calls).toEqual([['75001'], ['75001'], ['75001']]); // 3 bascules, sans limite
  });

  it('clic sur l’INTÉRIEUR du tracé (le polygone) atteint le gestionnaire (pointer-events)', async () => {
    const onToggle = vi.fn();
    const c = await monter(onToggle);
    const poly = communeNode(c, 'Betaville').querySelector('polygon')!;
    act(() => { poly.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onToggle).toHaveBeenCalledWith('75002');
  });

  it('clic sur une commune HORS PROCESS → aucune bascule (non sélectionnable)', async () => {
    const onToggle = vi.fn();
    const c = await monter(onToggle);
    act(() => { communeNode(c, 'Deltaville').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onToggle).not.toHaveBeenCalled();
    expect(communeNode(c, 'Deltaville').getAttribute('aria-disabled')).toBe('true'); // annoncé non sélectionnable
  });

  it('BULLE de survol : apparaît avec le bon nom, disparaît quand le survol cesse', async () => {
    const c = await monter(vi.fn());
    const node = communeNode(c, 'Gammaville');
    act(() => { node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 })); });
    expect((c.textContent ?? '')).toContain('Gammaville'); // nom affiché (bulle + ligne d'identité)
    // onMouseLeave est synthétisé par React depuis 'mouseout' quand le pointeur quitte l'élément (relatedTarget hors du <g>).
    act(() => { node.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); });
    expect((c.textContent ?? '')).not.toContain('Gammaville'); // disparaît au départ du survol
  });

  it('CLAVIER : Entrée sur une commune sélectionnable bascule ; une sélectionnée porte aria-pressed', async () => {
    const onToggle = vi.fn();
    const c = await monter(onToggle, new Set(['75002'])); // Betaville pré-sélectionnée
    const node = communeNode(c, 'Alphaville');
    act(() => { node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onToggle).toHaveBeenCalledWith('75001');
    expect(communeNode(c, 'Betaville').getAttribute('aria-pressed')).toBe('true'); // sélection reflétée à l'écran
  });
});
