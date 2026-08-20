/**
 * N10-B — CLI : PASSE d'alerte « superstructures au-dessus de la toiture ». Découplée de l'écriture des niveaux, REJOUABLE et
 * IDEMPOTENTE (table alerte_permis). N'envoie RIEN si le nombre de permis dus dépasse la garde (SEUIL_GARDE) : il l'affiche et
 * s'arrête (décision Arno). `chargerEnv` EN PREMIER (avant tout db/client). Prérequis : migration 129 appliquée.
 * Lancer : npm run permis:alerter-superstructures
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { executerAlerteSuperstructures, depsReellesAlerteSuperstructures, SEUIL_GARDE } from '../lib/permis/alerteSuperstructures';

async function main(): Promise<void> {
  const bilan = await executerAlerteSuperstructures(depsReellesAlerteSuperstructures());
  if (bilan.bloque) {
    console.error(`\n⚠ GARDE : ${bilan.nombreDus} permis dus (> ${SEUIL_GARDE}) → AUCUN e-mail envoyé. Vérifie la liste et relance après décision.`);
    process.exitCode = 2;
    return;
  }
  console.log(`\n══════ ALERTE SUPERSTRUCTURES ══════`);
  console.log(`  examinés : ${bilan.examinees} · envoyés : ${bilan.envoyees} · erreurs : ${bilan.erreurs}${bilan.nombreDus === 0 ? '  (aucun permis dû ou alertes désactivées)' : ''}`);
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:alerter-superstructures] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
