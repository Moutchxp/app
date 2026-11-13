/**
 * ══ 🔴 Arno (13/11/2026) — LE RETOUR APRÈS CONNEXION ══════════════════════════════════════════════════════════════════════════════
 * Le cookie de session est `SameSite=Strict` (et le reste) : un lien ouvert depuis une AUTRE application (Mail sur iPhone, Gmail…) arrive
 * SANS le cookie, et le garde renvoie à la connexion. La page demandée est donc portée par `?retour=` jusqu'à la connexion, qui y ramène
 * — ou, si la session est en fait valide (la page de connexion, elle, est du même site et reçoit le cookie), y ramène tout de suite.
 * 🔴 SÉCURITÉ : seul un chemin INTERNE à l'admin est accepté (pas d'autre site, pas de `//`, pas de schéma, pas de barre oblique inverse,
 * pas la page de connexion elle-même) : jamais une redirection ouverte. ⚠️ AUCUN IMPORT (pur, partagé entre le garde et la page).
 */
export const PARAM_RETOUR = 'retour';
const LONGUEUR_MAX = 1000;

/** Le chemin de retour s'il est sûr (`/admin…`), sinon null. PUR. */
export function retourSur(x: string | null | undefined): string | null {
  if (typeof x !== 'string' || x.length === 0 || x.length > LONGUEUR_MAX) return null;
  if (!/^\/admin(?:[/?#]|$)/.test(x)) return null;
  if (x.includes('//') || x.includes('\\') || /[\u0000-\u001f\u007f]/.test(x)) return null;
  if (/^\/admin\/login(?:[/?#]|$)/.test(x)) return null;
  return x;
}

/** L'adresse de la connexion qui ramène à `chemin` (chemin + requête de la page demandée) ; sans retour sûr : la connexion seule. PUR. */
export function urlConnexion(chemin: string): string {
  const r = retourSur(chemin);
  return r === null || r === '/admin' ? '/admin/login' : `/admin/login?${PARAM_RETOUR}=${encodeURIComponent(r)}`;
}
