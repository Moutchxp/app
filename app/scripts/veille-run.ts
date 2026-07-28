/**
 * CLI du moteur de veille Sitadel (chantier S11a) : npm run veille:run
 *
 * Appelle le point d'entrée idempotent `executerVeille({ declencheur: 'planifie' })`. Destiné à être invoqué par un
 * futur déclencheur (launchd) SANS shell : il charge `.env` en absolu (cf. `chargerEnv`), sort une ligne horodatée
 * concise (redirigeable vers un log), et positionne un code de sortie exploitable.
 *
 *   --forcer   ignore la comparaison de millésime (et la garde d'intervalle) → ré-ingère de force.
 *   --statut   n'exécute RIEN : affiche seulement le dernier run journalisé.
 *
 * Code de sortie : 0 sur 'succes' et 'rien_a_faire' ; non nul sur 'echec'. AUCUN ENVOI.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { executerVeille, dernierRun } from '../lib/sitadel/executerVeille';
import { resumeRun } from '../lib/sitadel/planification';

const args = new Set(process.argv.slice(2));
const forcer = args.has('--forcer');
const statutSeul = args.has('--statut');
const ts = (): string => new Date().toISOString();

async function principal(): Promise<void> {
  if (statutSeul) {
    const dr = await dernierRun();
    console.log(`[${ts()}] veille:statut — ${dr ? resumeRun(dr) : 'aucun run journalisé'}`);
    return; // aucune exécution
  }
  const r = await executerVeille({ declencheur: 'planifie', forcer });
  console.log(`[${ts()}] veille: ${r.statut} — ${r.raison}`);
  // 'succes' et 'rien_a_faire' → succès CLI (le code de sortie reste 0).
}

void principal()
  .catch((e) => {
    // Un 'echec' d'ingestion a déjà été journalisé en base par executerVeille avant d'être relancé.
    console.error(`[${ts()}] veille: echec — ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
