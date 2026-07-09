'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { liensVisibles } from './menuAdmin';
import type { Perms, RoleAdmin } from '../../../lib/admin/session';

export function Sidebar({ role, perms }: { role: RoleAdmin; perms: Perms }) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  // Filtrage RÔLE D'ABORD (cf. menuAdmin) : administrateur → tout + « Administratif » ; collaborateur → ses perms.
  // CONFORT uniquement ; proxy.ts reste la seule autorité.
  const MODULES = liensVisibles(role, perms);

  async function deconnexion() {
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      window.location.assign('/admin/login');
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <aside className="svv-adm-sidebar">
        <div className="svv-adm-brand-row">
          <Link href="/admin" className="svv-adm-brand" onClick={() => setOuvert(false)}>
            Admin <span className="svv-adm-brand-mark">SVAV®</span>
          </Link>
          <button
            type="button"
            className="svv-adm-burger"
            aria-label={ouvert ? 'Fermer la navigation' : 'Ouvrir la navigation'}
            aria-expanded={ouvert}
            onClick={() => setOuvert((v) => !v)}
          >
            <span className="svv-adm-burger-bars" aria-hidden="true">
              ≡
            </span>
          </button>
        </div>

        <nav className="svv-adm-nav" data-open={ouvert}>
          {MODULES.map((m) => {
            const actif = pathname === m.slug || pathname.startsWith(m.slug + '/');
            return (
              <Link
                key={m.slug}
                href={m.slug}
                className="svv-adm-link"
                data-actif={actif}
                aria-current={actif ? 'page' : undefined}
                onClick={() => setOuvert(false)}
              >
                {m.libelle}
              </Link>
            );
          })}

          <button type="button" className="svv-adm-logout" onClick={deconnexion}>
            Déconnexion
          </button>
        </nav>
      </aside>
    </>
  );
}

const CSS = `
.svv-adm-shell{min-height:100dvh;display:flex;flex-direction:column}
.svv-adm-content{flex:1;display:flex;flex-direction:column;min-width:0}
.svv-adm-bandeau{border-bottom:1px solid var(--color-svv-line);padding:.6rem 1rem;font-size:.8rem;color:var(--color-svv-muted);background:var(--color-svv-field)}
.svv-adm-main{flex:1;padding:1.25rem;min-width:0}

.svv-adm-sidebar{background:#fff;border-bottom:1px solid var(--color-svv-line)}
.svv-adm-brand-row{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1rem;min-height:56px}
.svv-adm-brand{display:inline-flex;align-items:center;gap:.4rem;font-weight:800;color:var(--color-svv-ink);text-decoration:none;font-size:1rem}
.svv-adm-brand-mark{color:var(--color-svv-red)}
.svv-adm-burger{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid var(--color-svv-line);border-radius:.6rem;background:#fff;color:var(--color-svv-ink);cursor:pointer}
.svv-adm-burger-bars{font-size:1.4rem;line-height:1}

.svv-adm-nav{display:none;flex-direction:column;gap:.25rem;padding:.25rem .75rem 1rem}
.svv-adm-nav[data-open="true"]{display:flex}
.svv-adm-link{display:flex;align-items:center;min-height:44px;padding:.5rem .75rem;border-radius:.6rem;color:var(--color-svv-gray);text-decoration:none;font-weight:600;font-size:.95rem}
.svv-adm-link:hover{background:var(--color-svv-field)}
.svv-adm-link[data-actif="true"]{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.svv-adm-logout{display:flex;align-items:center;min-height:44px;margin-top:.5rem;padding:.5rem .75rem;border:1px solid var(--color-svv-line);border-radius:.6rem;background:#fff;color:var(--color-svv-red);font-weight:700;font-size:.95rem;cursor:pointer;text-align:left}
.svv-adm-logout:hover{background:var(--color-svv-field)}

@media (min-width:768px){
  .svv-adm-shell{flex-direction:row}
  .svv-adm-sidebar{width:240px;flex:0 0 240px;border-right:1px solid var(--color-svv-line);border-bottom:0;height:100dvh;position:sticky;top:0;display:flex;flex-direction:column}
  .svv-adm-burger{display:none}
  .svv-adm-nav{display:flex !important}
}
`;
