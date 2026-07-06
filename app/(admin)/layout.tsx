import type { Metadata } from 'next';

/** L'interface admin ne doit jamais être indexée (EX-1, isolation du public). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout du groupe (admin). NE rend PAS de <html>/<body> : le root layout
 * (`app/layout.tsx`) les fournit déjà. Simple passe-plat.
 */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
