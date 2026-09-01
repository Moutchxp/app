/**
 * LOT 37 — THÈME clair/sombre de l'admin. Préférence PAR NAVIGATEUR (localStorage), pas un réglage moteur : ce n'est pas une variable
 * de config_veille (aucune migration, aucun ParamVeille) — c'est un confort d'affichage propre à chaque poste. PUR (aucune I/O ici).
 *
 * Trois choix : 'light' | 'dark' | 'system'. 'system' laisse la media query `prefers-color-scheme` décider (défaut). L'attribut
 * `data-theme` posé sur `.svv-adm-root` porte la valeur choisie ; le CSS scopé à `.svv-adm-root` bascule les tokens (jamais `:root`
 * → le public et le PDF du certificat restent clairs).
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemeChoisi = (typeof THEMES)[number];

/** DÉFAUT : suit le réglage système (prefers-color-scheme). */
export const THEME_DEFAUT: ThemeChoisi = 'system';

/** Clé localStorage de la préférence (persistée entre rechargements). */
export const CLE_STOCKAGE_THEME = 'svv-theme';

export const LIBELLE_THEME: Record<ThemeChoisi, string> = { light: 'Clair', dark: 'Sombre', system: 'Système' };

export function estThemeValide(v: unknown): v is ThemeChoisi {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v);
}

/** Valeur stockée → thème sûr : toute valeur absente/inconnue retombe sur le défaut (jamais un état invalide). PUR. */
export function themeDepuisStockage(brut: string | null | undefined): ThemeChoisi {
  return estThemeValide(brut) ? brut : THEME_DEFAUT;
}

/**
 * Script INLINE « anti-flash » (posé dans le layout admin AVANT le premier paint) : lit la préférence et pose `data-theme` sur son
 * élément parent (`.svv-adm-root`) tout de suite, pour qu'aucun flash clair n'apparaisse avant l'hydratation. Best-effort (try/catch).
 */
export const SCRIPT_INIT_THEME =
  `(function(){try{var p=localStorage.getItem('${CLE_STOCKAGE_THEME}');` +
  `var t=(p==='light'||p==='dark'||p==='system')?p:'${THEME_DEFAUT}';` +
  `var el=document.currentScript&&document.currentScript.parentElement;` +
  `if(el)el.setAttribute('data-theme',t);}catch(e){}})();`;
