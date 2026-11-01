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
/* Arno (01/11/2026) — LE TITRE DE PAGE (h1) DU SUIVI CHIFFRE D'AFFAIRES EN CAPITALES : la règle unique du module, posée par le fil d'Ariane
   (présent dans l'en-tête de ses dix pages, et d'aucune autre). Le texte ne change pas (lecteurs d'écran, liens) ; sous-titre, fil
   d'Ariane, onglets et menu gardent leur casse. */
.svv-page-head:has([data-fil-ariane]) .svv-page-title{text-transform:uppercase}
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
// 🔴 LOT DM (Arno) — « Suivi Chiffre d'affaires » (ex-« Transaction ») › « Transaction vente » › CRITERIMMO | MACJ | FUSION ; les adresses ne changent pas.
const SUIVI = 'Suivi Chiffre d’affaires';
/** Arno (01/11/2026) — le nom de la page /admin/transaction/ventes (ex-« Transaction vente »), écrit une fois : son titre, sa case sur
 *  « Suivi Chiffre d'affaires », le maillon du fil d'Ariane de ses pages filles. */
export const TITRE_VENTES = 'Transactions ventes';
const VENTE = TITRE_VENTES;
const LOC_GESTION = 'Location & Gestion';
/** Arno (01/11/2026) — le nom de la page /admin/transaction/fusion, écrit une fois : son titre, son fil d'Ariane, sa case sur « Transactions ventes ». */
export const TITRE_FUSION_VENTE = 'FUSION VENTES CRITERIMMO & MACJ';
export const ARIANE = {
  accueil: [{ libelle: SUIVI }],
  ventes: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: VENTE }],
  criterimmo: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: VENTE, href: '/admin/transaction/ventes' }, { libelle: 'CRITERIMMO' }],
  macj: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: VENTE, href: '/admin/transaction/ventes' }, { libelle: 'MACJ' }],
  fusion: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: VENTE, href: '/admin/transaction/ventes' }, { libelle: TITRE_FUSION_VENTE }],
  // 🔴 LOT DX (Arno) — « Location & Gestion » › Location | Gestion (la page existante) | FUSION Location & Gestion
  locationGestion: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: LOC_GESTION }],
  location: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: LOC_GESTION, href: '/admin/transaction/location-gestion' }, { libelle: 'Location' }],
  gestion: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: LOC_GESTION, href: '/admin/transaction/location-gestion' }, { libelle: 'Gestion' }],
  fusionLocationGestion: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: LOC_GESTION, href: '/admin/transaction/location-gestion' }, { libelle: 'FUSION Location & Gestion' }],
  global: [{ libelle: SUIVI, href: '/admin/transaction' }, { libelle: 'CA global' }],
} as const satisfies Record<string, readonly EtapeAriane[]>;
