import { query } from "./client";

export type AdresseProche = {
  cle: string;          // cle_d_interoperabilite (identifiant unique BAN)
  libelle: string;      // "12 bis Rue Victor Hugo, Asnières-sur-Seine"
  distanceM: number;    // distance en mètres au point GPS de référence
};

// Renvoie les adresses BAN dans un rayon (mètres) autour d'un point WGS84,
// triées par distance croissante. Le point de référence n'est JAMAIS modifié.
export async function adressesDansRayon(
  lat: number,
  lon: number,
  rayonM = 10,
): Promise<AdresseProche[]> {
  const sql = `
    WITH pt AS (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g
    )
    SELECT
      a.cle_d_interoperabilite AS cle,
      trim(
        concat_ws(' ',
          NULLIF(a.numero::text, ''),
          NULLIF(a.suffixe, ''),
          a.nom_voie
        )
      ) || ', ' || a.nom_commune AS libelle,
      ST_Distance(a.geom, pt.g) AS "distanceM"
    FROM adresse_ban a, pt
    WHERE ST_DWithin(a.geom, pt.g, $3)
    ORDER BY a.geom <-> pt.g
    LIMIT 20;
  `;
  const res = await query<AdresseProche>(sql, [lon, lat, rayonM]);
  return res.rows.map((r) => ({ ...r, distanceM: Math.round(Number(r.distanceM) * 10) / 10 }));
}
