// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { racineTheme, appliquerThemeSur, lireThemePersiste, persisterTheme } from './themeDom';
import { CLE_STOCKAGE_THEME, THEME_DEFAUT } from '../../../lib/admin/theme';

/**
 * LOT 37 — effets DOM/stockage du thème : la bascule pose `data-theme` sur la racine admin, la préférence est persistée et relue
 * (persistance après rechargement), toute valeur invalide retombe sur le défaut. Pas de rendu React ici : on teste la couche d'effets.
 */
describe('themeDom — bascule et persistance', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="svv-adm-root" data-theme="system"></div>';
    localStorage.clear();
  });

  it('racineTheme trouve bien .svv-adm-root', () => {
    expect(racineTheme()).not.toBeNull();
    expect(racineTheme()?.classList.contains('svv-adm-root')).toBe(true);
  });

  it('bascule clair → sombre → système : data-theme suit à chaque choix', () => {
    const root = racineTheme();
    appliquerThemeSur(root, 'light');
    expect(root?.getAttribute('data-theme')).toBe('light');
    appliquerThemeSur(root, 'dark');
    expect(root?.getAttribute('data-theme')).toBe('dark');
    appliquerThemeSur(root, 'system');
    expect(root?.getAttribute('data-theme')).toBe('system');
  });

  it('la bascule GÈLE les transitions (classe posée synchrone avec l’attribut → aucun fondu de couleur)', () => {
    const root = racineTheme();
    appliquerThemeSur(root, 'dark');
    // Au moment de la bascule, la classe de gel est présente ET l'attribut est déjà à jour (pose synchrone).
    expect(root?.classList.contains('svv-no-transition')).toBe(true);
    expect(root?.getAttribute('data-theme')).toBe('dark');
  });

  it('racine absente → appliquerThemeSur ne jette pas (null-safe)', () => {
    expect(() => appliquerThemeSur(null, 'dark')).not.toThrow();
  });

  it('persistance : persisterTheme écrit, lireThemePersiste relit (round-trip = survit au rechargement)', () => {
    persisterTheme('dark');
    expect(localStorage.getItem(CLE_STOCKAGE_THEME)).toBe('dark');
    expect(lireThemePersiste()).toBe('dark');
  });

  it('stockage vide ou pollué → lireThemePersiste retombe sur le défaut', () => {
    expect(lireThemePersiste()).toBe(THEME_DEFAUT);
    localStorage.setItem(CLE_STOCKAGE_THEME, 'auto-bidon');
    expect(lireThemePersiste()).toBe(THEME_DEFAUT);
  });
});
