/**
 * 🔴 (15/11/2026) — LE MODE RECETTE, PARTIE PURE ET SANS AUCUN IMPORT : lue aussi par la garde des effets réels (`garde.ts`), qui doit
 * pouvoir être importée par des modules partagés avec le navigateur (aucun module Node). `mode.ts` la réexporte, inchangée.
 */
export const VARIABLE_RECETTE = 'SVAV_RECETTE';
export const HOTE_PRODUCTION = 'authentification.sansvisavis.com';
export const MACHINE_PRODUCTION = /^svav-prod\b/i;

export type EtatRecette =
  | { actif: true }
  | { actif: false; demande: false }
  | { actif: false; demande: true; refus: string };

export function hote(url: string | undefined): string | null {
  try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; }
}

/** Le mode recette est-il demandé, et permis ici ? PUR. */
export function etatRecette(env: Record<string, string | undefined>, nomMachine = ''): EtatRecette {
  if (env[VARIABLE_RECETTE] !== '1') return { actif: false, demande: false };
  if (env.NODE_ENV === 'production') return { actif: false, demande: true, refus: 'NODE_ENV=production' };
  for (const cle of ['SITE_URL', 'GESTION_URL_APPLICATION']) {
    if (hote(env[cle]) === HOTE_PRODUCTION) return { actif: false, demande: true, refus: `${cle} est l’adresse de la production` };
  }
  if (MACHINE_PRODUCTION.test(nomMachine)) return { actif: false, demande: true, refus: 'machine de production (svav-prod)' };
  return { actif: true };
}

