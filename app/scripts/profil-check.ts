import { query, closePool } from "../lib/db/client";
import { hauteurLidarMaxNettoye } from "../lib/db/hauteurLidar";

// Point intérieur du bâtiment d'origine (axe de test réel).
const LON = 2.269431435588249;
const LAT = 48.90693182287072;

interface AxeWkt { id: number; axe_wkt: string; corr_wkt: string; }

/** Cas A — 319902 sur l'axe de test réel (origine du test, azimut 90°). */
async function casPlat(): Promise<AxeWkt | null> {
  const res = await query<AxeWkt>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians(90)),200*cos(radians(90)))) AS ligne FROM o)
     SELECT (SELECT id FROM bdtopo_batiment WHERE cleabs='BATIMENT0000000240319902') AS id,
            ST_AsText(ligne) AS axe_wkt, ST_AsText(ST_Buffer(ligne,1.0)) AS corr_wkt
     FROM axe;`,
    [LON, LAT],
  );
  return res.rows[0] ?? null;
}

/** Cas B — 240320058 (toit en pente) sur un axe construit pour le traverser. */
async function casPente(): Promise<AxeWkt | null> {
  // origine = centroïde − 80 m en x (plein ouest) ; azimut 90° → l'axe traverse le bâtiment vers 80 m.
  const res = await query<AxeWkt>(
    `WITH c AS (SELECT id, ST_Centroid(ST_Force2D(geom)) AS g FROM bdtopo_batiment WHERE cleabs='BATIMENT0000000240320058'),
     o AS (SELECT id, ST_Translate(c.g, -80, 0) AS g FROM c),
     axe AS (SELECT o.id, ST_MakeLine(o.g, ST_Translate(o.g,200*sin(radians(90)),200*cos(radians(90)))) AS ligne FROM o)
     SELECT id, ST_AsText(ligne) AS axe_wkt, ST_AsText(ST_Buffer(ligne,1.0)) AS corr_wkt FROM axe;`,
  );
  return res.rows[0] ?? null;
}

async function affiche(titre: string, a: AxeWkt | null) {
  console.log("=".repeat(70));
  console.log(titre);
  if (!a || a.id === null) { console.log("  (bâtiment introuvable)"); return; }
  const r = await hauteurLidarMaxNettoye({
    batimentId: a.id, corridorWkt: a.corr_wkt, axisLineWkt: a.axe_wkt,
  });
  console.log(`  id=${a.id}  npx=${r.npx}  eroded=${r.eroded}  picsRetires=${r.picsRetires}`);
  console.log(`  dFacadeM=${r.dFacadeM === null ? "null" : r.dFacadeM.toFixed(2)}  ` +
              `faîtage(hauteurM)=${r.hauteurM === null ? "null" : r.hauteurM.toFixed(2)}`);
  console.log(`  profil (${r.profil.length} bins) dist→alt :`);
  for (const p of r.profil) {
    console.log(`    ${p.distM.toFixed(2).padStart(7)}  ${p.altM.toFixed(2)}`);
  }
}

async function main() {
  await affiche("CAS A — 319902 (toit plat attendu, axe de test réel, az 90°)", await casPlat());
  await affiche("CAS B — 240320058 (toit en pente attendu, axe construit traversant)", await casPente());
  console.log("=".repeat(70));
}

main()
  .catch((e) => { console.error("✗ Échec :", e.message); process.exitCode = 1; })
  .finally(() => closePool());
