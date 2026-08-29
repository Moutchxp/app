/**
 * PART-1 — CLI de RATTRAPAGE : verse en GED les pièces des réponses RATTACHÉES restées non traitées (cas Aubervilliers), en
 * appliquant les exclusions PART-1 (signature citée écartée par empreinte, multi-dossiers non traité, doublons ignorés).
 *
 * ⚠️ SIMULATION PAR DÉFAUT : sans --appliquer, RIEN n'est écrit (ni satisfaction, ni GED) — on affiche seulement ce qui SERAIT versé.
 * Écriture UNIQUEMENT avec --appliquer. NON lancé automatiquement — Arno le lance.
 * Lancer : npm run permis:verser-rattachees            (simulation)
 *          npm run permis:verser-rattachees -- --appliquer   (écriture réelle)
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { executerVersementRattache, depsReellesVersementRattache } from '../lib/sitadel/versementRattacheRepo';

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  console.log(`\nVersement des pièces rattachées — mode ${appliquer ? 'APPLIQUÉ (écriture réelle)' : 'SIMULATION (aucune écriture)'}\n`);

  const bilan = await executerVersementRattache(depsReellesVersementRattache(), { appliquer });

  console.log(`Réponses examinées : ${bilan.reponses}`);
  console.log(`  ${appliquer ? 'Versées' : 'À verser'} : ${bilan.versees}`);
  console.log(`  Écartées (signature) : ${bilan.ecarteesSignature}`);
  console.log(`  Ignorées (déjà en GED) : ${bilan.ignoreesDoublon}`);
  console.log(`  Multi-dossiers NON traités : ${bilan.multiNonTraite}`);
  console.log(`  Échecs : ${bilan.echecs}`);
  if (bilan.lignes.length > 0) {
    console.log('\nDétail par réponse :');
    for (const l of bilan.lignes) {
      console.log(`  · réponse #${l.reponseId} → permis ${l.dossierId} (demande ${l.demandeId})`);
      if (l.versees.length > 0) console.log(`      ${appliquer ? 'versées' : 'à verser'} (${l.versees.length}) : ${l.versees.join(', ')}`);
      if (l.ecartees.length > 0) console.log(`      écartées signature (${l.ecartees.length}) : ${l.ecartees.join(', ')}`);
      if (l.doublons.length > 0) console.log(`      déjà en GED (${l.doublons.length}) : ${l.doublons.join(', ')}`);
      if (l.echecs.length > 0) console.log(`      ⚠ échecs (${l.echecs.length}) : ${l.echecs.join(', ')}`);
    }
  }
  if (!appliquer) console.log('\n(SIMULATION — relancer avec « -- --appliquer » pour écrire réellement.)');
  console.log('');
}

main()
  .catch((e) => { console.error('[permis:verser-rattachees] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
