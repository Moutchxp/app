/**
 * ══ 🔴 Arno (25/10/2026) — LES ADRESSES DE « PARAMÈTRES LOCATION » (module PUR, lisible du serveur comme du navigateur) ═══════════════
 *   · la MODALE (autres raccourcis de l'application) : `?parametres=<onglet>&apporteur=…&panneau=…` sur la page qui l'ouvre ;
 *   · la PAGE (depuis Outils de suivi) : `/admin/location/outils/parametres?onglet=<onglet>&apporteur=…&panneau=…`.
 * Une ancienne adresse de la modale sur Outils de suivi est redirigée vers la page équivalente : aucun lien cassé.
 */
export const PARAM_MODALE = 'parametres';
export const PARAM_PAGE = 'onglet';
export const OUTILS_SUIVI = '/admin/location/outils';
export const PAGE_PARAMETRES = '/admin/location/outils/parametres';
export const ONGLETS_PARAMETRES = ['destinataires', 'baremes', 'archivage', 'apporteurs', 'commissions'] as const;
export type OngletParametres = (typeof ONGLETS_PARAMETRES)[number];

const un = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** L'onglet lu dans une adresse (valeur inconnue : null). PUR. */
export function ongletDe(v: string | string[] | undefined): OngletParametres | null {
  const o = un(v);
  return o !== null && (ONGLETS_PARAMETRES as readonly string[]).includes(o) ? (o as OngletParametres) : null;
}

/** L'ancienne adresse de la modale sur Outils de suivi → la page équivalente ; null : rien à rediriger. PUR. */
export function adressePageDepuisModale(p: Record<string, string | string[] | undefined>): string | null {
  if (un(p[PARAM_MODALE]) === null) return null;
  const q = new URLSearchParams();
  q.set(PARAM_PAGE, ongletDe(p[PARAM_MODALE]) ?? 'destinataires');
  for (const k of ['apporteur', 'panneau'] as const) { const v = un(p[k]); if (v !== null && v !== '') q.set(k, v); }
  return `${PAGE_PARAMETRES}?${q.toString()}`;
}
