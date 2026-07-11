import 'server-only';
import { withTransaction } from '../../db/client';

/**
 * M2 — LOT 6. RÉFÉRENTIEL CARTOGRAPHIQUE des communes (pure géo : code INSEE → nom + centroïde WGS84).
 * Dérivé UNE FOIS de `adresse_ban` (points d'adresses BAN, EPSG:2154), MÉMOÏSÉ au niveau module (le
 * périmètre est stable — ~137 communes Paris + couronne).
 *
 * ⚠️ CE N'EST PAS UNE VENTILATION ANALYTIQUE : aucun compteur, aucune donnée de trafic n'entre ici → c'est
 * HORS k-anonymat (on cartographie un TERRITOIRE, pas une population). Le référentiel renvoie TOUJOURS toutes
 * les communes du périmètre, qu'il y ait eu du trafic ou non. Il ne peut donc rien divulguer sur les tests :
 * un centroïde de commune est une donnée publique (INSEE/IGN), pas une position de logement.
 *
 * COHÉRENCE DES CODES : `insee_commune` vient de la MÊME colonne que le rattachement analytique
 * (`commune.ts`, KNN sur `adresse_ban`) → tout code INSEE vu dans les compteurs a son centroïde ici (le KNN
 * n'apparie que des adresses à géométrie non nulle, donc une commune vue en analytics a un centroïde ; une
 * commune sans géométrie exploitable serait ignorée — filtre `lon/lat null` ci-dessous — et resterait alors
 * en liste, hors carte, avec un compte « non localisées » côté UI). ST_Force2D avant le centroïde : invariant
 * SVAV (ne jamais retirer ST_Force2D des
 * opérations géométriques) ; no-op si la géométrie est déjà 2D. ST_Centroid(ST_Collect(points)) = centre
 * pondéré par les adresses (≈ centre habité) — repère cartographique suffisant, PAS le centroïde
 * administratif officiel (assumé : un point d'ancrage de bulle, pas une frontière).
 */

export interface CentroideCommune {
  nom: string;
  centroid: [number, number]; // [lon, lat] WGS84 (ordre GeoJSON ; Leaflet attend [lat, lon] → inversé au tracé)
}
export type RefCommunes = Record<string, CentroideCommune>;

/** Borne d'infra : la dérivation agrège ~558k points une fois par process. Pas une variable de comportement. */
const TIMEOUT_MS = 8000;

let cache: Promise<RefCommunes> | null = null;

async function charger(): Promise<RefCommunes> {
  return withTransaction(async (q) => {
    await q('SET TRANSACTION READ ONLY'); // lecture seule réelle (jamais d'écriture, même par accident)
    await q(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
    const r = await q<{ insee: string; nom: string | null; lon: number | null; lat: number | null }>(
      `SELECT insee_commune AS insee,
              MAX(nom_commune) AS nom,
              ST_X(ST_Transform(ST_Centroid(ST_Collect(ST_Force2D(geom))), 4326)) AS lon,
              ST_Y(ST_Transform(ST_Centroid(ST_Collect(ST_Force2D(geom))), 4326)) AS lat
         FROM adresse_ban
        WHERE insee_commune IS NOT NULL
        GROUP BY insee_commune`,
    );
    const ref: RefCommunes = {};
    for (const row of r.rows) {
      if (row.lon == null || row.lat == null) continue; // commune sans géométrie exploitable → non cartographiable
      ref[row.insee] = { nom: row.nom ?? row.insee, centroid: [Number(row.lon), Number(row.lat)] };
    }
    return ref;
  });
}

/**
 * Référentiel cartographique mémoïsé (UNE dérivation par process). Une ERREUR n'est PAS mise en cache : on
 * remet `cache` à null dans le `.catch` → la requête suivante réessaie (jamais un échec figé pour la vie du process).
 */
export function refCommunes(): Promise<RefCommunes> {
  if (!cache) {
    cache = charger().catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}
