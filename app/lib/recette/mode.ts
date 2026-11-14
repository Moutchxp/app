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

import { etatRecette, hote, HOTE_PRODUCTION, MACHINE_PRODUCTION } from './modeEtat';
export { etatRecette, VARIABLE_RECETTE, type EtatRecette } from './modeEtat';

/** Le mode recette est-il ACTIF dans ce processus ? (côté serveur) */
export function modeRecette(): boolean {
  return etatRecette(process.env, hostname()).actif;
}

/**
 * ══ 🔴🔴 LE GARDE-FOU DU MODE RÉEL SUR UN MAC (décision d'Arno du 11/11/2026) ══════════════════════════════════════════════════════════
 * Constaté : le site a tourné du 02/11 au 11/11 sur le Mac en `npm run dev` — HORS mode recette, avec les vrais accès d'envoi — sans que rien ne
 * le montre. Désormais : hors mode recette, sur toute machine qui n'est PAS la production, un bandeau ROUGE en haut de chaque page de l'admin.
 * « Pas la production » : ni la machine `svav-prod`, ni l'adresse publique de la production ; et soit un Mac (`darwin`), soit hors
 * `NODE_ENV=production` (un `next start` lancé sur le Mac est donc signalé aussi). La production (Linux, `next start`) ne l'affiche jamais. PUR.
 */
export const TEXTE_MODE_REEL = 'ATTENTION : mode réel — les mails partent vraiment';
export function bandeauModeReel(env: Record<string, string | undefined>, nomMachine = '', plateforme = ''): boolean {
  if (etatRecette(env, nomMachine).actif) return false;
  if (MACHINE_PRODUCTION.test(nomMachine)) return false;
  for (const cle of ['SITE_URL', 'GESTION_URL_APPLICATION']) if (hote(env[cle]) === HOTE_PRODUCTION) return false;
  return plateforme === 'darwin' || env.NODE_ENV !== 'production';
}

/** Le bandeau rouge du mode réel s'affiche-t-il dans ce processus ? (côté serveur) */
export function modeReelLocal(): boolean {
  return bandeauModeReel(process.env, hostname(), process.platform);
}
