// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModeDemandeTeleservice } from './ModeDemandeTeleservice';

/**
 * MODE MANUEL — COMPORTEMENT de la bascule (jsdom + act, sans testing-library). Aucune assertion de couleur/classe/pixel, aucune
 * lecture de source : on vérifie l'ÉTAT (aria-pressed) et la PRÉSENCE du panneau manuel, pas leur apparence.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch; // aucun fetch au montage
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const boutonPar = (motif: RegExp): HTMLButtonElement | undefined => boutons().find((b) => motif.test(b.textContent ?? ''));
const champManuel = (): HTMLInputElement | null => container.querySelector('input[aria-label*="vivier téléservice"]');

const monter = async (): Promise<void> => {
  await act(async () => { root.render(createElement(ModeDemandeTeleservice, { categories: [], onChangement: vi.fn() })); });
  await act(async () => { await Promise.resolve(); });
};

describe('MODE MANUEL — bascule auto / manuel', () => {
  it('mode automatique ACTIF par défaut au chargement (et aucun panneau manuel monté)', async () => {
    await monter();
    expect(boutonPar(/Mode automatique/)?.getAttribute('aria-pressed')).toBe('true');
    expect(boutonPar(/Mode manuel/)?.getAttribute('aria-pressed')).toBe('false');
    expect(champManuel()).toBeNull(); // le panneau manuel n'apparaît qu'en mode manuel
  });

  it('la bascule dit en toutes lettres ce que fait chaque mode', async () => {
    await monter();
    expect(container.textContent).toMatch(/Préparer les demandes/i); // description du mode automatique
    expect(container.textContent).toMatch(/vivier/i);                 // description du mode manuel
  });

  it('bascule en mode manuel → le panneau de recherche du vivier apparaît, mode manuel actif', async () => {
    await monter();
    await act(async () => { boutonPar(/Mode manuel/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(boutonPar(/Mode manuel/)?.getAttribute('aria-pressed')).toBe('true');
    expect(champManuel()).not.toBeNull();
  });

  it('retour en mode automatique → le panneau manuel disparaît (bascule réversible)', async () => {
    await monter();
    await act(async () => { boutonPar(/Mode manuel/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(champManuel()).not.toBeNull();
    await act(async () => { boutonPar(/Mode automatique/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(champManuel()).toBeNull();
  });
});
