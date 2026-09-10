/**
 * CR-3 — INSTRUCTION des valeurs générées par le téléservice dans les champs de caractéristiques VIDES. Pour chaque dossier ayant un
 * récap stocké : champ par champ, la valeur candidate et la DÉCISION (écrite / écartée + motif).
 *
 * DRY-RUN PAR DÉFAUT — aucune écriture. `--appliquer` écrit les champs vides + journalise (méthode 'teleservice'), UNIQUEMENT si la
 * migration 215 est appliquée (sinon no-op propre annoncé). N'écrit dans un corps que s'il y a EXACTEMENT un bâtiment ; n'écrase jamais
 * une saisie ni une méthode supérieure ; ne force jamais une destination hors CHECK ; n'écrit jamais « Surface créée » en surface de
 * plancher. AUCUN DELETE (journal additif + idempotent). Ne touche NI le moteur, NI le verdict, NI le golden.
 *
 * Lancer :
 *   npm run permis:instruire-teleservice                → DRY-RUN : décisions par dossier, AUCUNE écriture.
 *   npm run permis:instruire-teleservice -- --appliquer  → écrit (si migration 215 appliquée).
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { instruireTeleservice } from '../lib/permis/teleserviceRepo';

/** Dossiers ayant un instantané de récap stocké (univers de l'instruction). Ordre stable. */
export async function candidatsInstruction(): Promise<number[]> {
  const { rows } = await query<{ dossier_id: number | string }>(`SELECT dossier_id FROM permis_cerfa_recap ORDER BY dossier_id`);
  return rows.map((r) => Number(r.dossier_id));
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const ids = await candidatsInstruction();
  console.log(`[instruire-teleservice] ${ids.length} dossier(s) avec récap stocké.${appliquer ? ' MODE --appliquer.' : ' DRY-RUN (aucune écriture).'}`);
  let totalEcrites = 0, migrationAbsente = false;
  for (const id of ids) {
    const r = await instruireTeleservice(id, { appliquer, majPar: 'teleservice:instruction' });
    if (r.migrationAbsente) migrationAbsente = true;
    if (r.decisions.length === 0) { console.log(`\n  · dossier ${id} — aucune valeur générée par le téléservice (rien à instruire).`); continue; }
    console.log(`\n  dossier ${id} :`);
    for (const d of r.decisions) {
      const tag = d.action === 'ecrire' ? '✓ ÉCRITE ' : '· écartée';
      console.log(`     ${tag} [${d.champ}] ${d.candidat}${d.action === 'ecartee' ? ` — ${d.motif}` : ''}`);
    }
    totalEcrites += r.ecrites;
  }
  if (appliquer && migrationAbsente) {
    console.log(`\n[instruire-teleservice] ⚠ migration 215 NON appliquée → méthode 'teleservice' hors CHECK : AUCUNE écriture (no-op). Applique 215 puis relance.`);
  } else if (appliquer) {
    console.log(`\n[instruire-teleservice] terminé : ${totalEcrites} champ(s) écrit(s).`);
  } else {
    console.log(`\n[instruire-teleservice] DRY-RUN — aucune écriture. Relancez avec « -- --appliquer » (migration 215 requise).`);
  }
}

const estPointEntree = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (estPointEntree) void main().catch((e) => { console.error('[permis:instruire-teleservice] échec', e); process.exitCode = 1; }).finally(() => closePool());
