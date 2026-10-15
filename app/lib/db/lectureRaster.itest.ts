/**
 * ÉQUIVALENCE ANCIEN / NOUVEAU SQL DES LECTURES LiDAR (lot LENTEUR DU MOTEUR SUR LiDAR RÉEL, 15/10/2026).
 *
 * Données SYNTHÉTIQUES, rien de réel n'est lu ni écrit : dans UNE transaction terminée par ROLLBACK, des tables TEMPORAIRES
 * `mns_lidar_brut` / `mnt_lidar_brut` (même structure, même index GiST `st_convexhull(rast)`) masquent les vraies le temps du
 * test (le schéma temporaire est cherché en premier). Elles portent un damier de tuiles de 10 m (20 × 20 px de 0,5 m), insérées
 * dans le DÉSORDRE (l'ordre physique n'est ni spatial ni celui des rid), avec : une tuile MANQUANTE (trou de couverture), des
 * pixels nodata (valeur de nodata de la bande → ST_Value NULL), une tuile SANS valeur de nodata déclarée qui stocke -9999 en
 * clair (filtre `<> -9999`), et une tuile en DOUBLON qui recouvre une autre avec d'autres valeurs (le départage compte).
 *
 * Ancien SQL : le texte d'avant le lot, mot pour mot, lu en parcours séquentiel (son seul plan possible). Nouveau SQL : le
 * fragment `sqlTuileContenant` du moteur, lu par l'INDEX (parcours séquentiel interdit, et le plan est vérifié). Points testés :
 * une grille au pas de 0,25 m qui tombe sur TOUS les bords et coins de tuiles, plus des points quelconques.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { PoolClient } from 'pg';
import { pool, closePool } from './client';
import { sqlTuileContenant } from './lectureRaster';

afterAll(async () => {
  await closePool();
});

const X0 = 700000; // coin Sud-Ouest du damier (L93, loin de toute donnée réelle — et les tables réelles sont masquées)
const Y0 = 6000000;
const TUILE_M = 10;

/** Construit les tables temporaires et leur damier (4 colonnes × 3 lignes de tuiles, moins un trou, plus un doublon). */
async function preparerDamier(c: PoolClient): Promise<void> {
  for (const table of ['mns_lidar_brut', 'mnt_lidar_brut']) {
    await c.query(`CREATE TEMP TABLE ${table} (rid serial PRIMARY KEY, rast raster) ON COMMIT DROP`);
  }
  const tuiles: { col: number; lig: number; graine: number; nodataDeclare: boolean }[] = [];
  for (let lig = 0; lig < 3; lig++) {
    for (let col = 0; col < 4; col++) {
      if (col === 2 && lig === 1) continue; // TROU de couverture
      tuiles.push({ col, lig, graine: lig * 4 + col, nodataDeclare: !(col === 3 && lig === 2) });
    }
  }
  tuiles.push({ col: 1.05, lig: 1.05, graine: 99, nodataDeclare: true }); // DOUBLON recouvrant (1,1) décalé d'un pixel, autres valeurs
  const ordre = [7, 2, 11, 0, 9, 4, 1, 10, 5, 3, 8, 6].filter((k) => k < tuiles.length); // désordre physique
  for (const k of tuiles.map((_, i) => i).sort((a, b) => (ordre.indexOf(a) + 100 * +(ordre.indexOf(a) < 0)) - (ordre.indexOf(b) + 100 * +(ordre.indexOf(b) < 0)))) {
    const t = tuiles[k];
    for (const table of ['mns_lidar_brut', 'mnt_lidar_brut']) {
      const decalage = table === 'mns_lidar_brut' ? 40 : 30;
      await c.query(
        `INSERT INTO pg_temp.${table} (rast)
         SELECT ST_SetValues(
                  ST_AddBand(ST_MakeEmptyRaster(20, 20, $1::float8, $2::float8, 0.5, -0.5, 0, 0, 2154), '32BF', 0, $3::float8),
                  1, 1, 1,
                  (SELECT array_agg(ligne ORDER BY y) FROM (
                     SELECT y, array_agg(
                       CASE WHEN (x * 7 + y * 13 + $4) % 23 = 0 THEN -9999           -- nodata (déclaré ou en clair)
                            ELSE $5::float8 + $4 * 0.37 + x * 0.011 + y * 0.0007 END ORDER BY x) AS ligne
                     FROM generate_series(1, 20) x, generate_series(1, 20) y GROUP BY y) q)::float8[][])`,
        [X0 + t.col * TUILE_M, Y0 + (t.lig + 1) * TUILE_M, t.nodataDeclare ? -9999 : null, t.graine, decalage],
      );
    }
  }
  // Index créé APRÈS le chargement, comme `raster2pgsql -I` pour les vraies dalles : sa construction TRIÉE range les tuiles
  // dans l'ordre spatial, pas dans l'ordre physique — sans quoi l'index rendrait l'ordre d'insertion et le départage par ctid
  // ne serait pas éprouvé (vérifié : un fragment sans ORDER BY ctid échoue sur ce damier).
  for (const table of ['mns_lidar_brut', 'mnt_lidar_brut']) {
    await c.query(`CREATE INDEX ON pg_temp.${table} USING gist (ST_ConvexHull(rast))`);
  }
  await c.query('ANALYZE pg_temp.mns_lidar_brut');
  await c.query('ANALYZE pg_temp.mnt_lidar_brut');
}

/** Points : grille au pas de 0,25 m sur tout le damier (bords et coins compris) + 200 points quelconques. */
function points(): { x: number; y: number }[] {
  const p: { x: number; y: number }[] = [];
  for (let x = -0.5; x <= 4 * TUILE_M + 0.5; x += 0.25) for (let y = -0.5; y <= 3 * TUILE_M + 0.5; y += 0.25) p.push({ x: X0 + x, y: Y0 + y });
  let s = 12345;
  for (let k = 0; k < 200; k++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0; const u = s / 2 ** 32;
    s = (Math.imul(s, 1103515245) + 12345) >>> 0; const v = s / 2 ** 32;
    p.push({ x: X0 + u * 4 * TUILE_M, y: Y0 + v * 3 * TUILE_M });
  }
  return p;
}

const PT = 'ST_SetSRID(ST_MakePoint(pts.x, pts.y), 2154)';

/** Les lectures ANCIENNES (texte d'avant le lot) et NOUVELLES (fragment du moteur), pour chaque point. */
const LECTURES = {
  ancienneMns: `(SELECT v.val FROM (SELECT ST_Value(r.rast, ${PT}) AS val
                 FROM mns_lidar_brut r WHERE ST_Intersects(r.rast, ${PT}) LIMIT 1) v WHERE v.val IS NOT NULL AND v.val <> -9999)`,
  nouvelleMns: `(SELECT v.val FROM (SELECT ST_Value(r.rast, ${PT}) AS val
                 ${sqlTuileContenant('mns_lidar_brut', 'r', PT)}) v WHERE v.val IS NOT NULL AND v.val <> -9999)`,
  ancienneMnt: `(SELECT ST_Value(m.rast, ${PT}) FROM mnt_lidar_brut m WHERE ST_Intersects(m.rast, ${PT}) LIMIT 1)`,
  nouvelleMnt: `(SELECT ST_Value(m.rast, ${PT}) ${sqlTuileContenant('mnt_lidar_brut', 'm', PT)})`,
};

async function lire(c: PoolClient, expr: string, plan: 'sequentiel' | 'index'): Promise<{ valeurs: (number | null)[]; plan: string }> {
  const p = points();
  await c.query(plan === 'sequentiel'
    ? 'SET LOCAL enable_indexscan = off; SET LOCAL enable_bitmapscan = off; SET LOCAL enable_seqscan = on'
    : 'SET LOCAL enable_indexscan = on; SET LOCAL enable_bitmapscan = on; SET LOCAL enable_seqscan = off');
  const sql = `SELECT ${expr} AS v FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS pts(x, y, n) ORDER BY pts.n`;
  const params = [p.map((q) => q.x), p.map((q) => q.y)];
  const { rows: planRows } = await c.query(`EXPLAIN ${sql}`, params);
  const { rows } = await c.query(sql, params);
  return { valeurs: rows.map((r) => (r.v === null ? null : Number(r.v))), plan: planRows.map((r) => r['QUERY PLAN']).join('\n') };
}

/** Couverture d'un couloir : ancienne et nouvelle CTE `couverture` (couvertureCellules), testée sur les centres de cellules. */
function couverture(nouvelle: boolean): string {
  const filtre = nouvelle ? 'ST_ConvexHull(r.rast) && corr.g AND ST_Intersects(r.rast, corr.g)' : 'ST_Intersects(r.rast, corr.g)';
  const union = nouvelle ? 'ST_Union(ST_Envelope(r.rast) ORDER BY r.ctid)' : 'ST_Union(ST_Envelope(r.rast))';
  return `WITH o AS (SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 2154) AS g),
     d AS (SELECT sin(radians($3)) dx, cos(radians($3)) dy),
     t AS (SELECT cos(radians($3)) px, -sin(radians($3)) py),
     axe AS (SELECT ST_MakeLine(o.g, ST_Translate(o.g, $4*d.dx, $4*d.dy)) AS ln FROM o,d),
     corr AS (SELECT ST_Buffer(axe.ln, 1) AS g FROM axe),
     couverture AS (SELECT ${union} AS g FROM mns_lidar_brut r, corr WHERE ${filtre}),
     centres AS (
       SELECT i, j, ST_SetSRID(ST_MakePoint(ST_X(o.g) + ((i+0.5)*0.5)*d.dx + ((j-1.5)*0.5)*t.px,
                                            ST_Y(o.g) + ((i+0.5)*0.5)*d.dy + ((j-1.5)*0.5)*t.py),2154) AS centre
       FROM generate_series(0, $5-1) AS i, generate_series(0,3) AS j, o, d, t)
     SELECT i, j, COALESCE(ST_Intersects(centre, (SELECT g FROM couverture)), false) AS couvert,
            ST_AsBinary((SELECT g FROM couverture)) AS wkb
     FROM centres ORDER BY i, j;`;
}

describe('lectures LiDAR : ancien SQL (parcours séquentiel) ≡ nouveau SQL (index), données synthétiques', () => {
  it('valeur MNS (filtre nodata) et MNT (brute) : identiques en chaque point, bords, coins, trou, doublon, nodata compris', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await preparerDamier(c);
      const n = points().length;
      for (const [ancienne, nouvelle] of [['ancienneMns', 'nouvelleMns'], ['ancienneMnt', 'nouvelleMnt']] as const) {
        const a = await lire(c, LECTURES[ancienne], 'sequentiel');
        const b = await lire(c, LECTURES[nouvelle], 'index');
        expect(a.plan).toMatch(/Seq Scan on (mns|mnt)_lidar_brut/);
        expect(b.plan).toMatch(/Index Scan using \w+ on (mns|mnt)_lidar_brut/);
        expect(b.plan).not.toMatch(/Seq Scan on (mns|mnt)_lidar_brut/);
        expect(b.valeurs).toHaveLength(n);
        expect(b.valeurs).toEqual(a.valeurs); // au bit près (Number de float8, NULL compris)
        // L'épreuve n'est pas vide : des valeurs, des NULL (trou, nodata, hors damier), et le doublon départagé.
        expect(a.valeurs.filter((v) => v === null).length).toBeGreaterThan(100);
        expect(a.valeurs.filter((v) => v !== null).length).toBeGreaterThan(10000);
      }
      // Le départage compte vraiment : sur la tuile doublée, le premier inséré (ctid le plus petit) gagne — pas l'autre.
      const { rows } = await c.query(
        `SELECT ST_Value(r.rast, ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 2154)) AS v FROM mns_lidar_brut r
          WHERE ST_ConvexHull(r.rast) && ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 2154) ORDER BY r.ctid`,
        [X0 + 1.5 * TUILE_M + 0.1, Y0 + 1.6 * TUILE_M + 0.1]);
      expect(rows).toHaveLength(2);
      expect(rows[0].v).not.toBe(rows[1].v);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('couverture d’un couloir long (traverse plusieurs tuiles et le trou) : mêmes cellules couvertes, même union', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await preparerDamier(c);
      const couloirs: [number, number, number][] = [
        [X0 + 0.3, Y0 + 15.1, 90],   // plein Est : traverse les 4 colonnes, dont le trou
        [X0 + 25.2, Y0 + 0.4, 0],    // plein Nord dans la colonne du trou
        [X0 + 0.7, Y0 + 0.6, 37],    // diagonale
        [X0 + 39.6, Y0 + 29.4, 225], // depuis le coin Nord-Est, vers le Sud-Ouest
        [X0 + 20, Y0 + 10, 45],      // origine sur un coin de tuiles
      ];
      for (const [x, y, az] of couloirs) {
        await c.query('SET LOCAL enable_indexscan = off; SET LOCAL enable_bitmapscan = off; SET LOCAL enable_seqscan = on');
        const a = await c.query(couverture(false), [x, y, az, 60, 120]);
        await c.query('SET LOCAL enable_indexscan = on; SET LOCAL enable_bitmapscan = on; SET LOCAL enable_seqscan = off');
        const b = await c.query(couverture(true), [x, y, az, 60, 120]);
        expect(b.rows.map((r) => r.couvert)).toEqual(a.rows.map((r) => r.couvert));
        expect(Buffer.compare(b.rows[0].wkb, a.rows[0].wkb)).toBe(0); // union identique à l'octet
        expect(a.rows.some((r) => r.couvert) && a.rows.some((r) => !r.couvert)).toBe(true);
      }
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
