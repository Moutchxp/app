// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LigneFiltresEvenements } from './LigneFiltresEvenements';
import { basculer, LIGNE_PAR_DEFAUT, type EtatLigne } from '../../../../lib/gestion/ligneFiltresEvenements';

/** 🔴🔴 Arno (27/11/2026, 09h48, point 3) — la rangée « OUVERT PAR », même style que PRIORITÉ / ÉTAT / MONGA. Vrai composant. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const OUVREURS = [{ cle: 'ouvert:u2', mot: 'Arnaud JOREL', n: 5 }, { cle: 'ouvert:auto', mot: 'Automatique', n: 0 }, { cle: 'ouvert:nr', mot: 'Non renseigné', n: 1 }];
const IDS = { 'ouvert:u2': [1, 2, 3, 4, 5], 'ouvert:auto': [], 'ouvert:nr': [6] };
const rendre = (etat: EtatLigne, onBasculer = vi.fn()) => {
  act(() => { root.render(createElement(LigneFiltresEvenements, { etat, ids: IDS, ouvreurs: OUVREURS, onBasculer, onTri: vi.fn(), onReinitialiser: vi.fn(), boutonsNewUrgent: null })); });
  return onBasculer;
};

describe('la rangée « OUVERT PAR »', () => {
  it('un cadre de famille comme les autres : « Tous » allumé, un bouton par auteur avec son nombre, Automatique, Non renseigné', () => {
    rendre(LIGNE_PAR_DEFAUT);
    const fam = container.querySelector('[role="group"][aria-label="Ouvert par"]') as HTMLElement;
    expect(fam.className).toBe('lfe-fam lfe-fam--ouvreurs');
    expect(fam.querySelector('.lfe-mot')?.textContent).toBe('Ouvert par');
    expect([...fam.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]))
      .toEqual([['Tous', 'true'], ['Arnaud JOREL5', 'false'], ['Automatique0', 'false'], ['Non renseigné1', 'false']]);
    expect([...fam.querySelectorAll('button')].every((b) => b.className.startsWith('gpil'))).toBe(true);
  });
  it('un clic remonte la clé ; le choix s’allume ; « Tous » s’éteint', () => {
    const on = rendre(LIGNE_PAR_DEFAUT);
    act(() => { (container.querySelector('[data-lfe-ouvreur="ouvert:u2"] button') as HTMLButtonElement).click(); });
    expect(on).toHaveBeenCalledWith('ouvert:u2');
    rendre(basculer(LIGNE_PAR_DEFAUT, 'ouvert:u2'));
    expect((container.querySelector('[data-lfe-ouvreur="ouvert:u2"] button') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('button[data-lfe-ouvreur="ouvert-tous"]') as HTMLElement).getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain('Réinitialiser');
  });
});
