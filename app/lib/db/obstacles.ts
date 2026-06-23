/**
 * Détection d'obstacles sur l'axe principal (Mode B — BD TOPO®).
 *
 * Depuis un point d'origine validé + un azimut, trouve tous les bâtiments
 * coupés par un couloir de 2 m (±1 m) sur ANALYSIS_RANGE_M mètres, ordonnés par
 * distance, et résout leur altitude de toit (NGF) par la cascade Mode B.
 *
 * Produit le tableau ObstacleCandidat[] que premierObstacle consommera.
 * Ne calcule PAS le verdict ici. Aucun arrondi sur les distances.
 *
 * Repère L93 : x = Est, y = Nord. Azimut géographique θ (Nord, sens horaire)
 * → direction (dx, dy) = (sin θ, cos θ).
 */
import { query } from "./client";
import { balayerObstacle, type CelluleCouloir } from "../svv/balayageObstacle";
import type { PointWgs84 } from "../svv/geo";
import type { ObstacleCandidat, SourceHauteur } from "../svv/verdict";
import { ANALYSIS_RANGE_M, CORRIDOR_HALF_WIDTH_M, FLOOR_HEIGHT_M, THRESHOLD_M } from "../svv/config";

export interface ParametresAxe {
  point: PointWgs84;
  azimutDeg: number;
  batimentOrigineId: number;
  /** Emprise L93 (WKT, SRID 2154) du bâtiment d'origine. Transport pur : non consommé ici. */
  batimentOriginePolygoneWkt?: string;
  /**
   * true → enrichir chaque candidat avec la hauteur LiDAR (max nettoyé,
   * source LIDAR_HD) prioritaire sur la cascade BD TOPO. Réservé au COULOIR
   * PRINCIPAL ; les 61 faisceaux laissent ce flag à false (restent BD TOPO).
   */
  lidar?: boolean;
  /**
   * Altitude de la fenêtre (NGF). Requise avec lidar=true pour localiser le
   * point de contact (distanceM = dContact). Inutile pour les faisceaux.
   */
  altitudeFenetreM?: number;
}

interface LigneObstacle {
  id: number;
  cleabs: string;
  dist_m: number;
  amt: number | null; // altitude_maximale_toit
  h: number | null; // hauteur
  sol: number | null; // altitude_minimale_sol
  net: number | null; // nombre_d_etages
  corridor_wkt: string; // WKT L93 du couloir (identique sur toutes les lignes)
  axe_wkt: string; // WKT L93 de l'axe (demi-droite origine→portée)
}

/** Cascade hauteur Mode B → altitude de sommet (NGF) + source. */
function resoudreSommet(r: LigneObstacle): { altitudeSommetM: number | null; source: SourceHauteur } {
  // 1) altitude maximale de toit fournie.
  if (r.amt !== null) {
    return { altitudeSommetM: r.amt, source: "BD_TOPO" };
  }
  // 2) hauteur + altitude minimale du sol.
  if (r.h !== null && r.sol !== null) {
    return { altitudeSommetM: r.sol + r.h, source: "BD_TOPO" };
  }
  // 3) nombre d'étages × hauteur d'étage + altitude minimale du sol.
  if (r.net !== null && r.sol !== null) {
    return { altitudeSommetM: r.sol + r.net * FLOOR_HEIGHT_M, source: "BD_TOPO" };
  }
  // 4) indéterminé.
  return { altitudeSommetM: null, source: "NONE" };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHEMIN COULOIR PRINCIPAL (params.lidar) — balayage plein-couloir (spec §4-§9).
// Remplace le faîtage-par-bâtiment + pointDeContact pour l'axe principal UNIQUEMENT.
// Les 61 faisceaux (lidar=false) NE PASSENT PAS ici (cf. obstaclesSurAxe).
// ─────────────────────────────────────────────────────────────────────────────

/** Ligne de grille SQL : altitudes max (NGF) des 4 colonnes pour une ligne i. */
interface LigneGrilleSql {
  i: number;
  dist_m: number | string;
  a: number | string | null;
  b: number | string | null;
  c: number | string | null;
  d: number | string | null;
}

/** Une ligne de la grille couloir : indice + distance axe + altitudes des 4 colonnes. */
interface LigneGrille {
  i: number;
  distM: number;
  alt: (number | null)[]; // [a, b, c, d] ; null = pas de pixel bâti dans la colonne
}

/**
 * Échantillonne le couloir (4 colonnes × portée/0,5 lignes) du MNS bâti en UNE
 * passe : pré-filtre des emprises BD TOPO du couloir (origine exclue), ST_Clip du
 * MNS sur le couloir, pixels (centroïdes) rangés en (i = distance axe / 0,5,
 * j = colonne 0..3), max(mns) par cellule. Aucun arrondi (valeurs brutes NGF).
 */
async function echantillonnerGrille(params: ParametresAxe): Promise<LigneGrille[]> {
  const res = await query<LigneGrilleSql>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     d AS (SELECT sin(radians($3)) dx, cos(radians($3)) dy),      -- axe (x=E, y=N)
     t AS (SELECT cos(radians($3)) px, -sin(radians($3)) py),     -- transverse (perp.)
     axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g, $5*d.dx, $5*d.dy)) AS ln FROM o,d),
     corr AS (SELECT ST_Buffer(axe.ln, $6) AS g FROM axe),        -- couloir 2 m (±1)
     bati AS (
       SELECT ST_Union(ST_Force2D(b.geom)) AS g
       FROM bdtopo_batiment b, corr
       WHERE b.id <> $4 AND ST_Intersects(b.geom, corr.g)         -- index spatial
     ),
     px AS (                                                      -- MNS découpé en bloc (1 passe)
       SELECT (pc).geom AS p, (pc).val AS mns
       FROM (
         SELECT ST_PixelAsCentroids(ST_Clip(ST_Union(ST_Clip(r.rast, corr.g)), corr.g)) AS pc
         FROM mns_lidar_brut r, corr
         WHERE ST_Intersects(r.rast, corr.g)
         GROUP BY corr.g
       ) q
     ),
     cl AS (
       SELECT
         floor( ST_LineLocatePoint(axe.ln, px.p) * ST_Length(axe.ln) / 0.5 )::int AS i,
         least(3, greatest(0, floor( ( (ST_X(px.p)-ST_X(o.g))*t.px + (ST_Y(px.p)-ST_Y(o.g))*t.py + $6 ) / 0.5 )::int )) AS j,
         px.mns
       FROM px, o, t, axe, bati
       WHERE px.mns IS NOT NULL AND px.mns <> -9999
         AND ST_Intersects(px.p, bati.g)                          -- bâti seul
     )
     SELECT i, (i*0.5+0.25)::float8 AS dist_m,
       max(mns) FILTER (WHERE j=0) AS a,
       max(mns) FILTER (WHERE j=1) AS b,
       max(mns) FILTER (WHERE j=2) AS c,
       max(mns) FILTER (WHERE j=3) AS d
     FROM cl GROUP BY i ORDER BY i;`,
    [
      params.point.lon,
      params.point.lat,
      params.azimutDeg,
      params.batimentOrigineId,
      ANALYSIS_RANGE_M,
      CORRIDOR_HALF_WIDTH_M,
    ],
  );
  const num = (v: number | string | null): number | null => (v === null ? null : Number(v));
  return res.rows.map((r) => ({
    i: r.i,
    distM: Number(r.dist_m),
    alt: [num(r.a), num(r.b), num(r.c), num(r.d)],
  }));
}

/** Couverture LiDAR d'une cellule (centre dans l'emprise des dalles MNS) — INDÉPENDANT du bâti. */
interface LigneCouvertureSql {
  i: number;
  j: number;
  couvert: boolean;
}

/**
 * Couverture LiDAR par cellule du damier (4 colonnes × portée/0,5 lignes), TOUT en PostGIS :
 * emprise = ST_Union(ST_Envelope(rast)) des dalles MNS ∩ couloir (aucun filtre bâti — R1) ;
 * couvert = centre de cellule ∈ emprise. Aucune dalle → emprise NULL → couvert=false partout
 * (→ INDÉTERMINÉ, voulu). Centre calculé par la MÊME formule que calageFacade (l. ci-dessus).
 * Requête SÉPARÉE d'echantillonnerGrille : les altitudes (altM) restent strictement inchangées (R2).
 */
async function couvertureCellules(params: ParametresAxe): Promise<LigneCouvertureSql[]> {
  const nLignes = Math.floor(ANALYSIS_RANGE_M / 0.5);
  const res = await query<{ i: number; j: number; couvert: boolean }>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     d AS (SELECT sin(radians($3)) dx, cos(radians($3)) dy),      -- axe (x=E, y=N)
     t AS (SELECT cos(radians($3)) px, -sin(radians($3)) py),     -- transverse (perp.)
     axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g, $4*d.dx, $4*d.dy)) AS ln FROM o,d),
     corr AS (SELECT ST_Buffer(axe.ln, $5) AS g FROM axe),        -- couloir 2 m (±1)
     couverture AS (                                              -- emprise des DALLES (aucun filtre bâti)
       SELECT ST_Union(ST_Envelope(r.rast)) AS g
       FROM mns_lidar_brut r, corr
       WHERE ST_Intersects(r.rast, corr.g)
     ),
     centres AS (                                                 -- centre L93 de chaque cellule (i,j)
       SELECT i, j,
         ST_SetSRID(ST_MakePoint(
           ST_X(o.g) + ((i+0.5)*0.5)*d.dx + ((j-1.5)*0.5)*t.px,
           ST_Y(o.g) + ((i+0.5)*0.5)*d.dy + ((j-1.5)*0.5)*t.py),2154) AS centre
       FROM generate_series(0, $6-1) AS i, generate_series(0,3) AS j, o, d, t
     )
     SELECT i, j,
       COALESCE(ST_Intersects(centre, (SELECT g FROM couverture)), false) AS couvert
     FROM centres ORDER BY i, j;`,
    [
      params.point.lon,
      params.point.lat,
      params.azimutDeg,
      ANALYSIS_RANGE_M,
      CORRIDOR_HALF_WIDTH_M,
      nLignes,
    ],
  );
  return res.rows.map((r) => ({ i: r.i, j: r.j, couvert: r.couvert }));
}

/**
 * Calage façade sur la cellule retenue : reconstruit son centre L93, cherche le
 * bord d'emprise BD TOPO qui traverse la cellule de 0,5 m autour, et rend la
 * distance origine→bord le plus proche (sinon distance origine→centre cellule).
 */
async function calageFacade(params: ParametresAxe, distM: number, offM: number): Promise<number> {
  const res = await query<{ dist_m: number | string }>(
    `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
     dir AS (SELECT sin(radians($3)) dx, cos(radians($3)) dy),
     tr AS (SELECT cos(radians($3)) px, -sin(radians($3)) py),
     centre AS (
       SELECT ST_SetSRID(ST_MakePoint(ST_X(o.g)+$4*dir.dx+$5*tr.px,
                                      ST_Y(o.g)+$4*dir.dy+$5*tr.py),2154) AS c
       FROM o, dir, tr
     ),
     cell AS (SELECT ST_Expand(centre.c, 0.25) AS g FROM centre),  -- cellule 0,5 m
     bords AS (                                                    -- bord ∩ cellule (segment DANS la cellule)
       SELECT ST_Intersection(ST_Boundary(ST_Force2D(b.geom)), cell.g) AS seg
       FROM bdtopo_batiment b, cell
       WHERE b.id <> $6 AND ST_Intersects(ST_Boundary(ST_Force2D(b.geom)), cell.g)
     ),
     bord AS (                                                     -- point du segment le plus proche de l'origine
       SELECT ST_ClosestPoint(bs.seg, o.g) AS p
       FROM bords bs, o
       WHERE NOT ST_IsEmpty(bs.seg)                                -- ignore les intersections vides
       ORDER BY ST_Distance(bs.seg, o.g) ASC
       LIMIT 1
     )
     SELECT ST_Distance(o.g, COALESCE((SELECT p FROM bord), (SELECT c FROM centre))) AS dist_m
     FROM o;`,
    [params.point.lon, params.point.lat, params.azimutDeg, distM, offM, params.batimentOrigineId],
  );
  return Number(res.rows[0].dist_m);
}

/**
 * Couloir principal : échantillonne la grille, applique le balayage plein-couloir
 * et mappe le statut vers la sortie ObstacleCandidat[] que premierObstacle attend.
 *
 * `couvert` = vraie couverture LiDAR : emprise des dalles MNS (ST_Union(ST_Envelope(rast)))
 * testée au centre de chaque cellule (cf. couvertureCellules), INDÉPENDANTE du bâti.
 * Un trou réel (centre hors emprise) → couvert:false → SANS_DONNÉE → rallume INDÉTERMINÉ/degrade.
 * Les altitudes (altM) viennent uniquement d'echantillonnerGrille (inchangée).
 */
async function obstaclesParBalayage(params: ParametresAxe, hOeilM: number): Promise<ObstacleCandidat[]> {
  // 2 requêtes parallèles : altitudes (inchangées) + couverture par cellule (nouvelle dimension).
  const [grille, couverture] = await Promise.all([
    echantillonnerGrille(params),
    couvertureCellules(params),
  ]);

  const nLignes = Math.floor(ANALYSIS_RANGE_M / 0.5);
  // Lookup couvert[colonne][ligne], défaut false (cellules non renvoyées = non couvertes).
  const couvert: boolean[][] = [0, 1, 2, 3].map(() => Array.from({ length: nLignes }, () => false));
  for (const c of couverture) {
    if (c.i >= 0 && c.i < nLignes && c.j >= 0 && c.j < 4) couvert[c.j][c.i] = c.couvert;
  }

  // Init : altM null + couvert RÉEL (au lieu de true).
  const colonnes: CelluleCouloir[][] = [0, 1, 2, 3].map((k) =>
    Array.from({ length: nLignes }, (_, i): CelluleCouloir => ({ altM: null, couvert: couvert[k][i] })),
  );
  // Remplissage : alt depuis grille (INCHANGÉ) ; couvert depuis couverture (jamais dérivé du bâti).
  for (const g of grille) {
    if (g.i < 0 || g.i >= nLignes) continue;
    for (let k = 0; k < 4; k++) {
      const v = g.alt[k];
      if (v !== null) colonnes[k][g.i] = { altM: v, couvert: couvert[k][g.i] };
    }
  }

  const bal = balayerObstacle({
    colonnes,
    hOeilM,
    pasM: 0.5,
    profondeurFenetre: 6,
    seuilM: THRESHOLD_M,
  });

  // OBSTACLE → un candidat réel (sommet ≥ œil) à la distance calée sur la façade.
  if (bal.statut === "OBSTACLE" && bal.ligne !== null && bal.colonne !== null) {
    const altSommet = colonnes[bal.colonne][bal.ligne].altM;
    if (altSommet !== null) {
      const distM = (bal.ligne + 0.5) * 0.5;
      const offM = (bal.colonne - 1.5) * 0.5;
      const distanceM = await calageFacade(params, distM, offM);
      return [{ distanceM, altitudeSommetM: altSommet, source: "LIDAR_HD" }];
    }
  }

  // INDETERMINE → NONE à < seuil (premierObstacle conclut INDETERMINE). Dormant ici.
  if (bal.statut === "INDETERMINE") {
    return [{ distanceM: 0, altitudeSommetM: null, source: "NONE" }];
  }

  // DEGAGE → aucun obstacle. Si dégradé (trou ≥ seuil), propage via un NONE ≥ seuil
  // (canal analyseDegradee/messageDegrade existant). Dormant sous l'hypothèse couvert=true.
  if (bal.degrade) {
    return [{ distanceM: ANALYSIS_RANGE_M, altitudeSommetM: null, source: "NONE" }];
  }
  return [];
}

export async function obstaclesSurAxe(params: ParametresAxe): Promise<ObstacleCandidat[]> {
  // Couloir principal (lidar + altitude de fenêtre connue) → balayage plein-couloir.
  // Faisceaux (lidar=false) ET appels lidar sans hOeil (diagnostics) → chemin historique ci-dessous.
  if (params.lidar && params.altitudeFenetreM !== undefined) {
    return obstaclesParBalayage(params, params.altitudeFenetreM);
  }

  const res = await query<LigneObstacle>(
    `WITH o AS (
       SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g
     ),
     axe AS (
       SELECT o.g AS origine,
              ST_MakeLine(o.g, ST_Translate(o.g, $4*sin(radians($3)), $4*cos(radians($3)))) AS ligne
       FROM o
     ),
     couloir AS (
       SELECT origine, ligne, ST_Buffer(ligne, $5) AS corr FROM axe
     )
     SELECT b.id, b.cleabs,
            ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m,
            b.altitude_maximale_toit AS amt, b.hauteur AS h,
            b.altitude_minimale_sol AS sol, b.nombre_d_etages AS net,
            ST_AsText(c.corr) AS corridor_wkt,
            ST_AsText(c.ligne) AS axe_wkt
     FROM bdtopo_batiment b, couloir c
     WHERE ST_Intersects(ST_Force2D(b.geom), c.corr)
       AND b.id <> $6
     ORDER BY dist_m ASC;`,
    [
      params.point.lon,
      params.point.lat,
      params.azimutDeg,
      ANALYSIS_RANGE_M,
      CORRIDOR_HALF_WIDTH_M,
      params.batimentOrigineId,
    ],
  );

  const candidats = await Promise.all(
    res.rows.map(async (r): Promise<ObstacleCandidat> => {
      // Faisceaux (lidar=false) : comportement inchangé, distanceM = distance façade.
      const { altitudeSommetM, source } = resoudreSommet(r);
      return { distanceM: r.dist_m, altitudeSommetM, source };
    }),
  );

  // Le point de contact peut réordonner les candidats : re-tri par distance croissante.
  return candidats.sort((a, b) => a.distanceM - b.distanceM);
}
