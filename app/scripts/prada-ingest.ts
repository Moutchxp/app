/**
 * CLI d'INGESTION de l'annuaire CADA des PRADA (chantier S14b) : npm run prada:ingest [-- --forcer]
 *
 * Sur le modèle de `sitadel-ingest.ts` : charge `.env` en absolu, appelle `importerAnnuaireCada()`, imprime un RAPPORT
 * CHIFFRÉ, puis ferme le pool. NE FAIT AUCUN rapprochement de commune (code_insee reste NULL). `--forcer` ré-ingère même
 * si le millésime est déjà connu.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { importerAnnuaireCada, type CompteursPrada } from '../lib/sitadel/pradaIngest';

function imprimerRapport(c: CompteursPrada): void {
  console.log(`\n[prada:ingest] millésime ${c.millesime} (${c.fichierSource})`);
  console.log(`  lignes lues     : ${c.lignesLues}`);
  console.log(`  insérées        : ${c.inserees}`);
  console.log(`  mises à jour    : ${c.misesAJour}`);
  console.log(`  courriels vides : ${c.courrielsVides}`);
  console.log(`  cibles périmètre : 75=${c.cibles['75'] ?? 0} · 78=${c.cibles['78'] ?? 0} · 92=${c.cibles['92'] ?? 0} · 93=${c.cibles['93'] ?? 0}`);
  console.log(`  répartition par département (brut, ${c.parDepartement.length} valeur(s)) :`);
  for (const [dep, n] of c.parDepartement) console.log(`    « ${dep === '' ? '(vide)' : dep} » : ${n}`);
}

void importerAnnuaireCada({ forcer: process.argv.includes('--forcer') })
  .then((r) => {
    if (r.statut === 'rien_a_faire') {
      console.log(`[prada:ingest] millésime ${r.millesime} déjà importé — rien à faire (utiliser --forcer pour ré-ingérer).`);
      return;
    }
    imprimerRapport(r.compteurs);
  })
  .catch((e) => { console.error('[prada:ingest] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
