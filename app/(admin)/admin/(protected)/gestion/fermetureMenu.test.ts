// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fermerQuandLaPagePerdLeFocus } from './fermetureMenu';

/** 🔴 LOT GESTION-MENU-HISTORIQUE — la page perd le focus (clic dans un corps de mail, une iframe) : le menu se referme. */
describe('fermerQuandLaPagePerdLeFocus', () => {
  it('ferme sur `blur` de la fenêtre, puis se détache', () => {
    const fermer = vi.fn();
    const lacher = fermerQuandLaPagePerdLeFocus(fermer);
    window.dispatchEvent(new Event('blur'));
    expect(fermer).toHaveBeenCalledTimes(1);
    lacher();
    window.dispatchEvent(new Event('blur'));
    expect(fermer).toHaveBeenCalledTimes(1);
  });
  it('🔴 la même règle pour les menus et bulles qui côtoient un corps de mail', () => {
    for (const f of ['BoutonHistoriqueMail', 'MenuDiscret', 'CompteurBiensMail', 'InfoBien', 'PictoDansLeDrive', 'FriseAvancement', 'HistoriqueDuBien']) {
      expect(readFileSync(`app/(admin)/admin/(protected)/gestion/${f}.tsx`, 'utf8'), f).toContain('fermerQuandLaPagePerdLeFocus(');
    }
  });
});
