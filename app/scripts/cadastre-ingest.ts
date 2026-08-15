/**
 * CAD-1 — INGESTION du cadastre (couche PARCELLE etalab-cadastre / PCI Parcellaire Express) par DÉPARTEMENT, TRACÉE et REJOUABLE.
 * Télécharge (curl — wget est absent de la machine), charge par `ogr2ogr` en `-append` dans la table `parcelle`, et JOURNALISE un
 * millésime dans `cadastre_millesime` (source, département, livraison, nb de lignes, horodatage). IDEMPOTENT : un (département,
 * millésime) déjà chargé est IGNORÉ (aucun re-téléchargement, aucun doublon) — porté par l'UNIQUE(département, millésime) de la 111.
 *
 * ⚠️ PRÉREQUIS : migration 111 appliquée ; `curl` et `ogr2ogr` (GDAL) dans le PATH ; table `parcelle` en SRID 2154. Ce script N'EST
 * PAS lancé automatiquement — Arno le lance.
 *
 * SOURCE VÉRIFIÉE (lecture de cadastre.data.gouv.fr, 16/08/2026) :
 *   https://cadastre.data.gouv.fr/data/etalab-cadastre/<millesime>/shp/departements/<dep>/cadastre-<dep>-parcelles-shp.zip
 *   Ex. dept 93 (~35 Mo). Dernier millésime disponible : 2026-06-01.
 * FORMAT SHP (et non GeoJSON) délibéré : le shapefile etalab est déjà en Lambert-93 (EPSG:2154), MÊME SRID que la table `parcelle`
 *   → AUCUNE reprojection (le GeoJSON, lui, est en WGS84 et imposerait un -t_srs). GDAL lit le .shp DANS le zip via /vsizip.
 *
 * Lancer : npm run cadastre:ingest -- --dep 75,93,78 [--millesime 2026-06-01]
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MILLESIME_DEFAUT = '2026-06-01'; // dernier millésime vérifié sur cadastre.data.gouv.fr au 16/08/2026
const SOURCE = 'etalab-cadastre (cadastre.data.gouv.fr) — couche parcelles SHP, Lambert-93 EPSG:2154';
const urlDept = (dep: string, mill: string) =>
  `https://cadastre.data.gouv.fr/data/etalab-cadastre/${mill}/shp/departements/${dep}/cadastre-${dep}-parcelles-shp.zip`;

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
/** curl/ogr2ogr : stderr HÉRITÉ (visible), stdout capturé ; un code de retour ≠ 0 lève (arrêt au 1er échec). */
const sh = (cmd: string, args: string[]): string => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 128 * 1024 * 1024 });

async function ingererDept(dep: string, mill: string, dbUrl: string, dir: string): Promise<void> {
  // 1) IDEMPOTENCE : (département, millésime) déjà chargé → on ignore (ni téléchargement, ni doublon).
  const { rows: deja } = await query<{ lignes_chargees: string | number }>(
    `SELECT lignes_chargees FROM cadastre_millesime WHERE departement = $1 AND millesime = $2`, [dep, mill]);
  if (deja.length) { console.log(`  ${dep} @ ${mill} : déjà chargé (${deja[0].lignes_chargees} lignes) → ignoré.`); return; }

  const url = urlDept(dep, mill);
  console.log(`  ${dep} : ${url}`);

  // 2) DATE DE LIVRAISON (Last-Modified du fichier), best-effort.
  let livraison: string | null = null;
  try { livraison = (/^\s*last-modified:\s*(.+)$/im.exec(sh('curl', ['-sSIL', url]))?.[1] ?? '').trim() || null; } catch { /* best-effort */ }

  // 3) TÉLÉCHARGEMENT (curl ; -f échoue proprement sur 404/erreur HTTP).
  const zip = join(dir, `cadastre-${dep}-parcelles.zip`);
  sh('curl', ['-fSL', '--retry', '2', '-o', zip, url]);

  // 4) REFRESH du département : retire un éventuel chargement antérieur (autre millésime) pour ne pas doubler, puis -append.
  const del = await query(`DELETE FROM parcelle WHERE commune LIKE $1`, [`${dep}%`]);
  if (del.rowCount) console.log(`    ${del.rowCount} ligne(s) antérieure(s) de ${dep} supprimée(s) avant rechargement.`);

  // 5) CHARGEMENT ogr2ogr : le SHP (dans le zip, via /vsizip) est en 2154 → pas de -t_srs. -unsetFid : fid vient de la séquence
  //    `parcelle_fid_seq` (pas de collision avec les fid existants). Le champ `geom` reçoit la géométrie (GEOMETRY_NAME=geom).
  sh('ogr2ogr', ['-f', 'PostgreSQL', `PG:${dbUrl}`, `/vsizip/${zip}`, '-nln', 'parcelle', '-append', '-unsetFid',
    '-lco', 'GEOMETRY_NAME=geom', '--config', 'PG_USE_COPY', 'YES']);

  // 6) DÉCOMPTE + JOURNALISATION du millésime.
  const { rows: cnt } = await query<{ n: string }>(`SELECT count(*)::bigint AS n FROM parcelle WHERE commune LIKE $1`, [`${dep}%`]);
  const n = Number(cnt[0]?.n ?? 0);
  await query(
    `INSERT INTO cadastre_millesime (source, departement, millesime, livraison, lignes_chargees)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (departement, millesime) DO UPDATE SET source = $1, livraison = $4, lignes_chargees = $5, charge_le = now()`,
    [SOURCE, dep, mill, livraison, n]);
  console.log(`    ✓ ${dep} @ ${mill} : ${n} parcelles chargées (livraison : ${livraison ?? '—'}).`);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('[cadastre:ingest] DATABASE_URL absent'); process.exitCode = 2; return; }
  const depArg = lireArg('--dep');
  if (!depArg) { console.error('usage : npm run cadastre:ingest -- --dep 75,93,78 [--millesime 2026-06-01]'); process.exitCode = 2; return; }
  const mill = lireArg('--millesime') ?? MILLESIME_DEFAUT;
  const deps = depArg.split(',').map((d) => d.trim().toUpperCase()).filter((d) => /^(\d{2}|2[AB])$/.test(d)); // codes à 2 caractères (métropole)
  if (!deps.length) { console.error('[cadastre:ingest] aucun code département valide (2 caractères ; ex. 75, 93, 78)'); process.exitCode = 2; return; }

  const dir = mkdtempSync(join(tmpdir(), 'cadastre-'));
  console.log(`\n══════ INGESTION CADASTRE — millésime ${mill} — départements ${deps.join(', ')} ══════`);
  try {
    for (const dep of deps) await ingererDept(dep, mill, dbUrl, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('');
}

void main().catch((e) => { console.error('[cadastre:ingest] échec', e); process.exitCode = 1; }).finally(() => closePool());
