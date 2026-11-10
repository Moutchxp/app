import type { Metadata } from 'next';
import { THEME_DEFAUT } from '../lib/admin/theme';
import { modeRecette, modeReelLocal, TEXTE_MODE_REEL } from '../lib/recette/mode';

/** L'interface admin ne doit jamais être indexée (EX-1, isolation du public). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout du groupe (admin). NE rend PAS de <html>/<body> (fournis par le root layout).
 *
 * LOT 37 — porte la RACINE unique du thème admin : `.svv-adm-root` avec `data-theme`. Scope volontairement RESTREINT à l'admin
 * (jamais `:root`) → le tunnel public et le PDF du certificat ne basculent jamais. Le script anti-flash (`SCRIPT_INIT_THEME`, dans le
 * `<head>` du layout racine depuis le 21/10/2026) pose `data-theme` depuis localStorage AVANT le premier paint ;
 * `suppressHydrationWarning` car la valeur réelle (client) diffère du défaut SSR.
 */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="svv-adm-root" data-theme={THEME_DEFAUT} suppressHydrationWarning>
      {/* MODE RECETTE (lot RECETTE-MAC) : bandeau sur TOUTES les pages de l'admin locale, connexion comprise. Jamais en
          production (`modeRecette()` y est toujours faux, cf. app/lib/recette/mode.ts). */}
      {modeRecette() && (
        <div
          id="bandeau-recette"
          role="status"
          style={{ background: 'var(--color-svv-ink)', color: '#fff', padding: '.5rem 1rem', textAlign: 'center', fontWeight: 800, fontSize: '.9rem', letterSpacing: '.02em' }}
        >
          RECETTE — aucun envoi réel
          <span style={{ fontWeight: 400 }}> · mails, agenda et Drive interceptés · </span>
          <a href="/admin/recette" style={{ color: '#fff', textDecoration: 'underline' }}>boîte de test</a>
        </div>
      )}
      {/* 🔴 Arno (11/11/2026) — HORS mode recette sur une machine qui n'est pas la production (le Mac) : un bandeau ROUGE, sur TOUTES les
          pages de l'admin, connexion comprise. Jamais en production (`modeReelLocal()` y est toujours faux, cf. app/lib/recette/mode.ts). */}
      {modeReelLocal() && (
        <div
          id="bandeau-mode-reel"
          role="alert"
          data-bandeau-mode-reel
          style={{ background: '#b30000', color: '#fff', padding: '.6rem 1rem', textAlign: 'center', fontWeight: 900, fontSize: '.95rem', letterSpacing: '.02em' }}
        >
          {TEXTE_MODE_REEL}
          <span style={{ fontWeight: 400 }}> · pour travailler sans effet réel, relancez le site avec « npm run recette »</span>
        </div>
      )}
      {children}
    </div>
  );
}
