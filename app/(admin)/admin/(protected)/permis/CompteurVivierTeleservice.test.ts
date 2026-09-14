// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CompteurVivierTeleservice } from './CompteurVivierTeleservice';

/**
 * Lot 2 — COMPORTEMENT du compteur de vivier (jsdom + act, sans testing-library). `fetch` mocké. Aucune assertion de
 * couleur/classe/pixel, aucune lecture de source.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async (signal: number, reponse: unknown): Promise<void> => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => reponse } as unknown as Response)) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(CompteurVivierTeleservice, { signalRafraichir: signal })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('Lot 2 — compteur de vivier téléservice', () => {
  it('affiche le nombre de PERMIS demandables (téléservice), en toutes lettres', async () => {
    await monter(0, { formulaire: 340, email: 12, tronque: false });
    expect(container.textContent).toContain('340');
    expect(container.textContent).toMatch(/permis encore demandables/i);
    expect(container.textContent).toMatch(/Téléservice/i);
  });

  it('carrousel vide mais vivier non vide → le compteur reste affiché (composant indépendant du carrousel)', async () => {
    // Rendu SEUL (aucun carrousel autour) : il montre le stock, prouvant qu'il ne dépend pas du return null de BlocDepot.
    await monter(0, { formulaire: 5, email: 0, tronque: false });
    expect(container.textContent).toContain('5');
    expect(container.textContent).toMatch(/permis encore demandables/i);
  });

  it('tronque → « au moins N » (jamais un total faux présenté comme exact)', async () => {
    await monter(0, { formulaire: 340, email: 0, tronque: true });
    expect(container.textContent).toMatch(/au moins\s*340/i);
  });

  it('un rafraîchissement (nouveau signal) remet le chiffre à jour', async () => {
    let val = 340;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ formulaire: val, tronque: false }) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(CompteurVivierTeleservice, { signalRafraichir: 0 })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('340');
    val = 338; // après un dépôt, le stock baisse
    await act(async () => { root.render(createElement(CompteurVivierTeleservice, { signalRafraichir: 1 })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('338');
  });
});
