/**
 * Diagnostic LECTURE SEULE du moteur — détail faisceau par faisceau de la note Couche 1 (Dégagement).
 *
 * Reproduit EXACTEMENT le chemin interne du pipeline (validerOrigine → faisceauxAmplitude) avec les
 * paramètres par défaut du test golden (azimut 90, mode semi_auto, dernierEtage false, étage 2) ;
 * seuls lat/lon/étage (+ azimut optionnel) varient. AUCUNE réimplémentation du calcul : la distance
 * perçue et la note viennent de coucheDegagement (distancePercueFaisceau / noteDegagement) avec le
 * profil par défaut. La « famille retenue » est DÉRIVÉE pour l'affichage uniquement (non exposée par
 * le module). Ce script NE MODIFIE RIEN et n'écrit pas en base.
 *
 * Usage : npx tsx scripts/diagDegagement.ts <lat> <lon> [etage=2] [azimut=90]
 */
import { validerOrigine } from '../app/lib/db/origine';
import { faisceauxAmplitude } from '../app/lib/db/faisceaux';
import { hauteurVision } from '../app/lib/svv/config';
import { distancePercueFaisceau, noteDegagement } from '../app/lib/svv/coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT as P } from '../app/lib/svv/profilDegagement';
import { closePool } from '../app/lib/db/client';
import type { FaisceauResultat } from '../app/lib/svv/scoreDegagement';

/** Famille qui REMPORTE la distance perçue (affichage diagnostic ; reproduit les candidates du module). */
function familleRetenue(f: FaisceauResultat): 'F1' | 'F2' | 'F3' | 'F4' {
  const base = Math.min(f.distanceObstacleM ?? P.distanceMaxM, P.distanceMaxM);
  const cands: Array<{ fam: 'F1' | 'F2' | 'F3' | 'F4'; val: number }> = [{ fam: 'F1', val: base }];
  if (f.impactAncien === true && f.distanceObstacleM != null) {
    cands.push({ fam: 'F2', val: Math.min(f.distanceObstacleM * (1 + P.boostF2), P.distanceMaxM) });
  }
  if (f.impactNature != null && P.naturesRemarquables.includes(f.impactNature)) {
    cands.push({
      fam: 'F3',
      val: Math.abs(f.offsetDeg) <= P.coneF3DemiAngleDeg ? P.forfaitConeCentral : P.forfaitExtremites,
    });
  }
  if (f.natureTraverseeM != null && f.natureTraverseeM > 0) {
    cands.push({ fam: 'F4', val: Math.min(f.natureTraverseeM * (1 + P.boostF4), P.distanceMaxM) });
  }
  return cands.reduce((a, b) => (b.val > a.val ? b : a), cands[0]).fam;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const padR = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padEnd(n));
const fmt = (v: number | null | undefined, n = 1) => (v == null ? '-' : v.toFixed(n));

async function main(): Promise<void> {
  const lat = Number(process.argv[2]);
  const lon = Number(process.argv[3]);
  const etage = process.argv[4] !== undefined ? Number(process.argv[4]) : 2;
  const azimut = process.argv[5] !== undefined ? Number(process.argv[5]) : 90;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.error('Usage : npx tsx scripts/diagDegagement.ts <lat> <lon> [etage=2] [azimut=90]');
    process.exit(1);
  }

  const v = await validerOrigine({ lat, lon }, 'semi_auto');
  if (!v.valide || v.batimentOrigine === null || v.altitudeTerrainOrigineM === null || v.pointSnappeWgs84 === null) {
    console.error(`Origine NON validée (pas de note) : ${v.raison}`);
    await closePool();
    process.exit(1);
  }

  const altitudeFenetreM = v.altitudeTerrainOrigineM + hauteurVision(etage);
  const fs = await faisceauxAmplitude({
    point: v.pointSnappeWgs84,
    azimutPrincipalDeg: azimut,
    batimentOrigineId: v.batimentOrigine.id,
    batimentOriginePolygoneWkt: v.batimentOrigine.polygoneWkt,
    altitudeFenetreM,
  });

  console.log(`\nPoint : lat ${lat} lon ${lon} | étage ${etage} | azimut principal ${azimut}°`);
  console.log(`Origine validée : bât ${v.batimentOrigine.cleabs} | terrain ${v.altitudeTerrainOrigineM.toFixed(2)} m | fenêtre ${altitudeFenetreM.toFixed(2)} m`);
  console.log('');
  console.log(
    `${pad('offset°', 7)} | ${pad('distObst', 8)} | ${padR('impactNature', 24)} | anc | ${pad('natTrav', 8)} | fam | ${pad('perçue', 8)}`,
  );
  console.log('-'.repeat(7 + 3 + 8 + 3 + 24 + 3 + 3 + 3 + 8 + 3 + 3 + 3 + 8));

  for (const f of fs) {
    const percue = distancePercueFaisceau(f, P);
    console.log(
      `${pad(f.offsetDeg, 7)} | ${pad(fmt(f.distanceObstacleM), 8)} | ${padR(f.impactNature ?? '-', 24)} | ${pad(f.impactAncien ? 'O' : 'N', 3)} | ${pad(fmt(f.natureTraverseeM), 8)} | ${pad(familleRetenue(f), 3)} | ${pad(percue.toFixed(2), 8)}`,
    );
  }

  // Résumé.
  const percues = fs.map((f) => distancePercueFaisceau(f, P));
  const moyenne = percues.reduce((a, b) => a + b, 0) / (percues.length || 1);
  const note = noteDegagement(fs, P);
  const nF2 = fs.filter((f) => f.impactAncien === true && f.distanceObstacleM != null).length;
  const nF3 = fs.filter((f) => f.impactNature != null && P.naturesRemarquables.includes(f.impactNature)).length;
  const nF4 = fs.filter((f) => (f.natureTraverseeM ?? 0) > 0).length;

  console.log('');
  console.log('=== RÉSUMÉ ===');
  console.log(`faisceaux               : ${fs.length}`);
  console.log(`moyenne perçue (m)      : ${moyenne.toFixed(4)}`);
  console.log(`note Couche 1 /80       : ${note}`);
  console.log(`perçue min / max (m)    : ${Math.min(...percues).toFixed(2)} / ${Math.max(...percues).toFixed(2)}`);
  console.log(`familles déclenchées    : F2(ancien)=${nF2}  F3(remarquable)=${nF3}  F4(nature)=${nF4}`);
  console.log(`familles RETENUES (max) : ${(['F1', 'F2', 'F3', 'F4'] as const).map((x) => `${x}=${fs.filter((f) => familleRetenue(f) === x).length}`).join('  ')}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
