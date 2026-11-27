// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LigneFiltresEvenements } from './LigneFiltresEvenements';
import { choisirOuvreurs, LIGNE_PAR_DEFAUT, type EtatLigne } from '../../../../lib/gestion/ligneFiltresEvenements';

/**
 * 🔴🔴 Arno (27/11/2026, 11h01, point 2) — « une fenêtre qui s'ouvre avec tous les utilisateurs qui ont accès aux tuiles Gestion et Location » : un
 * seul bouton « Ouvert par : Tous ▾ », une fenêtre à cases (plusieurs), « Tout sélectionner » / « Aucun », recherche au-delà de 8, Appliquer / Annuler.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const COLLEGUES = [{ cle: 'ouvert:u9', mot: 'Service GESTION', n: 0 }, { cle: 'ouvert:u2', mot: 'Arnaud JOREL', n: 6 },
  { cle: 'ouvert:u6', mot: 'Cédric JULLIEN', n: 0 }, { cle: 'ouvert:u5', mot: 'Jean-Baptiste PONS', n: 0 }];
const rendre = (etat: EtatLigne, collegues = COLLEGUES, onOuvreurs = vi.fn()) => {
  act(() => { root.render(createElement(LigneFiltresEvenements, { etat, ids: {}, ouvreurs: collegues, onOuvreurs, onBasculer: vi.fn(), onTri: vi.fn(), onReinitialiser: vi.fn(), boutonsNewUrgent: null })); });
  return onOuvreurs;
};
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = (s: string | HTMLElement) => act(() => { (typeof s === 'string' ? $(s) : s).click(); });
const cases = () => [...document.querySelectorAll('[data-fop-collegue]')].map((l) => [l.querySelector('.fop-nom')!.textContent, l.querySelector('.fop-n')!.textContent, (l.querySelector('input') as HTMLInputElement).checked]);

describe('« Ouvert par : Tous ▾ » et sa fenêtre', () => {
  it('un seul bouton, dans le cadre de famille ; la fenêtre liste TOUS les collègues (même à 0), par nom, avec leur nombre', () => {
    rendre(LIGNE_PAR_DEFAUT);
    const fam = $('[role="group"][aria-label="Ouvert par"]');
    expect([...fam.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Ouvert par : Tous ▾']);
    clic('[data-lfe-ouvert-par]');
    expect($('[data-fop]').getAttribute('role')).toBe('dialog');
    expect(cases()).toEqual([['Service GESTION', '0', false], ['Arnaud JOREL', '6', false], ['Cédric JULLIEN', '0', false], ['Jean-Baptiste PONS', '0', false]]);
    expect(document.querySelector('[data-fop-recherche]')).toBeNull(); // 4 noms : pas de recherche
    expect([$('[data-fop-appliquer]').className, $('[data-fop-annuler]').className].every((c) => c.includes('fop-plein'))).toBe(true);
  });
  it('plusieurs cases, « Tout sélectionner » / « Aucun », Appliquer remonte la sélection (dans l’ordre de la liste) ; Annuler ne change rien', () => {
    const on = rendre(LIGNE_PAR_DEFAUT);
    clic('[data-lfe-ouvert-par]');
    clic(document.querySelector('[data-fop-collegue="ouvert:u5"] input') as HTMLElement);
    clic(document.querySelector('[data-fop-collegue="ouvert:u2"] input') as HTMLElement);
    clic('[data-fop-appliquer]');
    expect(on).toHaveBeenLastCalledWith(['ouvert:u2', 'ouvert:u5']);
    expect(document.querySelector('[data-fop]')).toBeNull();
    clic('[data-lfe-ouvert-par]'); clic('[data-fop-tout]');
    expect(cases().every((c) => c[2] === true)).toBe(true);
    clic('[data-fop-aucun]');
    expect(cases().every((c) => c[2] === false)).toBe(true);
    clic('[data-fop-annuler]');
    expect([on.mock.calls.length, document.querySelector('[data-fop]')]).toEqual([1, null]);
  });
  it('après application, le bouton dit le choix ; la fenêtre reprend les cases cochées', () => {
    rendre(choisirOuvreurs(LIGNE_PAR_DEFAUT, ['ouvert:u2']));
    expect($('[data-lfe-ouvert-par]').textContent).toBe('Ouvert par : Arnaud JOREL ▾');
    expect($('[data-lfe-ouvert-par]').className).toContain('gpil--actif');
    rendre(choisirOuvreurs(LIGNE_PAR_DEFAUT, ['ouvert:u2', 'ouvert:u5']));
    expect($('[data-lfe-ouvert-par]').textContent).toBe('Ouvert par : 2 collègues ▾');
    clic('[data-lfe-ouvert-par]');
    expect(cases().filter((c) => c[2]).map((c) => c[0])).toEqual(['Arnaud JOREL', 'Jean-Baptiste PONS']);
  });
  it('plus de 8 noms : un champ de recherche (accents et majuscules ignorés)', () => {
    const neuf = Array.from({ length: 9 }, (_, i) => ({ cle: `ouvert:u${i + 1}`, mot: i === 4 ? 'Élodie ÉMERY' : `Collègue ${i + 1}`, n: 0 }));
    rendre(LIGNE_PAR_DEFAUT, neuf);
    clic('[data-lfe-ouvert-par]');
    const champ = $('[data-fop-recherche]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'emery'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(cases().map((c) => c[0])).toEqual(['Élodie ÉMERY']);
  });
});
