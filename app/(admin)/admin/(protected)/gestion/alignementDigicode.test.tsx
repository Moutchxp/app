// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChampCodeDigicode, CSS_CHAMP_CODE_DIGICODE, CSS_DIGICODES_COPRO } from './DigicodesCopropriete';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30) « bien aligner le bouton "pas de digicode" ou "plus de digicode" avec le champ à sa gauche, tout au même niveau, sur la même
 * ligne » ; « le compteur 0/15 ne décale plus l'alignement (sous le champ, sans pousser la case) ». jsdom ne calcule pas la mise en page : on éprouve la
 * RÈGLE (le compteur hors du flux, la même marge basse sur chaque élément de la ligne) et la structure ; la mesure au pixel est faite au Chrome.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const regle = (css: string) => css.replace(/\s+/g, ' ');

describe('le compteur « 0/15 » ne pousse plus la case', () => {
  it('posé SOUS le champ, hors du flux (position absolue), dans le libellé du champ (référence relative)', () => {
    const css = regle(CSS_CHAMP_CODE_DIGICODE);
    expect(css).toMatch(/\.ccd-pied\{[^}]*position:absolute;top:100%;left:0;right:0/);
    expect(css).toContain('label:has(> .ccd-pied){position:relative}');
  });
  it('la ligne réserve sa place par la MÊME marge basse sur chacun de ses éléments : fiche copropriété, création de bien, « Modifier un digicode »', () => {
    const css = regle(CSS_CHAMP_CODE_DIGICODE);
    expect(css).toContain('.dcp-code-groupe:has(.ccd-pied) > *,.dcp-ligne:has(> .dcp-champ > .ccd-pied) > *,.dcp-modifier-champs:has(.ccd-pied) > *{margin-bottom:1.25em}');
    expect(CSS_DIGICODES_COPRO.startsWith(CSS_CHAMP_CODE_DIGICODE)).toBe(true); // la feuille de la fiche, de la création de bien et de la fenêtre
  });
  it('le champ garde son compteur et son message « 15 caractères au maximum » (rien n’est retiré)', async () => {
    const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c);
    await act(async () => { r.render(createElement('label', { className: 'dcp-champ' }, createElement(ChampCodeDigicode, { valeur: 'ab1', onCode: () => {} }))); });
    const label = c.querySelector('label')!;
    expect([...label.children].map((x) => x.tagName + (x.className ? `.${x.className}` : ''))).toEqual(['INPUT', 'SPAN.ccd-pied']);
    expect(label.querySelector('[data-ccd-compteur]')?.textContent).toBe('3/15');
    act(() => r.unmount()); c.remove();
  });
});
