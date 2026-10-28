// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixSociete } from './page';

/**
 * 🔴 TRANSACTION, LOT K (Arno, 28/10/2026) — PAGE COMPTES : le champ Société accepte une troisième valeur « CRITERIMMO et MACJ » (règle
 * générique : aucun nom). Sans la 438, elle est montrée grisée (rien ne s'écrit) ; avec elle, elle se choisit comme les deux autres.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const bouton = (v: string) => container.querySelector(`[data-societe="${v}"]`) as HTMLButtonElement;

describe('« Société » : CRITERIMMO, MACJ, CRITERIMMO et MACJ', () => {
  it('trois choix, dans cet ordre ; « CRITERIMMO et MACJ » grisé sans la 438', () => {
    act(() => { root.render(createElement(ChoixSociete, { valeur: null, onChoisir: () => {}, idGroupe: 'g' })); });
    expect([...container.querySelectorAll('[data-societe]')].map((b) => b.textContent)).toEqual(['○CRITERIMMO', '○MACJ', '○CRITERIMMO et MACJ']);
    expect(bouton('les_deux').disabled).toBe(true);
    expect(bouton('macj').disabled).toBe(false);
  });
  it('avec la 438 : se choisit, et se lit enfoncé (● et aria-pressed)', () => {
    const onChoisir = vi.fn();
    act(() => { root.render(createElement(ChoixSociete, { valeur: 'les_deux', onChoisir, idGroupe: 'g', lesDeux: true })); });
    expect(bouton('les_deux').getAttribute('aria-pressed')).toBe('true');
    expect(bouton('les_deux').textContent).toBe('●CRITERIMMO et MACJ');
    act(() => { bouton('criterimmo').click(); });
    expect(onChoisir).toHaveBeenCalledWith('criterimmo');
  });
});
