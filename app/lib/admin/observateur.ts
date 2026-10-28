/**
 * 🔴 LOT P (Arno, 28/10/2026) — LA RÈGLE DE LA GARDE CENTRALE « OBSERVATEUR » (PUR ; appliquée par `proxy.ts`, une seule fois pour toute
 * l'API admin). Un observateur ne fait QUE lire : toute requête autre que GET / HEAD / OPTIONS est refusée, sauf la liste fermée ci-dessous
 * — son propre mot de passe (sans quoi un mot de passe à changer l'enfermerait dehors). La déconnexion (`/api/admin/session`) est publique
 * au proxy, avant toute session : elle n'atteint jamais cette règle.
 */
export const ECRITURES_PERMISES_OBSERVATEUR: ReadonlySet<string> = new Set(['/api/admin/compte/mot-de-passe']);
const LECTURES = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cette requête d'un compte de ce statut doit-elle être refusée (lecture seule) ? PUR. */
export function ecritureRefuseeObservateur(statut: string | null, methode: string, chemin: string): boolean {
  return statut === 'observateur' && !LECTURES.has(methode.toUpperCase()) && !ECRITURES_PERMISES_OBSERVATEUR.has(chemin);
}
