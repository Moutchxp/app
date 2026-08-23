// PAS de `server-only` : ce module (lectures SEULES) est désormais atteint par le CLI `veille:run` (executerVeille → alerte G4,
// qui réutilise misesAJourActionnables sur ces mêmes relevés). Comme detectionRepo / protocolesRepo / ingestionAutoRepo, il vit
// côté serveur ET côté script — le garde F2 interdit qu'un CLI touche un module `server-only` (incident du 09/08). L'accès HTTP
// reste protégé par `exigerAdministrateur` sur la route /api/admin/sources.
import { query } from '../db/client';
import { DEPARTEMENTS, type Departement, type LectureSource } from './sourcesFraicheur';

/**
 * FRAÎCHEUR DES DONNÉES — LECTURES SEULES (lot 1/3). Un SELECT par source, chacune isolée (une table absente ou une
 * requête en échec ne fait pas tomber l'écran : la source concernée passe « indisponible », les autres restent lisibles).
 *
 * AUCUNE écriture, AUCUN téléchargement, AUCUNE détection distante (lots 2 et 3). Les requêtes exactes sont celles
 * établies par la recon du 22/08 ; là où aucune table de millésime n'existe (LiDAR, adresse, BDNB), on lit un SUBSTITUT
 * nommé (date max d'une colonne, nombre d'objets) — le module PUR se charge de ne jamais le faire passer pour un millésime.
 */

/** Un mois « YYYY-MM » → date de référence « YYYY-MM-01 » ; toute autre forme (déjà « YYYY-MM-DD ») renvoyée telle quelle. */
function moisEnDateReference(code: string | null): string | null {
  if (!code) return null;
  if (/^\d{4}-\d{2}$/.test(code)) return `${code}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(code)) return code.slice(0, 10);
  return null;
}

/** Regroupe des lignes {dep, n} en comptes par département du périmètre (ignore les départements hors périmètre). */
function comptesParDept(rows: { dep: string | null; n: number }[]): Partial<Record<Departement, number>> {
  const out: Partial<Record<Departement, number>> = {};
  const connus = new Set<string>(DEPARTEMENTS);
  for (const r of rows) {
    if (r.dep && connus.has(r.dep)) out[r.dep as Departement] = (out[r.dep as Departement] ?? 0) + Number(r.n);
  }
  return out;
}

/** Requête injectable (défaut = pool réel) — permet de tester le mapping ET la sentinelle d'échec sans base réelle. */
export type Requete = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const requeteDefaut: Requete = <R>(text: string, params?: unknown[]) => query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Exécute une lecture de source en l'isolant : toute erreur → relevé « indisponible » (jamais un throw qui casse l'écran). */
export async function isoler(cle: string, fn: () => Promise<LectureSource>): Promise<LectureSource> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[sources] lecture ${cle} indisponible`, e);
    return { cle, millesime: null, substitut: null, dateReference: null, vide: true, indisponible: true };
  }
}

/** LiDAR HD — aucune date en base : substitut = nombre de dalles ; couverture PARTIELLE limitée au 92 (bbox 1 km²). */
async function lireLidar(): Promise<LectureSource> {
  const r = await query<{ mnt: number; mns: number }>(
    `SELECT (SELECT count(*) FROM mnt_lidar_brut)::int AS mnt, (SELECT count(*) FROM mns_lidar_brut)::int AS mns`,
  );
  const mnt = Number(r.rows[0]?.mnt ?? 0);
  const mns = Number(r.rows[0]?.mns ?? 0);
  const vide = mnt === 0 && mns === 0;
  return {
    cle: 'lidar',
    millesime: null,
    substitut: `millésime inconnu — ${mnt} dalles MNT + ${mns} MNS`,
    dateReference: null, // aucune date nulle part → âge incalculable (assumé)
    vide,
    // La seule zone réellement couverte est le carré de 1 km² au-dessus d'Asnières (92) → PARTIEL, pas présent.
    partielsParDept: vide ? [] : ['92'],
  };
}

/** BD TOPO bâtiment — millésime de l'édition COURANTE ; couverture = départements des paquets de ce millésime. */
async function lireBdtopoBati(): Promise<LectureSource> {
  const e = await query<{ millesime: string; d: string }>(
    `SELECT millesime, to_char(date_paquet, 'YYYY-MM-DD') AS d FROM bdtopo_edition WHERE courante = true LIMIT 1`,
  );
  const cour = e.rows[0];
  if (!cour) return { cle: 'bdtopo_bati', millesime: null, substitut: null, dateReference: null, vide: true };
  const deps = await query<{ dep: string }>(
    `SELECT DISTINCT ltrim(departement, 'D') AS dep FROM bdtopo_edition WHERE millesime = $1`,
    [cour.millesime],
  );
  return {
    cle: 'bdtopo_bati',
    millesime: cour.millesime,
    substitut: null,
    dateReference: cour.d,
    vide: false,
    comptesParDept: comptesParDept(deps.rows.map((x) => ({ dep: x.dep, n: 1 }))),
  };
}

/** BD TOPO adresse — pas de table de millésime : substitut = date max de `date_modification` ; couverture par INSEE. */
async function lireBdtopoAdresse(): Promise<LectureSource> {
  const r = await query<{ n: number; d: string | null }>(
    `SELECT count(*)::int AS n, to_char(max(date_modification), 'YYYY-MM-DD') AS d FROM adresse_ban`,
  );
  const n = Number(r.rows[0]?.n ?? 0);
  const d = r.rows[0]?.d ?? null;
  if (n === 0) return { cle: 'bdtopo_adresse', millesime: null, substitut: null, dateReference: null, vide: true };
  const deps = await query<{ dep: string | null; n: number }>(
    `SELECT left(insee_commune, 2) AS dep, count(*)::int AS n FROM adresse_ban GROUP BY 1`,
  );
  return {
    cle: 'bdtopo_adresse',
    millesime: null,
    substitut: d ? `aucun millésime — dernière modification : ${d}` : 'aucun millésime en base',
    dateReference: d,
    vide: false,
    comptesParDept: comptesParDept(deps.rows),
  };
}

/** Cadastre — millésime le plus récent de `cadastre_millesime` ; couverture = départements réellement dans `parcelle`. */
export async function lireCadastre(req: Requete = requeteDefaut): Promise<LectureSource> {
  const deps = await req<{ dep: string | null; n: number }>(
    `SELECT left(commune, 2) AS dep, count(*)::int AS n FROM parcelle GROUP BY 1`,
  );
  const vide = deps.rows.length === 0 || deps.rows.every((x) => Number(x.n) === 0);
  // `cadastre_millesime.millesime` est une colonne TEXT déjà au format « YYYY-MM-DD » (ex. « 2026-06-01 ») : on la lit
  // DIRECTEMENT. ⚠️ Ne jamais l'envelopper dans to_char() — to_char(text, …) n'existe pas côté PostgreSQL (la lecture
  // jetterait et l'écran afficherait « indisponible » alors que la donnée est là). `charge_le` (timestamptz) garde son to_char.
  const m = await req<{ m: string | null; c: string | null }>(
    `SELECT max(millesime) AS m, to_char(max(charge_le), 'YYYY-MM-DD') AS c FROM cadastre_millesime`,
  );
  const mil = m.rows[0]?.m ?? null;
  return {
    cle: 'cadastre',
    millesime: mil,
    substitut: mil ? null : 'aucun millésime enregistré',
    dateReference: mil,
    vide,
    comptesParDept: comptesParDept(deps.rows),
  };
}

/** Sitadel — millésime le plus récemment téléchargé ; couverture = départements présents dans `sitadel_dossier`. */
async function lireSitadel(): Promise<LectureSource> {
  const m = await query<{ code: string }>(
    `SELECT code FROM sitadel_millesime ORDER BY telecharge_a DESC NULLS LAST LIMIT 1`,
  );
  const code = m.rows[0]?.code ?? null;
  if (!code) return { cle: 'sitadel', millesime: null, substitut: null, dateReference: null, vide: true };
  const deps = await query<{ dep: string | null; n: number }>(
    `SELECT departement AS dep, count(*)::int AS n FROM sitadel_dossier GROUP BY 1`,
  );
  return {
    cle: 'sitadel',
    millesime: code,
    substitut: null,
    dateReference: moisEnDateReference(code),
    vide: false,
    comptesParDept: comptesParDept(deps.rows),
  };
}

/** DILA — dernier millésime de l'annuaire (date du fichier). */
async function lireDila(): Promise<LectureSource> {
  const r = await query<{ code: string; d: string | null }>(
    `SELECT code, to_char(date_fichier, 'YYYY-MM-DD') AS d FROM dila_millesime ORDER BY date_fichier DESC NULLS LAST LIMIT 1`,
  );
  const row = r.rows[0];
  if (!row) return { cle: 'dila', millesime: null, substitut: null, dateReference: null, vide: true };
  return { cle: 'dila', millesime: row.code, substitut: null, dateReference: row.d ?? moisEnDateReference(row.code), vide: false };
}

/** PRADA — dernier millésime importé. */
async function lirePrada(): Promise<LectureSource> {
  const r = await query<{ code: string }>(
    `SELECT code FROM prada_millesime ORDER BY importe_le DESC NULLS LAST LIMIT 1`,
  );
  const code = r.rows[0]?.code ?? null;
  if (!code) return { cle: 'prada', millesime: null, substitut: null, dateReference: null, vide: true };
  return { cle: 'prada', millesime: code, substitut: null, dateReference: moisEnDateReference(code), vide: false };
}

/** BDNB — aucune date en base : substitut = nombre de lignes ; âge incalculable. */
async function lireBdnb(): Promise<LectureSource> {
  const r = await query<{ n: number }>(`SELECT count(*)::int AS n FROM bdnb_annee_batiment`);
  const n = Number(r.rows[0]?.n ?? 0);
  return {
    cle: 'bdnb',
    millesime: null,
    substitut: n > 0 ? `aucun millésime en base — ${n} lignes (année de construction)` : null,
    dateReference: null,
    vide: n === 0,
  };
}

/** Lit toutes les sources en parallèle, chacune isolée. Ordre non garanti (le module pur réordonne selon le catalogue). */
export async function lireSourcesFraicheur(): Promise<LectureSource[]> {
  return Promise.all([
    isoler('lidar', lireLidar),
    isoler('bdtopo_bati', lireBdtopoBati),
    isoler('bdtopo_adresse', lireBdtopoAdresse),
    isoler('cadastre', lireCadastre),
    isoler('sitadel', lireSitadel),
    isoler('dila', lireDila),
    isoler('prada', lirePrada),
    isoler('bdnb', lireBdnb),
  ]);
}
