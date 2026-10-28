/**
 * 🔴 TUILE « TRANSACTION », LOT L (Arno, 28/10/2026) — LE FIL D'ARIANE de chaque niveau (« Transaction › Transaction › CRITERIMMO »), en
 * plus du « ← Retour » de l'en-tête. Composant SERVEUR, sans état ; liens ordinaires de 44 px ; le niveau courant n'est pas un lien
 * (`aria-current`). Jetons de couleur seulement.
 */
export interface EtapeAriane { libelle: string; href?: string }

const CSS_ARIANE = `
.trx-ariane{margin:4px 0 0}
.trx-ariane ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;font-size:.9rem}
.trx-ariane li{display:inline-flex;align-items:center;gap:6px;min-width:0}
.trx-ariane a{display:inline-flex;align-items:center;min-height:44px;color:var(--color-svv-red);font-weight:700;text-decoration:underline}
.trx-ariane [aria-current]{display:inline-flex;align-items:center;min-height:44px;font-weight:800;color:var(--color-svv-ink)}
.trx-ariane-sep{color:var(--color-svv-muted)}
`;

export function FilAriane({ etapes }: { etapes: readonly EtapeAriane[] }) {
  return (
    <nav className="trx-ariane" aria-label="Fil d’Ariane" data-fil-ariane>
      <style>{CSS_ARIANE}</style>
      <ol>
        {etapes.map((e, i) => (
          <li key={`${e.libelle}-${i}`}>
            {i > 0 && <span className="trx-ariane-sep" aria-hidden="true">›</span>}
            {e.href !== undefined && i < etapes.length - 1 ? <a href={e.href}>{e.libelle}</a> : <span aria-current="page">{e.libelle}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Les étapes, écrites une fois (relues par les tests). */
export const ARIANE = {
  accueil: [{ libelle: 'Transaction' }],
  ventes: [{ libelle: 'Transaction', href: '/admin/transaction' }, { libelle: 'Transaction (ventes)' }],
  criterimmo: [{ libelle: 'Transaction', href: '/admin/transaction' }, { libelle: 'Transaction (ventes)', href: '/admin/transaction/ventes' }, { libelle: 'CRITERIMMO' }],
  macj: [{ libelle: 'Transaction', href: '/admin/transaction' }, { libelle: 'Transaction (ventes)', href: '/admin/transaction/ventes' }, { libelle: 'MACJ' }],
  gestion: [{ libelle: 'Transaction', href: '/admin/transaction' }, { libelle: 'Gestion' }],
  global: [{ libelle: 'Transaction', href: '/admin/transaction' }, { libelle: 'CA global' }],
} as const satisfies Record<string, readonly EtapeAriane[]>;
