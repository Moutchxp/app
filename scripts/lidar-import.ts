/**
 * ══ IMPORT LiDAR HD — CERCLE AUTOUR DE NOTRE-DAME (lot du 14/10/2026, décision d'Arno) ══════════════════════════════════
 *
 *   npm run lidar:import                       → --liste (DÉFAUT) : aucun téléchargement, aucune écriture
 *   npm run lidar:import -- --verifier         → comptes de tuiles par dalle et par couche, trous et doublons
 *   npm run lidar:import -- --charger --source-urls=<fichier.csv>   (ou --modele-url='…{X}…{Y}…{COUCHE}…')
 *
 * Options : --rayon-km=36  --centre-lat=48.853 --centre-lon=2.3499  --paralleles=4  --dossier=<tmp>
 *           --base=<chaîne de connexion> (défaut DATABASE_URL)  --exiger-base=<nom>  --dalles=0646_6868,0647_6868
 *           --limite=<n>
 *
 * Écrit UNIQUEMENT dans mns_lidar_brut et mnt_lidar_brut, au MÊME format que la dalle d'Asnières (raster2pgsql, tuiles
 * 256 × 256, SRID 2154, nodata -9999, rasters en base). Les règles (aucune suppression, une dalle par transaction,
 * reprise, idempotence) vivent dans `app/lib/lidar/importLidar.ts` ; la géométrie dans `app/lib/lidar/grilleLidar.ts`.
 *
 * 🔒 GARDES :
 *   · sur macOS, --charger est REFUSÉ sauf dans la base « lidar_jetable » (décision d'Arno : rien du LiDAR ne reste sur le
 *     Mac ; le chargement réel se fait sur le serveur) ;
 *   · --exiger-base=<nom> refuse toute autre base ;
 *   · --charger est refusé tant que la contrainte `enforce_max_extent_rast` (posée par AddRasterConstraints sur la seule
 *     emprise d'Asnières) est présente : appliquer d'abord db/migrations/353_lidar_emprise_libre.sql ;
 *   · aucune URL de téléchargement n'est devinée : la source se donne explicitement (catalogue IGN).
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Client } from 'pg';
import {
  CENTRE_NOTRE_DAME_WGS84, COUCHES, NODATA, PIXELS_PAR_DALLE, RAYON_DEFAUT_M, SRID, TABLE_DE_COUCHE, TAILLE_TUILE_PX,
  TUILES_PAR_DALLE, dallesDuCercle, empriseDalle, etatDalle, geoTransformAttendue, lireNomDalle, nomDalle, volumeEstimeOctets,
  type CoucheLidar, type Dalle, type EtatDalle,
} from '../app/lib/lidar/grilleLidar';
import { chargerDalles, type DepsChargement, type EvenementJournal } from '../app/lib/lidar/importLidar';

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'oui');
}
const mode = args.has('charger') ? 'charger' : args.has('verifier') ? 'verifier' : 'liste';
const rayonM = Number(args.get('rayon-km') ?? RAYON_DEFAUT_M / 1000) * 1000;
const centreWgs = { lat: Number(args.get('centre-lat') ?? CENTRE_NOTRE_DAME_WGS84.lat), lon: Number(args.get('centre-lon') ?? CENTRE_NOTRE_DAME_WGS84.lon) };
const paralleles = Math.max(1, Number(args.get('paralleles') ?? 4));
const dossier = path.resolve(args.get('dossier') ?? path.join(os.tmpdir(), 'svav-lidar-import'));
const base = args.get('base') ?? process.env.DATABASE_URL ?? '';
const journalFichier = path.join(dossier, 'lidar-import.journal.jsonl');

function arreter(message: string): never {
  console.error(`[lidar-import] ${message}`);
  process.exit(2);
}

// ── Outils externes ─────────────────────────────────────────────────────────────────────────────────────────────────
function executer(cmd: string, argv: string[], entree?: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', rejeter);
    p.on('close', (code) => resoudre({ code: code ?? 1, stdout, stderr }));
    if (entree) entree(p.stdin).then(() => p.stdin.end(), (e) => { p.kill(); rejeter(e); });
    else p.stdin.end();
  });
}
async function disponible(cmd: string): Promise<boolean> {
  try { return (await executer('which', [cmd])).code === 0; } catch { return false; }
}

// ── Base ────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function connecter(): Promise<Client> {
  if (base === '') arreter('aucune base : passer --base=… ou définir DATABASE_URL');
  const c = new Client({ connectionString: base });
  await c.connect();
  return c;
}

async function centreLambert93(c: Client): Promise<{ x: number; y: number }> {
  const { rows } = await c.query<{ x: number; y: number }>(
    `SELECT ST_X(g) AS x, ST_Y(g) AS y FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${SRID}) AS g) t`,
    [centreWgs.lon, centreWgs.lat]);
  return rows[0];
}

/** SQL de l'emprise d'une dalle ($x, $y en kilomètres). */
const SQL_EMPRISE = (x: string, y: string) =>
  `ST_MakeEnvelope(${x} * 1000 - 0.25, ${y} * 1000 + 0.25 - 1000, ${x} * 1000 - 0.25 + 1000, ${y} * 1000 + 0.25, ${SRID})`;
/** Tuiles d'une table dont le CENTRE tombe dans l'emprise (index GiST sur st_convexhull(rast)). */
const SQL_TUILES_DANS = (table: string, emprise: string) =>
  `SELECT count(*) FROM ${table} r WHERE ST_ConvexHull(r.rast) && ${emprise} AND ST_Contains(${emprise}, ST_Centroid(ST_ConvexHull(r.rast)))`;

async function etats(c: Client, dalles: readonly Dalle[]): Promise<Map<string, EtatDalle>> {
  const out = new Map<string, EtatDalle>();
  const PAQUET = 500;
  for (let i = 0; i < dalles.length; i += PAQUET) {
    const lot = dalles.slice(i, i + PAQUET);
    const { rows } = await c.query<{ x: number; y: number; mns: string; mnt: string }>(
      `WITH d AS (SELECT * FROM unnest($1::int[], $2::int[]) AS t(x, y)),
            e AS (SELECT x, y, ${SQL_EMPRISE('x', 'y')} AS g FROM d)
       SELECT x, y, (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNS, 'e.g')}) AS mns, (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNT, 'e.g')}) AS mnt FROM e`,
      [lot.map((d) => d.xKm), lot.map((d) => d.yKm)]);
    for (const r of rows) out.set(nomDalle({ xKm: r.x, yKm: r.y }), etatDalle({ MNS: Number(r.mns), MNT: Number(r.mnt) }));
  }
  return out;
}

async function contrainteEmpriseFigee(c: Client): Promise<string[]> {
  const { rows } = await c.query<{ t: string }>(
    `SELECT conrelid::regclass::text AS t FROM pg_constraint
      WHERE conname = 'enforce_max_extent_rast' AND conrelid IN ('mns_lidar_brut'::regclass, 'mnt_lidar_brut'::regclass)`);
  return rows.map((r) => r.t);
}

// ── Source des fichiers (jamais devinée) ────────────────────────────────────────────────────────────────────────────
async function lireSource(): Promise<(d: Dalle, couche: CoucheLidar) => string> {
  const fichier = args.get('source-urls');
  const modele = args.get('modele-url');
  if (fichier) {
    // CSV « dalle;couche;url » (ex. « 0646_6868;MNS;https://… »), tiré du catalogue IGN — une ligne par dalle et par couche.
    const table = new Map<string, string>();
    for (const ligne of (await readFile(fichier, 'utf8')).split(/\r?\n/)) {
      const [dalle, couche, url] = ligne.split(';').map((s) => s.trim());
      if (!dalle || !couche || !url || dalle.startsWith('#')) continue;
      table.set(`${dalle}|${couche.toUpperCase()}`, url);
    }
    return (d, couche) => {
      const url = table.get(`${nomDalle(d)}|${couche}`);
      if (!url) throw new Error(`aucune URL pour ${nomDalle(d)} ${couche} dans ${fichier}`);
      return url;
    };
  }
  if (modele) {
    return (d, couche) => modele
      .replaceAll('{X}', String(d.xKm).padStart(4, '0')).replaceAll('{Y}', String(d.yKm).padStart(4, '0'))
      .replaceAll('{COUCHE}', couche);
  }
  return arreter('--charger exige une source : --source-urls=<fichier.csv> (catalogue IGN) ou --modele-url=<modèle>');
}

async function telecharger(url: string, destination: string): Promise<void> {
  const partiel = `${destination}.part`;
  let derniere: unknown = null;
  for (let essai = 1; essai <= 3; essai += 1) {
    try {
      if (url.startsWith('file://')) { // essais hors ligne : un GeoTIFF local copié comme un téléchargement
        const { copyFile } = await import('node:fs/promises');
        await copyFile(new URL(url), partiel);
      } else {
        const r = await fetch(url);
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        await pipeline(Readable.fromWeb(r.body as never), createWriteStream(partiel));
        const attendu = Number(r.headers.get('content-length') ?? NaN);
        if (Number.isFinite(attendu) && (await stat(partiel)).size !== attendu) throw new Error('taille reçue ≠ Content-Length');
      }
      await rename(partiel, destination);
      return;
    } catch (e) {
      derniere = e;
      await rm(partiel, { force: true });
    }
  }
  throw new Error(`téléchargement impossible (${url}) : ${derniere instanceof Error ? derniere.message : String(derniere)}`);
}

/** Intégrité : 2 000 × 2 000 px, géoréférencement exact de la dalle, une bande Float32, nodata -9999, Lambert-93. */
async function verifierFichier(d: Dalle, chemin: string): Promise<{ ok: true } | { ok: false; motif: string }> {
  const r = await executer('gdalinfo', ['-json', chemin]);
  if (r.code !== 0) return { ok: false, motif: `gdalinfo : ${r.stderr.trim().slice(0, 200)}` };
  const j = JSON.parse(r.stdout) as { size?: number[]; geoTransform?: number[]; bands?: { type?: string; noDataValue?: number }[]; coordinateSystem?: { wkt?: string } };
  if (j.size?.[0] !== PIXELS_PAR_DALLE || j.size?.[1] !== PIXELS_PAR_DALLE) return { ok: false, motif: `taille ${JSON.stringify(j.size)}` };
  const gt = geoTransformAttendue(d);
  if (!j.geoTransform || gt.some((v, i) => j.geoTransform![i] !== v)) return { ok: false, motif: `géoréférencement ${JSON.stringify(j.geoTransform)} ≠ ${JSON.stringify(gt)}` };
  if (j.bands?.length !== 1 || j.bands[0].type !== 'Float32') return { ok: false, motif: 'une bande Float32 attendue' };
  if (j.bands[0].noDataValue !== NODATA) return { ok: false, motif: `nodata ${j.bands[0].noDataValue}` };
  if (!/2154|Lambert-93|RGF93/i.test(j.coordinateSystem?.wkt ?? '')) return { ok: false, motif: 'système de coordonnées non Lambert-93' };
  return { ok: true };
}

/** Les deux couches d'une dalle, dans UNE transaction psql, avec verrou par dalle et revérification de présence. */
async function importer(d: Dalle, fichiers: Readonly<Record<CoucheLidar, string>>): Promise<'importee' | 'deja_presente'> {
  const nom = nomDalle(d);
  const e = empriseDalle(d);
  const emprise = `ST_MakeEnvelope(${e.xmin}, ${e.ymin}, ${e.xmax}, ${e.ymax}, ${SRID})`;
  const entete = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    `SELECT pg_advisory_xact_lock(hashtext('svav_lidar_${nom}'));`,
    `DO $$ BEGIN IF (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNS, emprise)}) + (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNT, emprise)}) > 0`,
    `  THEN RAISE EXCEPTION 'SVAV_DALLE_DEJA_PRESENTE ${nom}'; END IF; END $$;`,
    '',
  ].join('\n');
  const r = await executer('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', base], async (stdin) => {
    stdin.write(entete);
    for (const couche of COUCHES) {
      // -a ajout, -e sans transaction propre (la nôtre englobe tout), -Y COPY, tuiles 256 × 256, SRID et nodata explicites.
      const r2p = spawn('raster2pgsql', ['-a', '-e', '-Y', '-s', String(SRID), '-t', `${TAILLE_TUILE_PX}x${TAILLE_TUILE_PX}`, '-N', String(NODATA), fichiers[couche], `public.${TABLE_DE_COUCHE[couche]}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      r2p.stderr.on('data', (x) => { err += x; });
      for await (const morceau of r2p.stdout) { if (!stdin.write(morceau)) await new Promise((ok) => stdin.once('drain', ok)); }
      const code = await new Promise<number>((ok) => r2p.on('close', (c) => ok(c ?? 1)));
      if (code !== 0) throw new Error(`raster2pgsql ${couche} : ${err.trim().slice(0, 200)}`);
    }
    // Contrôle avant validation : exactement 64 tuiles par couche, sinon tout est annulé.
    stdin.write(`\nDO $$ BEGIN IF (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNS, emprise)}) <> ${TUILES_PAR_DALLE} OR (${SQL_TUILES_DANS(TABLE_DE_COUCHE.MNT, emprise)}) <> ${TUILES_PAR_DALLE}\n  THEN RAISE EXCEPTION 'SVAV_DALLE_INCOMPLETE ${nom}'; END IF; END $$;\nCOMMIT;\n`);
  });
  if (r.code === 0) return 'importee';
  if (r.stderr.includes('SVAV_DALLE_DEJA_PRESENTE')) return 'deja_presente';
  throw new Error(`psql : ${r.stderr.trim().slice(0, 300)}`);
}

// ── Modes ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function dallesDemandees(centre: { x: number; y: number }): Dalle[] {
  let dalles = dallesDuCercle(centre, rayonM);
  const filtre = args.get('dalles');
  if (filtre) {
    const voulues = new Set(filtre.split(',').map((s) => s.trim()));
    for (const v of voulues) if (!lireNomDalle(v)) arreter(`--dalles : « ${v} » n'est pas une clé de dalle (ex. 0646_6868)`);
    dalles = dalles.filter((d) => voulues.has(nomDalle(d)));
  }
  const limite = Number(args.get('limite') ?? NaN);
  return Number.isFinite(limite) ? dalles.slice(0, limite) : dalles;
}

const go = (o: number) => `${(o / 1e9).toFixed(1)} Go`;

async function main(): Promise<void> {
  const c = await connecter();
  try {
    const { rows } = await c.query<{ base: string }>('SELECT current_database() AS base');
    const nomBase = rows[0].base;
    const exigee = args.get('exiger-base');
    if (exigee && nomBase !== exigee) arreter(`base « ${nomBase} » refusée (--exiger-base=${exigee})`);
    const centre = await centreLambert93(c);
    const dalles = dallesDemandees(centre);
    const et = await etats(c, dalles);
    const compte = { presente: 0, absente: 0, incoherente: 0 };
    for (const v of et.values()) compte[v] += 1;
    console.log(JSON.stringify({
      mode, base: nomBase, centre_wgs84: centreWgs, centre_l93: centre, rayon_m: rayonM, dalles: dalles.length, ...compte,
      volume_a_charger_estime: go(volumeEstimeOctets(compte.absente)), volume_cercle_estime: go(volumeEstimeOctets(dalles.length)),
    }, null, 2));

    if (mode === 'verifier') {
      const incoherentes = [...et.entries()].filter(([, v]) => v === 'incoherente').map(([k]) => k);
      const doublons: Record<string, number> = {};
      for (const couche of COUCHES) {
        const { rows: dbl } = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM (SELECT ST_UpperLeftX(rast), ST_UpperLeftY(rast) FROM ${TABLE_DE_COUCHE[couche]}
             GROUP BY 1, 2 HAVING count(*) > 1) t`);
        doublons[couche] = Number(dbl[0].n);
      }
      console.log(JSON.stringify({ trous_ou_incompletes: incoherentes, absentes: compte.absente, tuiles_en_double_par_couche: doublons }, null, 2));
      return;
    }
    if (mode === 'liste') return;

    // ── --charger ──
    if (process.platform === 'darwin' && nomBase !== 'lidar_jetable') arreter(`sur le Mac, --charger n'écrit que dans « lidar_jetable » (base « ${nomBase} » refusée)`);
    const figees = await contrainteEmpriseFigee(c);
    if (figees.length > 0) arreter(`contrainte enforce_max_extent_rast présente sur ${figees.join(', ')} : appliquer d'abord db/migrations/353_lidar_emprise_libre.sql`);
    for (const outil of ['raster2pgsql', 'psql', 'gdalinfo']) if (!(await disponible(outil))) arreter(`outil absent : ${outil}`);
    const source = await lireSource();
    await mkdir(dossier, { recursive: true });
    for (const f of await readdir(dossier)) if (f.endsWith('.part')) await rm(path.join(dossier, f), { force: true }); // reste d'une coupure

    const journal = (e: EvenementJournal): void => {
      const ligne = JSON.stringify({ quand: new Date().toISOString(), ...e });
      console.log(ligne);
      void appendFile(journalFichier, `${ligne}\n`);
    };
    const deps: DepsChargement = {
      etats: (ds) => etats(c, ds),
      telecharger: async (d, couche) => {
        const dest = path.join(dossier, `${nomDalle(d)}_${couche}.tif`);
        await telecharger(source(d, couche), dest);
        return dest;
      },
      verifier: (d, _couche, chemin) => verifierFichier(d, chemin),
      importer,
      effacer: async (chemins) => { for (const ch of chemins) if (path.dirname(ch) === dossier) await rm(ch, { force: true }); },
      journal,
    };
    const t0 = Date.now();
    const bilan = await chargerDalles(dalles, paralleles, deps);
    console.log(JSON.stringify({ bilan, duree_s: (Date.now() - t0) / 1000, journal: journalFichier }, null, 2));
    if (bilan.echecs.length > 0) process.exitCode = 1;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('[lidar-import] échec :', e instanceof Error ? e.stack : e); process.exit(1); });
