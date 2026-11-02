// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfoBulle } from './InfoBulle';

/**
 * 🔴 Arno (02/11/2026) — l'info-bulle « i » partagée : l'option `auSurvol` (colonne « Variable négociateur ») l'ouvre aussi au survol ; sans elle,
 * rien ne change pour les autres écrans (clic, toucher, clavier, Échap, clic ailleurs). Un toucher d'iPhone (survol simulé puis clic) l'ouvre,
 * un second toucher la ferme.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const rendre = async (auSurvol?: boolean) => { await act(async () => { root.render(createElement(InfoBulle, { libelle: 'Essai', cible: 'essai', texte: 'Le texte', auSurvol })); }); };
const bouton = () => container.querySelector<HTMLButtonElement>('.svv-pil-ib-btn')!;
const ouverte = () => bouton().getAttribute('aria-expanded') === 'true';
const survoler = async (dedans: boolean) => { await act(async () => { container.querySelector('.svv-pil-ib')!.dispatchEvent(new MouseEvent(dedans ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: document.body })); }); };
const cliquer = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

describe('InfoBulle — l’option « au survol »', () => {
  it('sans l’option (tous les autres écrans) : le survol n’ouvre rien ; clic ouvre, clic ferme ; Échap et clic ailleurs ferment', async () => {
    await rendre();
    await survoler(true);
    expect(ouverte()).toBe(false);
    await cliquer(bouton()); expect(ouverte()).toBe(true);
    await cliquer(bouton()); expect(ouverte()).toBe(false);
    await cliquer(bouton());
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(ouverte()).toBe(false);
    await cliquer(bouton());
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(ouverte()).toBe(false);
  });
  it('avec l’option : le survol ouvre, le quitter ferme ; un clic pendant le survol la garde ouverte après le départ de la souris', async () => {
    await rendre(true);
    await survoler(true); expect([ouverte(), container.querySelector('[role="tooltip"]')!.textContent]).toEqual([true, 'Le texte×']);
    await survoler(false); expect(ouverte()).toBe(false);
    await survoler(true); await cliquer(bouton()); await survoler(false);
    expect(ouverte()).toBe(true);
    await cliquer(container.querySelector<HTMLButtonElement>('.svv-pil-ib-fermer')!);
    expect(ouverte()).toBe(false);
  });
  it('avec l’option, au toucher (survol simulé puis clic) : un toucher ouvre, le suivant ferme ; Échap ferme', async () => {
    await rendre(true);
    await survoler(true); await cliquer(bouton()); expect(ouverte()).toBe(true);
    await cliquer(bouton()); expect(ouverte()).toBe(false);
    await survoler(true); await cliquer(bouton());
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(ouverte()).toBe(false);
  });
});
