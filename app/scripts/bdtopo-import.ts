/**
 * BDT-4a — IMPORT BD TOPO des 6 départements (75, 77, 78, 92, 93, 94), édition HOMOGÈNE 2026-06-15, dans une table NEUVE
 * `batiment_2026_06_15`. Un département à la fois, REPRENABLE après interruption, IDEMPOTENT. NE TOUCHE PAS `batiment` (l'édition
 * de mars en service), NI `batiment_edition_fige` (la preuve de mars), NI la vue `bdtopo_batiment`, NI le moteur/golden.
 * Le BASCULEMENT (swap batiment ← batiment_2026_06_15) + le recalcul/rescellage du golden sont le chantier SÉPARÉ BDT-4b.
 *
 * ═══ DÉDUPLICATION par cleabs — RÈGLE EXPLICITE ═══════════════════════════════════════════════════════════════════════════════
 * Chaque paquet départemental DÉBORDE largement sur ses voisins (mesuré : sur les 697 886 objets du D092, ~32 % seulement sont
 * dans le 92 ; ~95 k dans Paris, ~111 k dans le 78, ~52 k dans le 93). Un même bâtiment frontalier est donc livré par PLUSIEURS
 * paquets. Comme les 6 paquets sont la MÊME édition (2026-06-15, même base nationale), ces copies sont BYTE-IDENTIQUES d'un paquet
 * à l'autre → conserver la PREMIÈRE occurrence par cleabs est SANS PERTE. Règle : `INSERT … WHERE NOT EXISTS (cleabs déjà présent)`,
 * ordre de traitement FIXE (déterministe), collisions COMPTÉES et AFFICHÉES par paquet + total (jamais silencieux).
 *
 * ⚠️ PRÉREQUIS : migration 120 appliquée (bdtopo_edition + import_log) ; `curl`, `7z` (p7zip) et `ogr2ogr` (GDAL) dans le PATH ;
 * ~5 Go de scratch libre (pic transitoire = un .7z ~230 Mo + un GPKG TOUSTHEMES extrait ~2–3 Go, nettoyés après chaque dépt).
 * Ce script N'EST PAS lancé automatiquement — Arno le lance.
 *
 * SOURCE (HEAD-confirmée 200 pour les 6 le 2026-08-17) — licence Etalab 2.0 :
 *   https://data.geopf.fr/telechargement/download/BDTOPO/BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D0XX_2026-06-15/…7z
 *
 * Lancer : npm run bdtopo:import -- [--dep 92,75,78,93,94,77] [--edition 2026-06-15] [--cible batiment_2026_06_15]
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDITION_DEFAUT = '2026-06-15';                 // dernière édition disponible (HEAD-confirmée le 2026-08-17 ; sept n'existe pas encore)
const CIBLE_DEFAUT = 'batiment_2026_06_15';
const PRODUIT = 'BD TOPO® 3.5 TOUSTHEMES GPKG LAMB93';
const LICENCE = 'Etalab 2.0';
const URL_MOTIF = 'data.geopf.fr';
// Ordre FIXE (déterministe) : le premier paquet qui livre un cleabs le garde. Résultat indépendant de l'ordre (copies identiques).
const DEPS_DEFAUT = ['92', '75', '78', '93', '94', '77'];

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };
/** curl/7z/ogr2ogr : stderr visible, stdout capturé ; code ≠ 0 → lève (arrêt au 1er échec). */
const sh = (cmd: string, args: string[]): string => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 });
const paquetNom = (dep: string, edition: string) => `BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D0${dep}_${edition}`;
const urlPaquet = (dep: string, edition: string) => { const f = paquetNom(dep, edition); return `https://data.geopf.fr/telechargement/download/BDTOPO/${f}/${f}.7z`; };

/** Recherche récursive du premier .gpkg sous `dir` (l'archive TOUSTHEMES range le GPKG en profondeur). */
function trouverGpkg(dir: string): string | null {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const trouve = trouverGpkg(p); if (trouve) return trouve; }
    else if (e.name.toLowerCase().endsWith('.gpkg')) return p;
  }
  return null;
}

/** Colonnes communes à `cible` et à la table de staging, hors `fid` (regénéré), dans l'ordre de la cible. Identifiants issus de
 *  information_schema (source de confiance) → interpolation sûre (allowlist). */
async function colonnesCommunes(cible: string, stg: string): Promise<string[]> {
  const { rows } = await query<{ column_name: string }>(
    `SELECT c.column_name FROM information_schema.columns c
      WHERE c.table_name = $1 AND c.column_name <> 'fid'
        AND EXISTS (SELECT 1 FROM information_schema.columns s WHERE s.table_name = $2 AND s.column_name = c.column_name)
      ORDER BY c.ordinal_position`, [cible, stg]);
  return rows.map((r) => `"${r.column_name}"`);
}

async function importerDept(dep: string, edition: string, cible: string, dbUrl: string, dir: string): Promise<void> {
  const paquet = paquetNom(dep, edition);
  // 1) REPRISE / IDEMPOTENCE : paquet déjà stampé dans bdtopo_edition → département déjà traité, on saute.
  const { rows: deja } = await query<{ id: number }>(`SELECT id FROM bdtopo_edition WHERE paquet = $1`, [`${paquet}.7z`]);
  if (deja.length) { console.log(`  D0${dep} : déjà importé (paquet stampé) → ignoré.`); return; }

  // 2) TÉLÉCHARGEMENT (curl -f échoue proprement sur 404) + EXTRACTION 7z, dans un sous-dossier propre au département.
  const url = urlPaquet(dep, edition);
  console.log(`  D0${dep} : ${url}`);
  const dossierDep = mkdtempSync(join(dir, `d0${dep}-`));
  const archive = join(dossierDep, `${paquet}.7z`);
  sh('curl', ['-fSL', '--retry', '3', '--retry-connrefused', '-o', archive, url]);
  sh('7z', ['x', `-o${dossierDep}`, '-y', archive]);
  const gpkg = trouverGpkg(dossierDep);
  if (!gpkg) throw new Error(`D0${dep} : aucun .gpkg trouvé dans l'archive extraite`);

  // 3) CHARGEMENT de la SEULE couche `batiment` du GPKG (déjà en 2154 → pas de -t_srs) dans un staging frais.
  const stg = 'stg_bdtopo_import';
  await query(`DROP TABLE IF EXISTS ${stg}`);
  sh('ogr2ogr', ['-f', 'PostgreSQL', `PG:${dbUrl}`, gpkg, 'batiment', '-nln', stg, '-overwrite',
    '-lco', 'GEOMETRY_NAME=geom', '--config', 'PG_USE_COPY', 'YES']);

  // 4) TABLE CIBLE (créée une fois) — même structure que batiment, fid REGÉNÉRÉ (les fid des paquets se chevauchent), sans index
  //    (on indexe à la fin, plus rapide). Ne touche jamais `batiment`.
  await query(`CREATE TABLE IF NOT EXISTS ${cible} (LIKE batiment INCLUDING DEFAULTS)`);
  await query(`CREATE SEQUENCE IF NOT EXISTS ${cible}_fid_seq OWNED BY ${cible}.fid`);
  await query(`ALTER TABLE ${cible} ALTER COLUMN fid SET DEFAULT nextval('${cible}_fid_seq')`);

  // 5) DÉDUPLICATION par cleabs — premier paquet gagnant, collisions comptées.
  const cols = (await colonnesCommunes(cible, stg)).join(', ');
  const { rows: nStg } = await query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${stg}`);
  const livres = Number(nStg[0]?.n ?? 0);
  const ins = await query(
    `INSERT INTO ${cible} (${cols}) SELECT ${cols} FROM ${stg} s
      WHERE s.cleabs IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${cible} c WHERE c.cleabs = s.cleabs)`);
  const inseres = ins.rowCount ?? 0;
  const collisions = livres - inseres;

  // 6) STAMP : une ligne par paquet dans bdtopo_edition (courante=false — mars reste la courante jusqu'à BDT-4b) + import_log.
  await query(
    `INSERT INTO bdtopo_edition (millesime, produit, paquet, departement, source_url_motif, licence, date_paquet, date_extraction, emprise, nb_objets, chargee_le, courante, note)
     SELECT $1, $2, $3, $4, $5, $6, $7::date,
            (SELECT max(date_modification) FROM ${stg}),
            (SELECT ST_SetSRID(ST_Extent(ST_Force2D(geom))::geometry, 2154) FROM ${stg}),
            $8, now(), false, $9`,
    [edition, PRODUIT, `${paquet}.7z`, `D0${dep}`, URL_MOTIF, LICENCE, edition, livres,
      `Import BDT-4a dans ${cible} : ${livres} objets livrés, ${inseres} insérés, ${collisions} collisions (cleabs déjà présents, débordement inter-paquets). courante=false jusqu'au basculement BDT-4b.`]);
  await query(
    `INSERT INTO import_log (table_cible, source, emprise, nb_objets)
     VALUES ($1, $2, $3, $4)`,
    [cible, `${paquet}.7z (${LICENCE}, ${URL_MOTIF})`, `livrés ${livres} / insérés ${inseres} / collisions ${collisions}`, inseres]);

  // 7) NETTOYAGE (pic disque) : staging + fichiers du département.
  await query(`DROP TABLE IF EXISTS ${stg}`);
  rmSync(dossierDep, { recursive: true, force: true });
  console.log(`    ✓ D0${dep} : ${livres} livrés · ${inseres} insérés · ${collisions} collisions.`);
}

/** Index construits UNE FOIS, à la fin (chargement plus rapide sans index). fid redevient une PK unique (regénéré au chargement). */
async function construireIndex(cible: string): Promise<void> {
  console.log(`  Construction des index sur ${cible} …`);
  await query(`ALTER TABLE ${cible} ADD CONSTRAINT ${cible}_pkey PRIMARY KEY (fid)`);
  await query(`CREATE INDEX IF NOT EXISTS ${cible}_geom_geom_idx ON ${cible} USING gist (geom)`);
  await query(`CREATE INDEX IF NOT EXISTS ${cible}_cleabs_idx ON ${cible} (cleabs)`); // NON unique (comme batiment, BDT-3)
  await query(`ANALYZE ${cible}`);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('[bdtopo:import] DATABASE_URL absent'); process.exitCode = 2; return; }
  const edition = lireArg('--edition') ?? EDITION_DEFAUT;
  const cible = lireArg('--cible') ?? CIBLE_DEFAUT;
  const deps = (lireArg('--dep')?.split(',').map((d) => d.trim()) ?? DEPS_DEFAUT).filter((d) => /^(75|77|78|92|93|94)$/.test(d));
  if (!deps.length) { console.error('[bdtopo:import] aucun département valide (75,77,78,92,93,94)'); process.exitCode = 2; return; }

  // Garde-fou : la table batiment_edition_fige (preuve de mars) ne doit JAMAIS être la cible.
  if (cible === 'batiment' || cible === 'batiment_edition_fige') { console.error(`[bdtopo:import] cible interdite : ${cible}`); process.exitCode = 2; return; }

  const dir = mkdtempSync(join(tmpdir(), 'bdtopo-'));
  console.log(`\n══════ IMPORT BD TOPO — édition ${edition} — cible ${cible} — départements ${deps.map((d) => 'D0' + d).join(', ')} ══════`);
  console.log('  (import homogène ; batiment/vue/golden INCHANGÉS — basculement = BDT-4b)');
  try {
    for (const dep of deps) await importerDept(dep, edition, cible, dbUrl, dir);
    await construireIndex(cible);
    const { rows } = await query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${cible}`);
    console.log(`\nBilan : ${Number(rows[0]?.n ?? 0)} objets UNIQUES (dédupliqués par cleabs) dans ${cible}. Prochaine étape : BDT-4b (basculement + golden).\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void main().catch((e) => { console.error('[bdtopo:import] échec', e); process.exitCode = 1; }).finally(() => closePool());
