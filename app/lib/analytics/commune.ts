import 'server-only';
import { queryAnalytics } from './pool';
import { communeInsee } from './contexte';

/**
 * M2 — Analytics, LOT 2. Dérivation « commune SANS coordonnée ». On a besoin de la commune (grain géo
 * unique du store, SPEC_M2_rgpd §A.3) mais on ne DOIT JAMAIS stocker la lat/lon. Cette fonction dérive le
 * code INSEE de la commune la PLUS PROCHE (KNN sur `adresse_ban`, index GiST) et ne renvoie QUE les 5
 * caractères INSEE — la coordonnée est utilisée en vol puis JETÉE, elle n'entre jamais dans l'événement.
 *
 * Appelée UNIQUEMENT dans un `after()` (post-réponse) → aucun impact sur la latence du tunnel. Passe par
 * le pool analytique DÉDIÉ (`queryAnalytics`, `statement_timeout` court) → ne peut pas affamer le calcul.
 * NE THROW JAMAIS (best-effort) : toute erreur → `null` (l'événement partira sans commune, jamais d'échec).
 *
 * ⚠️ `adresse_ban.geom` est en Lambert-93 (EPSG:2154) — on transforme le point WGS84 avant le KNN
 * (cohérent avec l'invariant SVAV « distances en L93 »). `ST_Force2D` non requis (géométrie déjà 2D côté BAN).
 */
export async function communeDuPoint(lat: number, lon: number): Promise<string | null> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  try {
    const r = await queryAnalytics<{ insee: string | null }>(
      `SELECT insee_commune AS insee
         FROM adresse_ban
        ORDER BY geom <-> ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154)
        LIMIT 1`,
      [lon, lat], // ⚠️ ST_MakePoint(x=lon, y=lat)
    );
    // Re-validation stricte : même issu de la base, on ne laisse passer qu'un INSEE 5 car conforme.
    return communeInsee(r.rows[0]?.insee ?? null);
  } catch {
    return null; // best-effort : jamais d'exception vers l'appelant (after()/route)
  }
}
