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
export const ONGLETS_PARAMETRES = ['destinataires', 'baremes', 'archivage', 'apporteurs', 'commissions', 'indices'] as const;
export type OngletParametres = (typeof ONGLETS_PARAMETRES)[number];
/**
 * 🔴 Arno (05/11/2026) — les SOUS-ONGLETS de « Destinataires mails » : `&liste=preavis` ou `&liste=sorties` ; absent (ou inconnu) :
 * « Nouvelles locations », ouvert par défaut. `?parametres=destinataires` garde donc exactement son sens d'avant.
 */
export const PARAM_LISTE = 'liste';
export const LISTES_DESTINATAIRES = ['preavis', 'sorties'] as const;
export type ListeDestinataires = (typeof LISTES_DESTINATAIRES)[number];

const un = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** L'onglet lu dans une adresse (valeur inconnue : null). PUR. */
export function ongletDe(v: string | string[] | undefined): OngletParametres | null {
  const o = un(v);
  return o !== null && (ONGLETS_PARAMETRES as readonly string[]).includes(o) ? (o as OngletParametres) : null;
}

/** Le sous-onglet de « Destinataires mails » lu dans une adresse (absent, inconnu : null = « Nouvelles locations »). PUR. */
export function listeDe(v: string | string[] | undefined | null): ListeDestinataires | null {
  const o = Array.isArray(v) ? v[0] ?? null : v ?? null;
  return o !== null && (LISTES_DESTINATAIRES as readonly string[]).includes(o) ? (o as ListeDestinataires) : null;
}

/** L'ancienne adresse de la modale sur Outils de suivi → la page équivalente ; null : rien à rediriger. PUR. */
export function adressePageDepuisModale(p: Record<string, string | string[] | undefined>): string | null {
  if (un(p[PARAM_MODALE]) === null) return null;
  const q = new URLSearchParams();
  q.set(PARAM_PAGE, ongletDe(p[PARAM_MODALE]) ?? 'destinataires');
  for (const k of [PARAM_LISTE, 'apporteur', 'panneau'] as const) { const v = un(p[k]); if (v !== null && v !== '') q.set(k, v); }
  return `${PAGE_PARAMETRES}?${q.toString()}`;
}
