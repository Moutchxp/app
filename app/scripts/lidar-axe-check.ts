import { query, closePool } from "../lib/db/client";
import { analyserAdresse } from "../lib/db/pipeline";
import { obstaclesSurAxe } from "../lib/db/obstacles";
import { hauteurVision } from "../lib/svv/config";
import type { PointWgs84 } from "../lib/svv/geo";

const AZ = 90;
const ETAGE = 3;

interface LigneAdresse { lon: number; lat: number; libelle: string; }

async function geocode(): Promise<LigneAdresse | null> {
  const res = await query<LigneAdresse>(
    `SELECT ST_X(ST_Transform(geom,4326)) AS lon, ST_Y(ST_Transform(geom,4326)) AS lat,
            (numero || ' ' || nom_voie || ', ' || nom_commune) AS libelle
     FROM adresse_ban
     WHERE geom IS NOT NULL AND numero=8 AND nom_voie ILIKE '%Denfert%' AND nom_commune ILIKE '%Asni%'
     LIMIT 1;`,
  );
  return res.rows[0] ?? null;
}

async function pointInterieur(approx: PointWgs84): Promise<PointWgs84 | null> {
  const res = await query<{ lon: number; lat: number }>(
    `WITH pt AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g)
     SELECT ST_X(ST_Transform(ST_PointOnSurface(ST_Force2D(b.geom)),4326)) AS lon,
            ST_Y(ST_Transform(ST_PointOnSurface(ST_Force2D(b.geom)),4326)) AS lat
     FROM bdtopo_batiment b, pt ORDER BY ST_Force2D(b.geom) <-> pt.g LIMIT 1;`,
    [approx.lon, approx.lat],
  );
  return res.rows[0] ? { lat: res.rows[0].lat, lon: res.rows[0].lon } : null;
}

/** Cascade BD TOPO (sommet) par bâtiment d'axe, ordonné par distance (même ordre que obstaclesSurAxe). */
async function cascadesAxe(point: PointWgs84, origineId: number): Promise<number[]> {
  const res = await query<{ cascade: number | null }>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians($3)),200*cos(radians($3)))) AS ligne FROM o),
     couloir AS (SELECT ST_Buffer(ligne,1.0) AS corr FROM axe)
     SELECT COALESCE(b.altitude_maximale_toit, b.altitude_minimale_sol+b.hauteur,
                     b.altitude_minimale_sol+b.nombre_d_etages*2.90) AS cascade
     FROM bdtopo_batiment b, couloir c, o
     WHERE ST_Intersects(ST_Force2D(b.geom), c.corr) AND b.id <> $4
     ORDER BY ST_Distance(ST_Force2D(b.geom), o.g) ASC;`,
    [point.lon, point.lat, AZ, origineId],
  );
  return res.rows.map((r) => (r.cascade === null ? NaN : Number(r.cascade)));
}

async function main() {
  const geo = await geocode();
  if (!geo) { console.error("✗ Adresse introuvable."); process.exitCode = 1; return; }
  const point = await pointInterieur({ lat: geo.lat, lon: geo.lon });
  if (!point) { console.error("✗ Aucun bâtiment."); process.exitCode = 1; return; }
  console.log(`Adresse : ${geo.libelle}`);
  console.log(`Point intérieur : lon ${point.lon}, lat ${point.lat} | axe ${AZ}° | étage ${ETAGE}\n`);

  const { validation, resultat } = await analyserAdresse({
    point, azimutPrincipalDeg: AZ, etage: ETAGE, dernierEtage: false,
  });
  if (resultat === null || validation.batimentOrigine === null || validation.altitudeTerrainOrigineM === null) {
    console.error("✗ Point non validé :", validation.raison); process.exitCode = 1; return;
  }
  const altFenetre = validation.altitudeTerrainOrigineM + hauteurVision(ETAGE);
  console.log(`altitudeTerrainOrigine=${validation.altitudeTerrainOrigineM}  →  altitudeFenetre=${altFenetre.toFixed(2)} m NGF\n`);

  const candidats = await obstaclesSurAxe({
    point, azimutDeg: AZ, batimentOrigineId: validation.batimentOrigine.id, lidar: true,
  });
  const cascades = await cascadesAxe(point, validation.batimentOrigine.id);

  const hdr = `${"#".padStart(3)} ${"dist".padStart(8)} ${"altSommet".padStart(10)} ${"source".padStart(9)} ${"cascadeBDT".padStart(10)} ${"≥fenêtre".padStart(9)}`;
  console.log(hdr);
  console.log("-".repeat(hdr.length));
  candidats.forEach((c, i) => {
    const casc = cascades[i];
    const alt = c.altitudeSommetM === null ? "null" : c.altitudeSommetM.toFixed(2);
    const cascS = Number.isFinite(casc) ? casc.toFixed(2) : "NONE";
    const bloque = c.altitudeSommetM !== null && c.altitudeSommetM >= altFenetre ? "OUI" : "non";
    console.log(
      `${String(i + 1).padStart(3)} ${c.distanceM.toFixed(2).padStart(8)} ${alt.padStart(10)} ` +
      `${c.source.padStart(9)} ${cascS.padStart(10)} ${bloque.padStart(9)}`,
    );
  });

  console.log(`\nVERDICT : ${resultat.verdict.verdict}  |  distanceM = ${resultat.verdict.distanceM}`);
  console.log(`raison  : ${resultat.verdict.raison}`);
  if (resultat.verdict.analyseDegradee) console.log(`dégradé : ${resultat.verdict.messageDegrade}`);
}

main()
  .catch((e) => { console.error("✗ Échec :", e.message); process.exitCode = 1; })
  .finally(() => closePool());
