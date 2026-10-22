// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 🔴 Arno (22/10/2026) — Banc de test : le message rouge « Saisissez des coordonnées (ex. …) » ne s'affiche qu'après une
 * tentative (« Placer » avec un champ vide ou invalide), jamais à l'ouverture de la page. Cartes et réseau simulés.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../../../../MapSelector', () => ({ default: () => null }));
vi.mock('../../../../components/AdresseAutocomplete', () => ({ AdresseAutocomplete: () => null }));
vi.mock('./EditeurProfilTest', () => ({ default: () => null }));
vi.mock('./EventailFaisceaux', () => ({ default: () => null }));
const { default: BancSaisie } = await import('./BancSaisie');

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const MESSAGE = 'Saisissez des coordonnées';
const placer = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Placer') as HTMLButtonElement;

describe('🔴 Banc de test : le message des coordonnées', () => {
  it('absent à l’ouverture ; présent après « Placer » sur un champ vide', async () => {
    await act(async () => { root.render(createElement(BancSaisie)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(container.textContent).toContain('Placer');
    expect(container.textContent).not.toContain(MESSAGE);
    await act(async () => { placer().click(); });
    expect(container.textContent).toContain(MESSAGE);
  });
});
