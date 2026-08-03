/**
 * CLI d'INGESTION de l'annuaire DILA (Base de données locales — chantier S28) : npm run dila:ingest [-- --forcer]
 *
 * Sur le modèle de `prada-ingest.ts` : charge `.env` en absolu, télécharge l'archive (tout-ou-rien), remplit
 * `dila_millesime` + `dila_import` avec les mairies de notre périmètre, imprime un RAPPORT CHIFFRÉ, ferme le pool.
 * N'ÉCRIT RIEN dans mairie_contact (c'est S29). AUCUN ENVOI. `--forcer` ré-ingère un millésime déjà présent.
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { importerAnnuaireDila, type CompteursDila } from '../lib/sitadel/dilaIngest';

function imprimerRapport(c: CompteursDila): void {
  console.log(`\n[dila:ingest] millésime ${c.code} — ${c.fichierSource}`);
  console.log(`  registre (licence) : url=${c.urlEffective}`);
  console.log(`                       taille=${c.tailleOctets} octets · copyright=« ${c.copyright} »`);
  console.log(`  enregistrements lus : ${c.enregistrementsLus}`);
  console.log(`  mairies trouvées    : ${c.mairiesTrouvees}`);
  console.log(`  mairies (périmètre) : ${c.mairiesPerimetre}`);
  console.log(`  lignes gardées      : ${c.lignesGardees}`);
  console.log(`  rattachement        : direct=${c.direct} · desambigue_01=${c.desambigue01} · hors_perimetre=${c.horsPerimetre}`);
  if (c.ambigus.length > 0) console.log(`  ⚠ ambigus (non retenus) : ${c.ambigus.join(', ')}`);
  if (c.manquants.length > 0) console.log(`  ⚠ sans mairie DILA      : ${c.manquants.join(', ')}`);
  console.log(`  → dila_millesime.id = ${c.millesimeId}`);
}

void importerAnnuaireDila({ forcer: process.argv.includes('--forcer') })
  .then((r) => {
    if (r.statut === 'rien_a_faire') {
      console.log(`[dila:ingest] millésime ${r.code} déjà importé — rien à faire (utiliser --forcer pour ré-ingérer).`);
      return;
    }
    imprimerRapport(r.compteurs);
  })
  .catch((e) => { console.error('[dila:ingest] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
