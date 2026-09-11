/**
 * BAT-1 — RATTRAPAGE : pose le nombre de bâtiments VALIDÉ et crée les cartes manquantes pour les dossiers DÉJÀ en base (l'auto-création
 * ne s'applique sinon qu'aux futures analyses). Pour chaque dossier : nombre détecté, cartes existantes, cartes à créer, nombre à poser.
 *
 * DRY-RUN PAR DÉFAUT — aucune écriture. `--appliquer` crée les cartes + pose le nombre validé (NO-OP si migration 218 non appliquée).
 * Idempotent (un nombre déjà validé est intouché) ; ne touche NI supprimerCorps NI aucune carte existante. AUCUN DELETE.
 *
 * Lancer : npm run permis:autocreer-cartes            → DRY-RUN
 *          npm run permis:autocreer-cartes -- --appliquer   → applique (requiert migration 218)
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { autocreerCartes, depsReellesAutocreation } from '../lib/permis/autocreationCartesRepo';

/** Univers = dossiers analysés (ayant des cartes OU un récap Cerfa). Ordre stable. */
export async function candidatsAutocreation(): Promise<number[]> {
  const { rows } = await query<{ dossier_id: number | string }>(
    `SELECT dossier_id FROM permis_corps_batiment
     UNION SELECT dossier_id FROM permis_cerfa_recap
     ORDER BY 1`);
  return rows.map((r) => Number(r.dossier_id));
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const ids = await candidatsAutocreation();
  const deps = depsReellesAutocreation();
  console.log(`[autocreer-cartes] ${appliquer ? 'APPLIQUER' : 'DRY-RUN (aucune écriture)'} — ${ids.length} dossier(s).`);
  let migAbsente = false, totalCreees = 0, poses = 0;
  for (const id of ids) {
    const r = await autocreerCartes(id, 'rattrapage:bat1', deps, { appliquer });
    if (r.migrationAbsente) { migAbsente = true; }
    const nombre = r.intouche ? '(intouché)' : String(r.aPoser ?? '—');
    console.log(`  dossier ${id} — détecté ${r.detecte}, cartes existantes ${r.nbCorpsAvant}, cartes à créer ${r.aCreer}, nombre validé ${appliquer ? 'posé' : 'à poser'} : ${nombre}`);
    totalCreees += r.creees; if (r.nombrePose !== null) poses++;
  }
  if (migAbsente) console.log(`\n[autocreer-cartes] ⚠ migration 218 NON appliquée → NO-OP complet (aucune carte, aucun nombre posé). Applique 218 puis relance.`);
  else if (appliquer) console.log(`\n[autocreer-cartes] terminé : ${totalCreees} carte(s) créée(s), ${poses} nombre(s) validé(s) posé(s).`);
  else console.log(`\n[autocreer-cartes] DRY-RUN — aucune écriture. Relancez avec « -- --appliquer » (migration 218 requise).`);
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:autocreer-cartes] échec', e); process.exitCode = 1; }).finally(() => closePool());
