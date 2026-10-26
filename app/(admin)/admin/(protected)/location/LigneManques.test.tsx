// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CSS_LIGNE_MANQUES, LigneManques } from './LigneManques';

/**
 * Arno (26/10/2026) — « Reste à renseigner » dans la barre du bas des formulaires Location : UNE ligne avec le compteur,
 * coupée par « … » ; la liste complète dans une bulle au-dessus de la barre, ouvrable au survol, au toucher et au clavier,
 * refermée par Échap ou un toucher ailleurs ; rien quand la liste est vide.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const MANQUES = ['Honoraires propriétaire : le montant (€ HT), 0 si aucun', 'Dépôt de garantie : conservé ou reversé', 'Mode de règlement : Chèque, Virement ou Autre'];
const rendre = (manques: readonly string[]) => act(() => {
  root.render(createElement('div', { className: 'loc-collant', 'data-collant': '' },
    createElement(LigneManques, { manques }), createElement('button', { type: 'button', 'data-ailleurs': '' }, 'Enregistrer')));
});
const ligne = () => container.querySelector('[data-collant] .loc-manques') as HTMLElement;
const declencheur = () => container.querySelector('[data-manques-declencheur]') as HTMLButtonElement;
const bulle = () => container.querySelector('[data-manques-bulle]') as HTMLElement;
const ouverte = () => bulle().hasAttribute('data-ouvert');

describe('« Reste à renseigner » : une ligne, la liste dans une bulle', () => {
  it('UNE ligne : le compteur en tête, calculé sur la même liste que le texte ; la bulle n’y est pas mêlée', () => {
    rendre(MANQUES);
    expect(ligne().textContent).toBe(`Reste à renseigner (3) : ${MANQUES.join(' · ')}.`);
    expect(ligne().querySelector('ul')).toBeNull();
  });

  it('la liste COMPLÈTE est présente pour la bulle, en puces, avec le même compteur', () => {
    rendre(MANQUES);
    expect([...bulle().querySelectorAll('li')].map((li) => li.textContent)).toEqual(MANQUES);
    expect(bulle().textContent).toContain('Reste à renseigner (3)');
    expect(declencheur().getAttribute('aria-controls')).toBe(bulle().id);
  });

  it('s’ouvre au TOUCHER (clic), se referme en touchant ailleurs', async () => {
    rendre(MANQUES);
    expect(ouverte()).toBe(false);
    await act(async () => { declencheur().click(); });
    expect(ouverte()).toBe(true);
    expect(declencheur().getAttribute('aria-expanded')).toBe('true');
    await act(async () => { container.querySelector('[data-ailleurs]')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(ouverte()).toBe(false);
  });

  it('s’ouvre au FOCUS clavier, se referme avec Échap', async () => {
    rendre(MANQUES);
    await act(async () => { declencheur().focus(); });
    expect(ouverte()).toBe(true);
    await act(async () => { declencheur().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(ouverte()).toBe(false);
  });

  it('Échap referme aussi une bulle ouverte au toucher', async () => {
    rendre(MANQUES);
    await act(async () => { declencheur().click(); });
    await act(async () => { declencheur().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(ouverte()).toBe(false);
  });

  it('rien n’est rendu quand la liste est vide', () => {
    rendre([]);
    expect(container.querySelector('[data-manques-zone]')).toBeNull();
    expect(container.querySelector('.loc-manques')).toBeNull();
  });

  it('la feuille : une ligne coupée par « … », 44 px, bulle superposée AU-DESSUS, couleurs en jetons --color-svv-* seulement', () => {
    const css = CSS_LIGNE_MANQUES.replace(/\s+/g, ' ');
    expect(css).toContain('white-space:nowrap');
    expect(css).toContain('text-overflow:ellipsis');
    expect(css).toContain('min-height:44px');
    expect(css).toContain('position:absolute');
    expect(css).toContain('bottom:calc(100% + 10px)');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    for (const v of css.match(/var\(--[a-z0-9-]+\)/g) ?? []) expect(v).toMatch(/^var\(--color-svv-/);
  });
});
