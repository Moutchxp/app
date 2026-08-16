/**
 * FUS-3f — CLI « mesure LiDAR postérieure » alimentant le REGISTRE d'altitudes (pièce de preuve). Deux modes, PROVENANCE
 * OBLIGATOIRE dans les deux (millésime + source, sinon refus — une ligne de registre sans provenance ne prouve rien) :
 *   · ÉCRASEMENT MANUEL d'un polygone : --cleabs <cleabs> --altitude <ngf> --millesime <m> --source <s>
 *   · IMPORT BD TOPO (borné aux cleabs des empreintes de permis) : --tous --millesime <m> --source <s>
 *     (l'altitude est LUE en base, batiment.altitude_maximale_toit ; c'est le point d'entrée du futur pipeline de réimport).
 * Une altitude 'permis' écrasée → le dossier passe à « annulé par LiDAR ». NON lancé automatiquement — Arno le lance.
 * Lancer : npm run permis:altitude-lidar -- (--cleabs <c> --altitude <n> | --tous) --millesime <m> --source <s>
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { enregistrerMesureLidar, importBdTopoSuivis } from '../lib/permis/actionsRattachement';

const PAR = 'cli:altitude-lidar';
const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
const USAGE = 'usage : npm run permis:altitude-lidar -- (--cleabs <cleabs> --altitude <ngf> | --tous) --millesime <edition> --source <bdtopo|lidar_hd>';

async function main(): Promise<void> {
  const millesime = arg('--millesime');
  const source = arg('--source');
  // 🔴 PROVENANCE OBLIGATOIRE — refus AVANT toute écriture si millésime ou source manque.
  if (!millesime || !source) {
    console.error('[permis:altitude-lidar] REFUS : --millesime ET --source sont obligatoires (pièce de preuve).');
    console.error(USAGE);
    process.exitCode = 2; return;
  }
  const prov = { millesime, source };
  const tous = process.argv.includes('--tous');

  if (tous) {
    const r = await importBdTopoSuivis(prov, PAR);
    if (!r.ok) { console.error(`[permis:altitude-lidar] refus : ${r.motif}`); process.exitCode = 2; return; }
    console.log(`\nIMPORT BD TOPO (borné aux permis suivis) — millésime « ${millesime} », source « ${source} »`);
    console.log(`  ${r.nbTraites ?? 0} cleabs suivis traités · ${r.nbEcrases ?? 0} altitude(s) permis écrasée(s) → dossier(s) annulé(s) par LiDAR.\n`);
    return;
  }

  const cleabs = arg('--cleabs');
  const altitudeStr = arg('--altitude');
  if (!cleabs || altitudeStr === undefined) { console.error(USAGE); process.exitCode = 2; return; }
  const altitude = Number(altitudeStr);
  if (!Number.isFinite(altitude)) { console.error(`[permis:altitude-lidar] altitude invalide : ${altitudeStr}`); process.exitCode = 2; return; }

  const r = await enregistrerMesureLidar(cleabs, altitude, prov, PAR);
  if (!r.ok) { console.error(`[permis:altitude-lidar] refus : ${r.motif}`); process.exitCode = 2; return; }
  console.log(`\nMESURE LiDAR enregistrée sur ${cleabs} : ${altitude} NGF (millésime « ${millesime} », source « ${source} »).`);
  console.log(r.nbEcrases ? '  → une altitude permis a été écrasée ; le dossier est annulé par LiDAR.\n' : '  → aucune altitude permis écrasée.\n');
}

void main().catch((e) => { console.error('[permis:altitude-lidar] échec', e); process.exitCode = 1; }).finally(() => closePool());
