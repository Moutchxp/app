import { POST } from "../api/origine/route";
import { query, closePool } from "../lib/db/client";

// Point intérieur du bâtiment d'origine (8 rue Denfert-Rochereau, Asnières).
const ORIGINE = { lat: 48.90693182287072, lon: 2.269431435588249 };

function reqPost(body: unknown): Request {
  return new Request("http://local/api/origine", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function appelle(titre: string, body: unknown) {
  const res = await POST(reqPost(body));
  const json = await res.json();
  console.log("=".repeat(70));
  console.log(`${titre}  (HTTP ${res.status})`);
  console.log(`  statut                  : ${json.statut}`);
  console.log(`  valide                  : ${json.valide}`);
  console.log(`  message                 : ${json.message}`);
  console.log(`  dansBatiment            : ${json.dansBatiment}`);
  console.log(`  distanceAuBatimentM     : ${json.distanceAuBatimentM}`);
  console.log(`  altitudeTerrainOrigineM : ${json.altitudeTerrainOrigineM}`);
}

/** Point clairement dans la rue à ~45 m de l'origine (clairance max vers le bâti). */
async function pointRue(): Promise<{ lat: number; lon: number }> {
  const res = await query<{ lat: number; lon: number }>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     cand AS (
       SELECT az, ST_Translate(o.g, 45*sin(radians(az)), 45*cos(radians(az))) AS p
       FROM o, generate_series(0,350,10) AS az
     )
     SELECT ST_X(ST_Transform(cand.p,4326)) AS lon, ST_Y(ST_Transform(cand.p,4326)) AS lat
     FROM cand,
          LATERAL (SELECT MIN(ST_Distance(ST_Force2D(b.geom), cand.p)) AS dmin
                   FROM bdtopo_batiment b WHERE ST_DWithin(ST_Force2D(b.geom), cand.p, 80)) d
     ORDER BY d.dmin DESC NULLS LAST
     LIMIT 1;`,
    [ORIGINE.lon, ORIGINE.lat],
  );
  return { lat: res.rows[0].lat, lon: res.rows[0].lon };
}

async function main() {
  await appelle("(a) Point d'origine — intérieur bâtiment (attendu VALIDE)", ORIGINE);
  const rue = await pointRue();
  await appelle(`(b) Point dans la rue (~45 m) lon ${rue.lon.toFixed(6)}, lat ${rue.lat.toFixed(6)} (attendu HORS_BATIMENT)`, rue);
  console.log("=".repeat(70));
}

main()
  .catch((e) => { console.error("✗ Échec :", e.message); process.exitCode = 1; })
  .finally(() => closePool());
