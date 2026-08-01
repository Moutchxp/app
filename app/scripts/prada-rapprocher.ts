/**
 * CLI de RAPPROCHEMENT des mairies PRADA avec `commune` (chantier S14c) : npm run prada:rapprocher
 *
 * Sur le modèle des autres CLI : charge `.env`, appelle `rapprocher()`, imprime un RAPPORT CHIFFRÉ, ferme le pool. Ne
 * touche NI mairie_contact, NI demande, NI dest_*. Ne fait AUCUN envoi.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { rapprocher } from '../lib/sitadel/pradaRapprocher';

void rapprocher()
  .then((r) => {
    console.log('\n[prada:rapprocher] rapport');
    console.log(`  mairies examinées (périmètre) : ${r.examinees}`);
    console.log(`  automatiques                  : ${r.automatiques}`);
    console.log(`  ambiguës                      : ${r.ambigues.length}`);
    for (const n of r.ambigues) console.log(`    - ${n}`);
    console.log(`  hors périmètre                : ${r.horsPerimetre}`);
    console.log(`  lignes écrites dans mairie_prada : ${r.ecritesMairiePrada}`);
    console.log(`  communes couvertes par une PRADA : ${r.communesCouvertes} / ${r.communesTotal}`);
  })
  .catch((e) => { console.error('[prada:rapprocher] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
