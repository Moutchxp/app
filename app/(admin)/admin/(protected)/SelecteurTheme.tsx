'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { THEMES, LIBELLE_THEME, type ThemeChoisi } from '../../../lib/admin/theme';
import { racineTheme, appliquerThemeSur, persisterTheme, souscrireTheme, snapshotTheme, snapshotThemeServeur } from './themeDom';

/**
 * LOT 37 — SÉLECTEUR de thème de l'admin (Clair / Sombre / Système). Préférence PAR NAVIGATEUR (localStorage), pas un réglage
 * moteur. Pose `data-theme` sur `.svv-adm-root` → le CSS scopé bascule les tokens. 'system' laisse la media query
 * `prefers-color-scheme` décider (aucun JS à réécouter : le CSS réévalue seul le changement d'OS). Mobile-first (cibles ≥ 40px),
 * la couleur ne porte pas l'info seule (aria-pressed + libellé). Aucune transition de couleur pendant la bascule (cf. themeDom).
 */
export function SelecteurTheme() {
  // Préférence lue depuis le store externe (localStorage) : pas de setState-en-effet, pas de décalage d'hydratation
  // (le serveur et le 1er rendu client voient le défaut, puis le client resynchronise sur la valeur persistée).
  const pref = useSyncExternalStore(souscrireTheme, snapshotTheme, snapshotThemeServeur);

  // Applique le thème au DOM chaque fois que la préférence change (sync d'un système EXTERNE — usage légitime d'un effet).
  // Couvre aussi l'arrivée par navigation interne (le script anti-flash du layout ne joue qu'au chargement initial).
  useEffect(() => {
    appliquerThemeSur(racineTheme(), pref);
  }, [pref]);

  function choisir(v: ThemeChoisi) {
    persisterTheme(v); // émet l'événement → useSyncExternalStore relit → pref se met à jour → l'effet applique au DOM
    appliquerThemeSur(racineTheme(), v); // application immédiate (pas d'attente d'un cycle de rendu)
  }

  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      style={{ display: 'flex', gap: 4, padding: 3, borderRadius: '.6rem', background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)' }}
    >
      {THEMES.map((t) => {
        const actif = pref === t;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={actif}
            onClick={() => choisir(t)}
            style={{
              flex: 1,
              minHeight: 40,
              border: 0,
              borderRadius: '.45rem',
              cursor: 'pointer',
              fontSize: '.8rem',
              fontWeight: actif ? 800 : 600,
              background: actif ? 'var(--color-svv-surface)' : 'transparent',
              color: actif ? 'var(--color-svv-ink)' : 'var(--color-svv-muted)',
              boxShadow: actif ? '0 1px 2px rgba(0,0,0,.12)' : 'none',
            }}
          >
            {LIBELLE_THEME[t]}
          </button>
        );
      })}
    </div>
  );
}
