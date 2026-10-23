// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ListeChoix, type OptionChoix } from './ListeChoix';

/**
 * 🔴 Arno (23/10/2026) — la liste de choix d'un collègue : sous le champ, rouge (pas de bleu), coche sur le choix, clavier
 * (flèches, Entrée, Échap), recherche par frappe, rôles ARIA ; un compte désactivé seulement s'il est le choix en cours.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const OPTIONS: OptionChoix[] = [{ id: 7, libelle: 'Alice Martin' }, { id: 4, libelle: 'Bruno Petit' }, { id: 9, libelle: 'Bertrand Roy' }, { id: 3, libelle: 'Ancien Compte', actif: false }];
let container: HTMLDivElement;
let root: Root;
let choisi: string[];
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); choisi = []; });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

function Banc({ depart }: { depart: string }) {
  const [v, setV] = useState(depart);
  return createElement('label', null, 'Collègue', createElement(ListeChoix, { options: OPTIONS, valeur: v, onChange: (x: string) => { choisi.push(x); setV(x); }, libelle: 'Collègue', donnees: { 'data-champ': '' } }));
}
const monter = async (depart = '') => { await act(async () => { root.render(createElement(Banc, { depart })); }); };
const champ = () => container.querySelector('[data-champ]') as HTMLButtonElement;
const touche = async (key: string) => { await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
const options = () => [...container.querySelectorAll('[role="option"]')].map((o) => ({ textContent: o.querySelector('span:last-child')?.textContent }));

describe('🔴 ListeChoix', () => {
  it('rôles ARIA ; s’ouvre au clic ; les comptes désactivés n’y sont pas ; un clic choisit et referme', async () => {
    await monter();
    expect(champ().getAttribute('role')).toBe('combobox');
    expect(champ().getAttribute('aria-expanded')).toBe('false');
    await act(async () => { champ().click(); });
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(options().map((o) => o.textContent)).toEqual(['— choisir —', 'Alice Martin', 'Bruno Petit', 'Bertrand Roy']);
    await act(async () => { (container.querySelector('[data-option="4"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(choisi).toEqual(['4']);
    expect(container.querySelector('[role="listbox"]')).toBeNull();   // l'activation du <label> ne la rouvre pas
    expect(champ().textContent).toBe('Bruno Petit');
    await act(async () => { champ().click(); });
    const sel = container.querySelector('[aria-selected="true"]')!;
    expect(sel.getAttribute('data-option')).toBe('4');
    expect(sel.className).toContain('lch-option--choisi');
    expect(sel.querySelector('.lch-coche')?.textContent).toBe('✓');
    // Arno (23/10/2026) : le surlignage est VERT — celui de l'entrée active du menu (vert pâle / vert foncé) ; le contour reste rouge.
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('.lch-liste>.lch-option--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(css).toContain('.lch-liste>.lch-option--choisi{font-weight:700;color:var(--color-svv-green-ink)}');
    expect(css).toContain('.lch-coche{width:16px;flex:0 0 16px;color:var(--color-svv-green-ink)');
    expect(css).toContain('.lch-champ[aria-expanded="true"]{outline:2px solid var(--color-svv-red)');
    // Arno (24/10/2026) — le rouge n'existe que sous la teinte « rouge » (bloc « Suivi commercial ») ; par défaut, la liste n'en a pas.
    expect(css.split('\n').filter((l) => /red-soft|red-dark/.test(l)).every((l) => l.startsWith('.lch--rouge '))).toBe(true);
    expect(container.querySelector('.lch')?.className).toBe('lch');
  });

  it('clavier : flèches, Entrée, Échap (ne ferme que la liste) ; recherche par frappe', async () => {
    await monter();
    let echapPasse = false;
    const ecoute = (e: KeyboardEvent): void => { if (e.key === 'Escape') echapPasse = true; };
    window.addEventListener('keydown', ecoute);
    await touche('ArrowDown');                      // ouvre, sur « — choisir — »
    expect(champ().getAttribute('aria-expanded')).toBe('true');
    await touche('ArrowDown'); await touche('ArrowDown');
    expect(container.querySelector('.lch-option--actif')?.textContent).toContain('Bruno Petit');
    await touche('Enter');
    expect(choisi).toEqual(['4']);
    await touche('ArrowDown');
    await touche('Escape');
    expect(champ().getAttribute('aria-expanded')).toBe('false');
    expect(echapPasse).toBe(false);                 // la fenêtre autour ne se ferme pas
    await touche('b'); await touche('e');            // « be… » → Bertrand Roy
    expect(container.querySelector('.lch-option--actif')?.textContent).toContain('Bertrand Roy');
    await touche('Enter');
    expect(choisi.at(-1)).toBe('9');
    window.removeEventListener('keydown', ecoute);
  });

  it('un compte désactivé déjà choisi : montré « (désactivé) », jamais choisissable', async () => {
    await monter('3');
    expect(champ().textContent).toBe('Ancien Compte (désactivé)');
    await act(async () => { champ().click(); });
    const d = container.querySelector('[data-option="3"]')!;
    expect(d.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { d.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(choisi).toEqual([]);
  });
});
