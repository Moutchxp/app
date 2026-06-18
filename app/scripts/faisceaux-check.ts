import { query, closePool } from "../lib/db/client";
import { validerOrigine } from "../lib/db/origine";
import { faisceauxAmplitude } from "../lib/db/faisceaux";
import type { PointWgs84 } from "../lib/svv/geo";
import { hauteurVision, THRESHOLD_M, CLEAR_BEAM_DIST_M } from "../lib/svv/config";

interface LigneAdresse {
  numero: number | null;
  nom_voie: string | null;
  nom_commune: string | null;
  lon: number;
  lat: number;
}

async function geocode(): Promise<{ point: PointWgs84; libelle: string } | null> {
  const res = await query<LigneAdresse>(
    `SELECT numero, nom_voie, nom_commune,
            ST_X(ST_Transform(geom, 4326)) AS lon,
            ST_Y(ST_Transform(geom, 4326)) AS lat
     FROM adresse_ban
     WHERE geom IS NOT NULL
       AND numero = 8
       AND nom_voie ILIKE '%Denfert%'
       AND nom_commune ILIKE '%Asni%'
     LIMIT 1;`,
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return { point: { lat: r.lat, lon: r.lon }, libelle: `${r.numero} ${r.nom_voie}, ${r.nom_commune}` };
}

interface LigneBatInterieur {
  id: number;
  cleabs: string;
  lon: number;
  lat: number;
}

async function pointInterieurBatiment(approx: PointWgs84): Promise<LigneBatInterieur | null> {
  const res = await query<LigneBatInterieur>(
    `WITH pt AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g)
     SELECT b.id, b.cleabs,
            ST_X(ST_Transform(ST_PointOnSurface(ST_Force2D(b.geom)), 4326)) AS lon,
            ST_Y(ST_Transform(ST_PointOnSurface(ST_Force2D(b.geom)), 4326)) AS lat
     FROM bdtopo_batiment b, pt
     ORDER BY ST_Force2D(b.geom) <-> pt.g
     LIMIT 1;`,
    [approx.lon, approx.lat],
  );
  return res.rows[0] ?? null;
}

async function main() {
  console.log("→ Géocodage de « 8 rue Denfert-Rochereau, 92600 Asnières-sur-Seine »…");
  const geo = await geocode();
  if (!geo) { console.error("✗ Adresse introuvable."); process.exitCode = 1; return; }

  const bat = await pointInterieurBatiment(geo.point);
  if (!bat) { console.error("✗ Aucun bâtiment à proximité."); process.exitCode = 1; return; }
  const pointInterieur: PointWgs84 = { lat: bat.lat, lon: bat.lon };
  console.log(`✓ Bâtiment ${bat.cleabs} (id ${bat.id}) — point intérieur lon/lat ${pointInterieur.lon}, ${pointInterieur.lat}`);

  const v = await validerOrigine(pointInterieur);
  if (!v.valide || v.batimentOrigine === null || v.altitudeTerrainOrigineM === null) {
    console.error("✗ Point intérieur non validé (ou altitude terrain absente) — abandon.");
    process.exitCode = 1;
    return;
  }
  console.log(`✓ valide=${v.valide} batimentOrigine.id=${v.batimentOrigine.id} altitudeTerrainOrigineM=${v.altitudeTerrainOrigineM}`);

  const etageTest = 3;
  const altitudeFenetreM = v.altitudeTerrainOrigineM + hauteurVision(etageTest);
  console.log(`✓ altitudeFenetreM = ${v.altitudeTerrainOrigineM} + hauteurVision(${etageTest}) = ${altitudeFenetreM} m NGF`);

  const azimutPrincipalDeg = 90;
  console.log(`→ Calcul des 61 faisceaux (axe principal ${azimutPrincipalDeg}°, ±90° au pas de 3°)…`);
  const faisceaux = await faisceauxAmplitude({
    point: pointInterieur,
    azimutPrincipalDeg,
    batimentOrigineId: v.batimentOrigine.id,
    altitudeFenetreM,
  });

  const total = faisceaux.length;
  const degages = faisceaux.filter((f) => f.distanceObstacleM === null).length;
  const avecObstacle = total - degages;
  const auMoins40 = faisceaux.filter(
    (f) => f.distanceObstacleM === null || f.distanceObstacleM >= THRESHOLD_M,
  ).length;
  const pct40 = (100 * auMoins40) / total;
  const moyenne =
    faisceaux.reduce(
      (acc, f) => acc + (f.distanceObstacleM === null ? CLEAR_BEAM_DIST_M : f.distanceObstacleM),
      0,
    ) / total;
  const avecDist = faisceaux.filter((f) => f.distanceObstacleM !== null);
  const min = avecDist.reduce(
    (m, f) => (f.distanceObstacleM! < m.distanceObstacleM! ? f : m),
    avecDist[0],
  );

  console.log("Résultats :");
  console.log("  total faisceaux       :", total);
  console.log("  dégagés (null)        :", degages);
  console.log("  avec obstacle         :", avecObstacle);
  console.log(`  % ≥ 40 m              : ${pct40.toFixed(1)} % (${auMoins40}/${total})`);
  console.log(`  distance moyenne      : ${moyenne.toFixed(2)} m (dégagé compté ${CLEAR_BEAM_DIST_M} m)`);
  if (min) {
    console.log(`  distance min obstacle : ${min.distanceObstacleM!.toFixed(2)} m à offset ${min.offsetDeg}°`);
  } else {
    console.log("  distance min obstacle : (aucun obstacle)");
  }
}

main()
  .catch((err) => { console.error("✗ Échec :", err.message); process.exitCode = 1; })
  .finally(() => closePool());
