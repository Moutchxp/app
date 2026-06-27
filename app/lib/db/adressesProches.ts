import { query } from "./client";

export type AdresseProche = {
  cle: string;          // cle_d_interoperabilite (identifiant unique BAN)
  libelle: string;      // "12 bis Rue Victor Hugo, Asnières-sur-Seine"
  distanceM: number;    // distance en mètres au point GPS de référence
  memeParcelle: boolean; // true si l'adresse appartient à la parcelle (tolérance 1 m) sous le point
};

// Renvoie les adresses BAN de la PARCELLE DU BIEN (polygone couvrant le point, tolérance 1 m,
// memeParcelle=true) ∪ celles de la PARCELLE VOISINE la plus proche du point (hors la parcelle du
// bien, memeParcelle=false), dédupliquées par cle (memeParcelle prime). Tri : parcelle du bien
// d'abord, puis distance croissante. Le point de référence n'est JAMAIS modifié.
export async function adressesProches(
  lat: number,
  lon: number,
): Promise<AdresseProche[]> {
  const sql = `
    WITH pt AS (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g
    ),
    -- parcelle la plus proche du point
    par AS (
      SELECT p.id, p.geom AS g
      FROM parcelle p, pt
      ORDER BY p.geom <-> pt.g
      LIMIT 1
    ),
    -- on ne retient la parcelle du bien que si elle COUVRE le point
    par_ok AS (
      SELECT par.id, par.g FROM par, pt WHERE ST_Covers(par.g, pt.g)
    ),
    -- adresses de la parcelle du bien (tolérance 1 m, points BAN ~0,7 m hors emprise)
    dans_parcelle AS (
      SELECT a.cle_d_interoperabilite AS cle, a.geom AS ageom, true AS meme_parcelle
      FROM adresse_ban a, par_ok
      WHERE ST_DWithin(par_ok.g, a.geom, 1)
    ),
    -- parcelle voisine la plus proche du point (hors la parcelle du bien),
    -- seulement si la parcelle du bien couvre bien le point
    voisine AS (
      SELECT p.geom AS g
      FROM parcelle p, pt
      WHERE EXISTS (SELECT 1 FROM par_ok)
        AND p.id <> (SELECT id FROM par_ok)
      ORDER BY p.geom <-> pt.g
      LIMIT 1
    ),
    -- adresses de la parcelle voisine (tolérance 1 m)
    dans_voisine AS (
      SELECT a.cle_d_interoperabilite AS cle, a.geom AS ageom, false AS meme_parcelle
      FROM adresse_ban a, voisine
      WHERE ST_DWithin(voisine.g, a.geom, 1)
    ),
    -- union dédupliquée par cle : si une adresse est dans les deux, meme_parcelle = true prime
    fusion AS (
      SELECT cle, ageom, bool_or(meme_parcelle) AS meme_parcelle
      FROM (SELECT * FROM dans_parcelle UNION ALL SELECT * FROM dans_voisine) u
      GROUP BY cle, ageom
    )
    SELECT
      f.cle AS cle,
      trim(concat_ws(' ', NULLIF(a.numero::text, ''), NULLIF(a.suffixe, ''), a.nom_voie)) || ', ' || a.nom_commune AS libelle,
      ST_Distance(f.ageom, pt.g) AS "distanceM",
      f.meme_parcelle AS "memeParcelle"
    FROM fusion f
    JOIN adresse_ban a ON a.cle_d_interoperabilite = f.cle, pt
    ORDER BY f.meme_parcelle DESC, "distanceM" ASC
    LIMIT 50;
  `;
  const res = await query<AdresseProche>(sql, [lon, lat]);
  return res.rows.map((r) => ({ ...r, distanceM: Math.round(Number(r.distanceM) * 10) / 10 }));
}
