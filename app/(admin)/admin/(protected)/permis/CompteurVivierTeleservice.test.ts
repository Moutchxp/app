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

describe('Lot 2 — compteur de vivier téléservice (hors démolition en principal, total en second)', () => {
  it('PRINCIPAL = vivier HORS démolition (libellé « hors démolition ») ; SECONDAIRE = total tous types (libellé)', async () => {
    await monter(0, { formulaire: 376, formulaireHorsDemolition: 223, email: 12, tronque: false });
    expect(container.textContent).toMatch(/223 permis encore demandables hors démolition/i); // le nombre qui saute aux yeux
    expect(container.textContent).toMatch(/Téléservice/i);
    expect(container.textContent).toMatch(/376 tous types confondus/i);                       // total en information secondaire, pas un nombre nu
  });

  it('carrousel vide mais vivier non vide → le compteur reste affiché (les DEUX nombres, avec libellés)', async () => {
    // Rendu SEUL (aucun carrousel autour) : il montre le stock, prouvant qu'il ne dépend pas du return null de BlocDepot.
    await monter(0, { formulaire: 5, formulaireHorsDemolition: 3, email: 0, tronque: false });
    expect(container.textContent).toMatch(/3 permis encore demandables hors démolition/i);
    expect(container.textContent).toMatch(/5 tous types confondus/i);
  });

  it('tronque → « au moins N » sur les DEUX nombres (jamais un total faux présenté comme exact)', async () => {
    await monter(0, { formulaire: 376, formulaireHorsDemolition: 223, email: 0, tronque: true });
    expect(container.textContent).toMatch(/au moins\s*223/i); // principal (hors démolition)
    expect(container.textContent).toMatch(/au moins\s*376/i); // secondaire (tous types)
  });

  it('un rafraîchissement (nouveau signal) remet les DEUX chiffres à jour ENSEMBLE', async () => {
    let hd = 223, tot = 376;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ formulaire: tot, formulaireHorsDemolition: hd, tronque: false }) } as unknown as Response)) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(CompteurVivierTeleservice, { signalRafraichir: 0 })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('223');
    expect(container.textContent).toContain('376');
    hd = 222; tot = 375; // après un dépôt (hors démolition), les deux baissent ensemble
    await act(async () => { root.render(createElement(CompteurVivierTeleservice, { signalRafraichir: 1 })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('222');
    expect(container.textContent).toContain('375');
  });

  it('repli sûr : route SANS le champ hors-démolition → on affiche le total (jamais « undefined »)', async () => {
    await monter(0, { formulaire: 42, email: 0, tronque: false }); // formulaireHorsDemolition ABSENT
    expect(container.textContent).toContain('42');
    expect(container.textContent).not.toMatch(/undefined/i);
  });
});
