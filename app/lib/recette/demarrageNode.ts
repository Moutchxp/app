/**
 * ══ DÉMARRAGE DU SERVEUR — PARTIE NODE SEULEMENT (lot INSTRUMENTATION-RUNTIME-NODE, 18/10/2026) ═══════════════════════
 *
 * Tout ce que `instrumentation.ts` faisait au démarrage vit ici : contrôle des URL publiques, puis MODE RECETTE (verrou
 * réseau). Ce fichier n'est chargé QUE par le runtime Node (`instrumentation.ts`, branche
 * `process.env.NEXT_RUNTIME === 'nodejs'`, import dynamique) : le compilateur Edge ne le voit jamais, d'où plus aucun
 * avertissement « Node.js API is used (process.exit) » ni « Node.js module is loaded ('node:os') ».
 *
 * Le verrou n'est PAS affaibli : mêmes conditions (`etatRecette`), même pose (`installerVerrouRecette`), même arrêt du
 * serveur si la recette est demandée mais que le verrou ne peut pas être posé. La production n'est pas touchée : sans
 * `SVAV_RECETTE=1`, ou refusé (production, adresse ou machine de production), aucun verrou n'est posé.
 */
import { hostname } from 'node:os';

export interface DependancesDemarrage {
  env: Record<string, string | undefined>;
  nomMachine: () => string;
  sortir: (code: number) => void;
}

const PROCESSUS: DependancesDemarrage = { env: process.env, nomMachine: hostname, sortir: (code) => process.exit(code) };

export async function demarrerServeurNode(deps: DependancesDemarrage = PROCESSUS): Promise<void> {
  const { env } = deps;
  try {
    const { verifierUrlsPubliques } = await import('../config/verifierUrlsPubliques');
    for (const message of verifierUrlsPubliques(env)) console.warn(message);
  } catch {
    // Un contrôle de configuration ne doit jamais empêcher le serveur de démarrer.
  }
  try {
    const { etatRecette } = await import('./mode');
    const etat = etatRecette(env, deps.nomMachine());
    if (etat.actif) {
      const { installerVerrouRecette } = await import('./installer');
      installerVerrouRecette();
      console.warn('\x1b[43m\x1b[30m RECETTE — aucun envoi réel \x1b[0m mails, agenda et Drive interceptés ; boîte de test : /admin/recette');
    } else if (etat.demande) {
      console.error(`\x1b[41m\x1b[37m MODE RECETTE REFUSÉ \x1b[0m (${etat.refus}) — le serveur fonctionne en mode normal.`);
    }
  } catch (e) {
    // Recette DEMANDÉE mais verrou impossible à poser : on n'ouvre pas un site local qui écrirait pour de vrai.
    console.error('[RECETTE] contrôle de démarrage indisponible', (e as Error)?.message);
    if (env.SVAV_RECETTE === '1' && env.NODE_ENV !== 'production') deps.sortir(1);
  }
}
