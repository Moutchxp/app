import { query, closePool } from "../lib/db/client";
import { validerOrigine } from "../lib/db/origine";
import { obstaclesSurAxe } from "../lib/db/obstacles";
import type { PointWgs84 } from "../lib/svv/geo";

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

/** Bâtiment le plus proche du point + un point GARANTI à l'intérieur (ST_PointOnSurface). */
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
  if (!geo) {
    console.error("✗ Adresse introuvable dans adresse_ban.");
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Point approx (BAN) : ${geo.libelle} — lon/lat ${geo.point.lon}, ${geo.point.lat}`);

  console.log("→ Bâtiment le plus proche + point intérieur garanti (ST_PointOnSurface)…");
  const bat = await pointInterieurBatiment(geo.point);
  if (!bat) {
    console.error("✗ Aucun bâtiment à proximité.");
    process.exitCode = 1;
    return;
  }
  const pointInterieur: PointWgs84 = { lat: bat.lat, lon: bat.lon };
  console.log(`✓ Bâtiment ${bat.cleabs} (id ${bat.id}) — point intérieur lon/lat ${pointInterieur.lon}, ${pointInterieur.lat}`);

  console.log("→ Validation de ce point intérieur…");
  const v = await validerOrigine(pointInterieur);
  console.log(`  valide=${v.valide} dansBatiment=${v.dansBatiment} batimentOrigine.id=${v.batimentOrigine?.id ?? null} altitudeTerrainOrigineM=${v.altitudeTerrainOrigineM}`);
  if (!v.valide || v.batimentOrigine === null) {
    console.error("✗ Point intérieur non validé — abandon.");
    process.exitCode = 1;
    return;
  }

  const azimutDeg = 90; // plein Est
  console.log(`→ Détection d'obstacles sur l'axe (azimut ${azimutDeg}°, couloir 2 m, portée 200 m)…`);
  const obstacles = await obstaclesSurAxe({
    point: pointInterieur,
    azimutDeg,
    batimentOrigineId: v.batimentOrigine.id,
  });

  console.log(`✓ ${obstacles.length} candidat(s) :`);
  obstacles.forEach((o, i) => {
    console.log(
      `  #${String(i + 1).padStart(2, " ")}  dist=${o.distanceM.toFixed(2)} m  ` +
        `altitudeSommetM=${o.altitudeSommetM === null ? "null" : o.altitudeSommetM.toFixed(2)}  ` +
        `source=${o.source}`,
    );
  });
}

main()
  .catch((err) => { console.error("✗ Échec :", err.message); process.exitCode = 1; })
  .finally(() => closePool());
