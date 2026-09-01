import type { Metadata } from 'next';
import { SCRIPT_INIT_THEME, THEME_DEFAUT } from '../lib/admin/theme';

/** L'interface admin ne doit jamais être indexée (EX-1, isolation du public). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout du groupe (admin). NE rend PAS de <html>/<body> (fournis par le root layout).
 *
 * LOT 37 — porte la RACINE unique du thème admin : `.svv-adm-root` avec `data-theme`. Scope volontairement RESTREINT à l'admin
 * (jamais `:root`) → le tunnel public et le PDF du certificat ne basculent jamais. Le `<script>` inline pose `data-theme` depuis
 * localStorage AVANT le premier paint (anti-flash) ; `suppressHydrationWarning` car la valeur réelle (client) diffère du défaut SSR.
 */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="svv-adm-root" data-theme={THEME_DEFAUT} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_INIT_THEME }} />
      {children}
    </div>
  );
}
