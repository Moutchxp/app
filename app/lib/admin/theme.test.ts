import { describe, it, expect } from 'vitest';
import {
  THEMES,
  THEME_DEFAUT,
  CLE_STOCKAGE_THEME,
  LIBELLE_THEME,
  estThemeValide,
  themeDepuisStockage,
  SCRIPT_INIT_THEME,
} from './theme';

/**
 * LOT 37 — logique PURE du thème admin : trois choix, défaut = système, lecture robuste du stockage (persistance), script anti-flash.
 */
describe('theme — choix et défaut', () => {
  it('expose exactement Clair / Sombre / Système', () => {
    expect(THEMES).toEqual(['light', 'dark', 'system']);
    expect(LIBELLE_THEME).toEqual({ light: 'Clair', dark: 'Sombre', system: 'Système' });
  });

  it('le défaut suit le système (prefers-color-scheme)', () => {
    expect(THEME_DEFAUT).toBe('system');
  });

  it('estThemeValide n’accepte QUE les trois valeurs connues', () => {
    for (const t of THEMES) expect(estThemeValide(t)).toBe(true);
    for (const faux of ['', 'DARK', 'auto', 'clair', null, undefined, 42]) expect(estThemeValide(faux)).toBe(false);
  });
});

describe('theme — persistance (lecture du stockage)', () => {
  it('une valeur valide est rendue telle quelle (bascule clair→sombre→système round-trip)', () => {
    expect(themeDepuisStockage('light')).toBe('light');
    expect(themeDepuisStockage('dark')).toBe('dark');
    expect(themeDepuisStockage('system')).toBe('system');
  });

  it('absente / invalide → retombe sur le défaut (jamais un état invalide)', () => {
    expect(themeDepuisStockage(null)).toBe(THEME_DEFAUT);
    expect(themeDepuisStockage(undefined)).toBe(THEME_DEFAUT);
    expect(themeDepuisStockage('n’importe quoi')).toBe(THEME_DEFAUT);
  });
});

describe('theme — script anti-flash', () => {
  it('lit la clé de stockage et pose data-theme sur son parent, borné aux valeurs connues', () => {
    expect(SCRIPT_INIT_THEME).toContain(CLE_STOCKAGE_THEME);
    expect(SCRIPT_INIT_THEME).toContain('setAttribute');
    expect(SCRIPT_INIT_THEME).toContain('data-theme');
    // repli sûr : le défaut est écrit si la valeur stockée n'est pas une des trois.
    expect(SCRIPT_INIT_THEME).toContain(`'${THEME_DEFAUT}'`);
    // best-effort : jamais d'exception qui bloquerait le rendu.
    expect(SCRIPT_INIT_THEME).toContain('try');
  });
});
