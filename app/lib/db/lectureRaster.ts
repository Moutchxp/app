/**
 * ══ LECTURE D'UNE TUILE LiDAR PAR L'INDEX (lot « LENTEUR DU MOTEUR SUR LiDAR RÉEL », 15/10/2026) ═══════════════════════
 *
 * CAUSE ÉTABLIE (plans EXPLAIN du serveur, 4 141 dalles ≈ 102 000 tuiles) : `ST_Intersects(rast, géométrie)` est une fonction
 * SQL de PostGIS — `SELECT $1::geometry && $2 AND _st_intersects($2, $1, $3)` — qui cite DEUX FOIS sa géométrie. PostgreSQL
 * ne la déplie (et n'atteint l'index GiST `st_convexhull(rast)` par le `&&`) que si cette géométrie est bon marché, une
 * simple colonne ; quand c'est une EXPRESSION (`ST_PointOnSurface(...)`, `ST_SetSRID(ST_MakePoint(...))`), il refuse de la
 * dupliquer, garde la fonction opaque, et lit TOUTE la table à chaque appel : « Seq Scan on mns_lidar_brut … Rows Removed
 * by Filter: 101887 », 566 ms par point × 400 points (profil d'axe, 224 s) ; 659 ms par bâtiment × ~10 × 61 faisceaux (185 s).
 * Même avec `enable_seqscan = off`, le planificateur n'a aucun autre chemin.
 *
 * LE CORRECTIF : écrire nous-mêmes le préfiltre que PostGIS aurait déplié, `ST_ConvexHull(rast) && point` — c'est l'expression
 * EXACTE de l'index — devant le `ST_Intersects` inchangé. Il en est la première moitié : il ne retire aucune tuile que
 * `ST_Intersects` aurait gardée.
 *
 * ET LE MÊME DÉPARTAGE QU'AVANT, AU BIT PRÈS : la lecture prend UNE tuile (`LIMIT 1`). Un point posé EXACTEMENT sur le bord
 * commun de deux tuiles (ou un coin de quatre) les intersecte toutes, et ST_Value n'y rend pas la même chose. L'ancien
 * parcours séquentiel rendait la PREMIÈRE dans l'ordre physique du tas, c'est-à-dire le plus petit `ctid` ; l'index, lui,
 * rend les tuiles dans l'ordre de l'arbre. `ORDER BY ctid` restitue le choix d'avant (tri de 1 à 4 lignes, sans coût).
 *
 * PUR : rien que du texte SQL, aucun import.
 */

/**
 * `FROM <table> <alias> WHERE … ORDER BY … LIMIT 1` : la tuile de `table` qui contient `point`, celle que l'ancien parcours
 * séquentiel aurait rendue, trouvée par l'index. `point` est une expression SQL de géométrie L93 (2D) ; elle est citée deux
 * fois, comme dans l'ancien `ST_Intersects`.
 */
export function sqlTuileContenant(table: 'mns_lidar_brut' | 'mnt_lidar_brut', alias: string, point: string): string {
  return `FROM ${table} ${alias}
          WHERE ST_ConvexHull(${alias}.rast) && ${point} AND ST_Intersects(${alias}.rast, ${point})
          ORDER BY ${alias}.ctid LIMIT 1`;
}
