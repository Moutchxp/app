/**
 * PC-3 étendu — RATTRAPAGE des récaps Cerfa manquants (lot C). Le producteur de fond (executerPrecalculBestOf) écrit désormais le récap
 * SUR SES PASSES NORMALES (arrivée d'un dossier, changement de GED). Mais un dossier DÉJÀ à jour (best-of persisté == GED courante) est
 * sauté par le fond → son récap n'est jamais produit s'il a été calculé « à la volée » avant cet ajout. Ce script AMORCE une fois ces
 * dossiers, pour qu'Arno n'attende jamais sur ses dossiers actuels.
 *
 * Univers = STRICTEMENT celui du fond (permis AYANT une `permis_empreinte` ∩ ayant des pièces GED), restreint à ceux SANS récap stocké.
 * Ne touche NI le moteur, NI le verdict, NI le golden, NI une altitude ; n'écrit QUE `permis_cerfa_recap` (upsert), et UNIQUEMENT avec
 * `--ecrire`. AUCUN appel IA, AUCUN service payant (texte pdf.js déjà extrait).
 *
 * Lancer :
 *   npm run permis:rattraper-recap                 → DRY-RUN : liste les dossiers concernés + compte, AUCUNE écriture.
 *   npm run permis:rattraper-recap -- --ecrire     → produit les récaps manquants (lecture GED par dossier ; ~2 à 10 s chacun).
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { memoriserRecapCerfaDepuisGed } from '../lib/permis/cerfaRecapRepo';

/** Dossiers de l'univers de fond (empreinte + GED) SANS instantané de récap stocké. Ordre stable (dossier_id croissant). */
export async function candidatsRattrapage(): Promise<number[]> {
  const { rows } = await query<{ dossier_id: number | string }>(
    `SELECT DISTINCT dd.dossier_id
       FROM dossier_document dd
      WHERE EXISTS (SELECT 1 FROM permis_empreinte e WHERE e.dossier_id = dd.dossier_id)
        AND NOT EXISTS (SELECT 1 FROM permis_cerfa_recap r WHERE r.dossier_id = dd.dossier_id)
      ORDER BY dd.dossier_id`);
  return rows.map((r) => Number(r.dossier_id));
}

async function main(): Promise<void> {
  const ecrire = process.argv.includes('--ecrire');
  const ids = await candidatsRattrapage();
  console.log(`[rattrapage-recap] ${ids.length} dossier(s) de l'univers de fond SANS récap stocké : ${ids.join(', ') || '(aucun)'}`);
  if (!ecrire) {
    console.log('[rattrapage-recap] DRY-RUN — aucune écriture. Relancez avec « -- --ecrire » pour produire les récaps manquants.');
    return;
  }
  const deps = depsReellesLectureGed();
  let ecrits = 0, sansRecap = 0;
  for (const id of ids) {
    const ged = await lireGedPermis(id, deps);
    const metas = await deps.listerPieces(id);
    const ok = await memoriserRecapCerfaDepuisGed(id, ged, metas, 'recap:rattrapage');
    if (ok) { ecrits++; console.log(`  ✓ ${id} — récap stocké`); }
    else { sansRecap++; console.log(`  · ${id} — aucun récapitulatif lisible (rien écrit)`); }
  }
  console.log(`[rattrapage-recap] terminé : ${ecrits} récap(s) écrit(s), ${sansRecap} dossier(s) sans récapitulatif lisible.`);
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:rattraper-recap] échec', e); process.exitCode = 1; }).finally(() => closePool());
