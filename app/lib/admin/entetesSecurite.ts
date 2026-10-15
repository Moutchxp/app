/**
 * ══ AUDIT POINT 7 (15/10/2026) — EN-TÊTES DE SÉCURITÉ POSÉS PAR L'APPLICATION ══════════════════════════════════════════
 *
 * Posés sur l'ADMIN seulement (`/admin`, `/admin/*`, `/api/admin/*`) : le tunnel public n'en reçoit aucun nouveau, pour
 * ne rien changer à son affichage ni à un éventuel encadrement par le site vitrine. Ils valent aussi sans Caddy.
 *  · `X-Frame-Options: SAMEORIGIN` — l'admin ne peut être encadrée QUE par elle-même (elle encadre ses propres aperçus :
 *    Drive, mails) ; un site tiers ne peut plus l'afficher en dessous d'un faux bouton.
 *  · `X-Content-Type-Options: nosniff` — le navigateur s'en tient au type annoncé (les routes de fichiers le posaient déjà).
 *  · `Referrer-Policy: same-origin` — une adresse de l'admin ne fuit pas vers les liens externes (Drive, Gmail…).
 *  · `Strict-Transport-Security` (production seulement) — https obligatoire pour ce nom d'hôte, un an, SANS les
 *    sous-domaines (aucun engagement pris pour eux).
 * ⚠️ PAS DE CSP GLOBALE, VOLONTAIREMENT : plusieurs routes posent déjà la leur (`sandbox`, `default-src 'none'` sur les
 * pièces et les mails) et une politique générale risquerait de s'y substituer ; et une CSP stricte des pages exige des
 * nonces pour les scripts de Next. Notée pour plus tard (audit §7). PUR : aucun import.
 */

export interface RegleEntetes {
  source: string;
  headers: { key: string; value: string }[];
}

export const CHEMINS_ADMIN = ['/admin', '/admin/:chemin*', '/api/admin/:chemin*'] as const;

export function entetesSecuriteAdmin(prod: boolean): RegleEntetes[] {
  const headers = [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'same-origin' },
    ...(prod ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  ];
  return CHEMINS_ADMIN.map((source) => ({ source, headers }));
}
