import { query, closePool } from "../lib/db/client";
import { analyserAdresse } from "../lib/db/pipeline";
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

interface LigneBatInterieur { id: number; cleabs: string; lon: number; lat: number; }

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
  const point: PointWgs84 = { lat: bat.lat, lon: bat.lon };
  console.log(`✓ Bâtiment ${bat.cleabs} (id ${bat.id}) — point intérieur lon/lat ${point.lon}, ${point.lat}`);

  const azimutPrincipalDeg = 90;
  const etage = 3;
  console.log(`→ analyserAdresse (azimut ${azimutPrincipalDeg}°, étage ${etage}, dernierEtage=false)…\n`);
  const { validation, resultat } = await analyserAdresse({
    point,
    azimutPrincipalDeg,
    etage,
    dernierEtage: false,
  });

  console.log("── VALIDATION ──");
  console.log("  valide                  :", validation.valide);
  console.log("  cleabs                  :", validation.batimentOrigine?.cleabs ?? null);
  console.log("  altitudeTerrainOrigineM :", validation.altitudeTerrainOrigineM);

  if (resultat === null) {
    console.log("\n✗ Pas de résultat : point d'origine non validé —", validation.raison);
    return;
  }

  const { verdict, score, distanceAxePrincipalM } = resultat;
  // altitude fenêtre recomposée pour l'affichage (terrain + hauteurVision(etage))
  console.log("\n── VERDICT ──");
  console.log("  verdict                 :", verdict.verdict);
  console.log("  distanceM               :", verdict.distanceM);
  console.log("  raison                  :", verdict.raison);
  console.log("  analyseDegradee         :", verdict.analyseDegradee);
  console.log("  messageDegrade          :", verdict.messageDegrade);

  console.log("\n── SCORE /100 ──");
  console.log("  total                   :", score.total);
  console.log("  libelle                 :", score.libelle);
  console.log("  scorePartiel            :", score.scorePartiel);
  console.log("  Famille 1 (dégagement)  :", score.famille1.total, {
    distance: score.famille1.distance,
    amplitude: score.famille1.amplitude,
    orientation: score.famille1.orientation,
    partA: score.famille1.detail.amplitudePartA,
    partB: score.famille1.detail.amplitudePartB,
    penaliteFlanc: score.famille1.detail.penaliteFlancAppliquee,
    pctDegages: score.famille1.detail.pourcentageFaisceauxDegages,
    moyenneProfondeurM: score.famille1.detail.moyenneProfondeurM,
    secteur: score.famille1.detail.secteurOrientation,
  });
  console.log("  Famille 2 (paysage)     :", score.famille2.total, {
    typeDominant: score.famille2.typeDominant,
    remarquables: score.famille2.remarquables,
    proprete: score.famille2.proprete,
    scorePartiel: score.famille2.scorePartiel,
  });

  console.log("\n── AUDIT ──");
  console.log("  distanceAxePrincipalM   :", distanceAxePrincipalM);
}

main()
  .catch((err) => { console.error("✗ Échec :", err.message); process.exitCode = 1; })
  .finally(() => closePool());
