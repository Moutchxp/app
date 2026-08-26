/**
 * CLI d'INGESTION Sitadel (chantiers S2/S2b) : npm run sitadel:ingest
 *
 * Depuis S11a, l'orchestration (téléchargement → flux → filtres → UPSERT + garde-fou de complétude) vit dans
 * `app/lib/sitadel/ingestionMillesime.ts` (réutilisable par le moteur `executerVeille`). Ce CLI ne fait que : charger
 * `.env` en absolu (indépendant du CWD — cf. `chargerEnv`), appeler `ingererMillesime()`, puis fermer le pool. Sortie
 * console et comportement d'ingestion STRICTEMENT INCHANGÉS. AUCUN contact moteur/score/certificat.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { ingererMillesime, millesimeDistantDido } from '../lib/sitadel/ingestionMillesime';

// Ingère le millésime COURANT (détecté à distance via les métadonnées DiDo), et non plus une constante figée — sinon
// on re-télécharge/ré-ingère éternellement l'ancien millésime tandis qu'un nouveau est publié (cf. S11a-FIX).
void millesimeDistantDido()
  .then(({ millesime }) => ingererMillesime(millesime))
  .catch((e) => { console.error('[sitadel:ingest] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
