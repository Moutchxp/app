/**
 * ══ MODE RECETTE (lot RECETTE-MAC, 16/10/2026) — travailler sur le Mac SANS AUCUN EFFET RÉEL ══════════════════════════
 *
 * Arno : « quand le site tourne en local, aucun mail réel ne part, aucun événement n'est créé dans un vrai agenda Google,
 * aucune écriture dans le vrai Drive ; un bandeau visible ; impossible à activer par erreur en production ».
 *
 * ACTIVATION : `npm run recette` (scripts/recette.sh : pose `SVAV_RECETTE=1`, base `svav_recette` par défaut, puis le
 * serveur de développement). Rien d'autre ne l'active.
 * REFUS, vérifié au démarrage du serveur (`instrumentation.ts`) et à CHAQUE lecture du mode :
 *   · `NODE_ENV=production` (la production tourne en `next start`, toujours en production) ;
 *   · l'adresse publique du site (`SITE_URL`, `GESTION_URL_APPLICATION`) est celle de la production ;
 *   · la machine est le serveur de production (nom d'hôte `svav-prod`).
 * Refusé → le mode est INACTIF (la production fonctionne normalement, sans bandeau) et le démarrage l'écrit en rouge.
 * `etatRecette` est PUR (environnement et nom d'hôte en paramètres) ; `modeRecette` lit ceux du processus (serveur seulement).
 */

import { hostname } from 'node:os';

export const VARIABLE_RECETTE = 'SVAV_RECETTE';
const HOTE_PRODUCTION = 'authentification.sansvisavis.com';
const MACHINE_PRODUCTION = /^svav-prod\b/i;

export type EtatRecette =
  | { actif: true }
  | { actif: false; demande: false }
  | { actif: false; demande: true; refus: string };

function hote(url: string | undefined): string | null {
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

/** Le mode recette est-il ACTIF dans ce processus ? (côté serveur) */
export function modeRecette(): boolean {
  return etatRecette(process.env, hostname()).actif;
}
