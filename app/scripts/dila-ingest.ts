/**
 * CLI DILA (Base de données locales) : deux fonctions.
 *   • INGESTION (chantier S28) : npm run dila:ingest [-- --forcer]  → remplit dila_millesime + dila_import.
 *   • PROJECTION (chantier S29) : npm run dila:ingest -- --projeter [--appliquer]
 *       → pose telephone_standard sur mairie_contact via ecrireContact. DRY-RUN par défaut (rollback) ; --appliquer COMMIT.
 *
 * Sur le modèle de `prada-ingest.ts` : charge `.env` en absolu, imprime un RAPPORT CHIFFRÉ, ferme le pool. AUCUN ENVOI.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { importerAnnuaireDila, type CompteursDila } from '../lib/sitadel/dilaIngest';
import { projeterContexteDila, type ResultatProjection } from '../lib/sitadel/dilaProjection';

function imprimerRapport(c: CompteursDila): void {
  console.log(`\n[dila:ingest] millésime ${c.code} — ${c.fichierSource}`);
  console.log(`  registre (licence) : url=${c.urlEffective}`);
  console.log(`                       taille=${c.tailleOctets} octets · copyright=« ${c.copyright} »`);
  console.log(`  enregistrements lus : ${c.enregistrementsLus}`);
  console.log(`  mairies trouvées    : ${c.mairiesTrouvees}`);
  console.log(`  mairies (périmètre) : ${c.mairiesPerimetre}`);
  console.log(`  lignes gardées      : ${c.lignesGardees}`);
  console.log(`  rattachement        : direct=${c.direct} · desambigue_01=${c.desambigue01} · écartées règle -01 (mairies déléguées, non écrites)=${c.ecarteesDeleguee}`);
  if (c.ambigus.length > 0) console.log(`  ⚠ ambigus (non retenus) : ${c.ambigus.join(', ')}`);
  if (c.manquants.length > 0) console.log(`  ⚠ sans mairie DILA      : ${c.manquants.join(', ')}`);
  console.log(`  → dila_millesime.id = ${c.millesimeId}`);
}

function imprimerProjection(r: ResultatProjection): void {
  const mode = r.dryRun ? 'DRY-RUN (rollback — RIEN appliqué)' : 'APPLIQUÉ (commit)';
  console.log(`\n[dila:ingest --projeter] millésime ${r.millesimeCode} — ${mode}`);
  console.log(`  communes DILA traitées   : ${r.total}`);
  console.log(`  reçoivent un standard    : ${r.recoitStandard.length}`);
  console.log(`  standard déjà identique  : ${r.dejaIdentique.length}`);
  console.log(`  protégées (humain)       : ${r.protegees.length}  (statut=confirme / source=saisie_manuelle|reponse_mairie)`);
  console.log(`  DILA sans standard       : ${r.sansValeurDila.length}`);
  console.log(`  sans ligne de contact    : ${r.sansLigne.length}`);
  console.log(`  écritures réelles        : ${r.ecrites}   (uniquement telephone_standard ; source/statut/canal/… inchangés)`);
  console.log(`\n  DÉTAIL des ${r.gap.length} communes « en manque » (la DILA n'apporte AUCUN courriel) :`);
  for (const g of r.gap) {
    const av = (g.standardAvant ?? '').trim() === '' ? '∅' : g.standardAvant;
    console.log(`    ${g.codeInsee} ${(g.nom ?? '').padEnd(24)} canal=${(g.canal ?? '?').padEnd(10)} std_avant=${String(av).padEnd(16)} std_DILA=${g.standardDila ?? '∅'}  courriel_DILA=${g.courrielDila ?? '∅'}  [${g.decision}]`);
  }
}

async function principal(): Promise<void> {
  const argv = process.argv;
  if (argv.includes('--projeter')) {
    const r = await projeterContexteDila({ appliquer: argv.includes('--appliquer') });
    imprimerProjection(r);
    if (r.dryRun) console.log(`\n  ⚠ DRY-RUN : rien n'a été écrit. Relancer avec « --projeter --appliquer » pour appliquer.`);
    return;
  }
  const r = await importerAnnuaireDila({ forcer: argv.includes('--forcer') });
  if (r.statut === 'rien_a_faire') {
    console.log(`[dila:ingest] millésime ${r.code} déjà importé — rien à faire (utiliser --forcer pour ré-ingérer).`);
    return;
  }
  imprimerRapport(r.compteurs);
}

void principal()
  .catch((e) => { console.error('[dila:ingest] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
