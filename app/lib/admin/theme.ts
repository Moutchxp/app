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
 * Script INLINE « anti-flash », posé dans le `<head>` du layout RACINE (app/layout.tsx) : il s'exécute pendant l'analyse du HTML,
 * AVANT que `.svv-adm-root` n'existe. Il observe donc l'arrivée de toute racine admin (MutationObserver : le rappel joue en
 * micro-tâche, avant le premier paint) et y pose `data-theme` depuis la préférence. Il reste à l'écoute : une racine admin créée
 * côté client (navigation depuis une page publique) reçoit aussi le thème choisi. Best-effort (try/catch).
 *
 * 21/10/2026 — il était rendu DANS `.svv-adm-root` (layout admin) : à chaque montage côté client, React créait la balise sans
 * l'exécuter et signalait « Encountered a script tag while rendering React component » ; le thème choisi n'était alors pas posé.
 * `next/script` en `beforeInteractive` n'est pas retenu : un script inline y est différé jusqu'au chargement de Next (flash).
 */
export const SCRIPT_INIT_THEME =
  `(function(){try{var lire=function(){var p=null;try{p=localStorage.getItem('${CLE_STOCKAGE_THEME}');}catch(e){}` +
  `return (p==='light'||p==='dark'||p==='system')?p:'${THEME_DEFAUT}';};` +
  `var poser=function(n){if(!n||n.nodeType!==1)return;var t=null;` +
  `if(n.classList.contains('svv-adm-root')){t=lire();n.setAttribute('data-theme',t);}` +
  `var l=n.getElementsByClassName('svv-adm-root');for(var i=0;i<l.length;i++){if(t===null)t=lire();l[i].setAttribute('data-theme',t);}};` +
  `new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var a=ms[i].addedNodes;for(var j=0;j<a.length;j++)poser(a[j]);}})` +
  `.observe(document.documentElement,{childList:true,subtree:true});poser(document.documentElement);}catch(e){}})();`;
