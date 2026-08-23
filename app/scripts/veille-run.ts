/**
 * CLI du moteur de veille Sitadel (chantier S11a) : npm run veille:run
 *
 * Appelle le point d'entrée idempotent `executerVeille({ declencheur: 'planifie' })`. Destiné à être invoqué par un
 * futur déclencheur (launchd) SANS shell : il charge `.env` en absolu (cf. `chargerEnv`), sort une ligne horodatée
 * concise (redirigeable vers un log), et positionne un code de sortie exploitable.
 *
 *   --forcer          ignore la comparaison de millésime (et la garde d'intervalle) → ré-ingère de force.
 *   --statut          n'exécute RIEN : affiche seulement le dernier run journalisé.
 *   --famille=<f>     (H1) restreint les étapes à une famille : « mairies » (permis/relances/saisines + cœur Sitadel) ou
 *                     « donnees » (détection/ingestion/alerte des sources, AUCUN envoi mairie). OMIS → TOUT (inchangé).
 *
 * Code de sortie : 0 sur 'succes' et 'rien_a_faire' ; non nul sur 'echec'. AUCUN ENVOI.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { executerVeille, dernierRun, parserFamille } from '../lib/sitadel/executerVeille';
import { resumeRun } from '../lib/sitadel/planification';

const args = process.argv.slice(2);
const forcer = args.includes('--forcer');
const statutSeul = args.includes('--statut');
const ts = (): string => new Date().toISOString();

async function principal(): Promise<void> {
  if (statutSeul) {
    const dr = await dernierRun();
    console.log(`[${ts()}] veille:statut — ${dr ? resumeRun(dr) : 'aucun run journalisé'}`);
    return; // aucune exécution
  }
  const famille = parserFamille(args); // lève AVANT toute exécution si la valeur est inconnue (jamais un repli sur « tout »)
  const r = await executerVeille({ declencheur: 'planifie', forcer, famille });
  console.log(`[${ts()}] veille${famille ? `[${famille}]` : ''}: ${r.statut} — ${r.raison}`);
  // 'succes' et 'rien_a_faire' → succès CLI (le code de sortie reste 0).
}

void principal()
  .catch((e) => {
    // Un 'echec' d'ingestion a déjà été journalisé en base par executerVeille avant d'être relancé.
    console.error(`[${ts()}] veille: echec — ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
