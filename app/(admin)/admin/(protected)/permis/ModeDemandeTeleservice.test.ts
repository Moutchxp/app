// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModeDemandeTeleservice, type ModePreparation } from './ModeDemandeTeleservice';

/**
 * MODE (téléservice) — COMPORTEMENT de la bascule (jsdom + act, sans testing-library). Le `mode` est CONTRÔLÉ par le parent ; on
 * l'éprouve via un petit wrapper à état (comme ADemanderVue). On vérifie l'ÉTAT (aria-pressed) et la PRÉSENCE du panneau manuel,
 * jamais l'apparence. Le mode automatique n'a plus de bloc « Communes libres » : les cartes vivent dans le carrousel (BlocDepot).
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

// Wrapper à état : reproduit le parent (ADemanderVue possède `mode`, ModeDemandeTeleservice le reçoit + remonte via onMode).
function Wrapper({ initial = 'auto' as ModePreparation }): React.ReactElement {
  const [mode, setMode] = useState<ModePreparation>(initial);
  return createElement(ModeDemandeTeleservice, { categories: [], mode, onMode: setMode, onChangement: vi.fn() });
}
const monter = async (): Promise<void> => {
  await act(async () => { root.render(createElement(Wrapper, {})); });
  await act(async () => { await Promise.resolve(); });
};

describe('MODE téléservice — bascule auto / manuel (mode contrôlé)', () => {
  it('mode automatique ACTIF par défaut (aucun panneau manuel monté)', async () => {
    await monter();
    expect(boutonPar(/Mode automatique/)?.getAttribute('aria-pressed')).toBe('true');
    expect(boutonPar(/Mode manuel/)?.getAttribute('aria-pressed')).toBe('false');
    expect(champManuel()).toBeNull(); // le panneau manuel n'apparaît qu'en mode manuel
  });

  it('la bascule dit en toutes lettres ce que fait chaque mode (auto = carrousel ; manuel = vivier)', async () => {
    await monter();
    expect(container.textContent).toMatch(/carrousel/i); // description du mode automatique (cartes dans le carrousel)
    expect(container.textContent).toMatch(/vivier/i);    // description du mode manuel
    expect(boutons().some((b) => /Préparer/i.test(b.textContent ?? ''))).toBe(false); // aucun bouton « Préparer … » (bloc intermédiaire retiré)
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
