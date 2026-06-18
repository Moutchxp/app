import { query, closePool } from "../lib/db/client";
import { validerOrigine } from "../lib/db/origine";
import type { PointWgs84 } from "../lib/svv/geo";

interface LigneAdresse {
  numero: number | null;
  nom_voie: string | null;
  nom_commune: string | null;
  lon: number;
  lat: number;
}

const SELECT_ADRESSE = `
  SELECT numero, nom_voie, nom_commune,
         ST_X(ST_Transform(geom, 4326)) AS lon,
         ST_Y(ST_Transform(geom, 4326)) AS lat
  FROM adresse_ban
  WHERE geom IS NOT NULL`;

async function geocode(): Promise<{ point: PointWgs84; libelle: string; critere: string } | null> {
  // 1) Tentative exacte : 8 rue Denfert-Rochereau, Asnières-sur-Seine.
  const exact = await query<LigneAdresse>(
    `${SELECT_ADRESSE}
       AND numero = 8
       AND nom_voie ILIKE 'Rue Denfert-Rochereau'
       AND nom_commune ILIKE 'Asnières-sur-Seine'
     LIMIT 1;`,
  );
  if (exact.rows.length > 0) {
    const r = exact.rows[0];
    return {
      point: { lat: r.lat, lon: r.lon },
      libelle: `${r.numero} ${r.nom_voie}, ${r.nom_commune}`,
      critere: "exact (numéro 8 + 'Rue Denfert-Rochereau' + 'Asnières-sur-Seine')",
    };
  }

  // 2) Recherche tolérante : numéro 8, voie contenant "Denfert", commune contenant "Asnières".
  const tolerant = await query<LigneAdresse>(
    `${SELECT_ADRESSE}
       AND numero = 8
       AND nom_voie ILIKE '%Denfert%'
       AND nom_commune ILIKE '%Asni%'
     LIMIT 1;`,
  );
  if (tolerant.rows.length > 0) {
    const r = tolerant.rows[0];
    return {
      point: { lat: r.lat, lon: r.lon },
      libelle: `${r.numero} ${r.nom_voie}, ${r.nom_commune}`,
      critere: "tolérant (numéro 8 + voie ~ 'Denfert' + commune ~ 'Asnières')",
    };
  }

  return null;
}

async function main() {
  console.log("→ Géocodage de « 8 rue Denfert-Rochereau, 92600 Asnières-sur-Seine »…");
  const geo = await geocode();
  if (!geo) {
    console.error("✗ Adresse introuvable dans adresse_ban (exact + tolérant).");
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Adresse trouvée [${geo.critere}] : ${geo.libelle}`);
  console.log(`  lon/lat (WGS84) : ${geo.point.lon}, ${geo.point.lat}`);

  console.log("→ Validation du point d'origine (Mode B)…");
  const v = await validerOrigine(geo.point);

  console.log("Résultat :");
  console.log("  valide                  :", v.valide);
  console.log("  dansBatiment            :", v.dansBatiment);
  console.log("  distanceAuBatimentM     :", v.distanceAuBatimentM);
  console.log("  batiment cleabs         :", v.batimentOrigine?.cleabs ?? null);
  console.log("  batiment id             :", v.batimentOrigine?.id ?? null);
  console.log("  altitudeTerrainOrigineM :", v.altitudeTerrainOrigineM);
  console.log("  raison                  :", v.raison);
}

main()
  .catch((err) => { console.error("✗ Échec :", err.message); process.exitCode = 1; })
  .finally(() => closePool());
