/**
 * ══ DIAGNOSTIC GOLDEN — DIVERGENCE MAC / SERVEUR (lot du 14/10/2026) ═══════════════════════════════════════════════════
 *
 *   npm run diag:golden                      → tout : environnement, requêtes SQL brutes, étapes du pipeline, scores, verdict
 *   npm run diag:golden -- --sql-seul        → environnement + requêtes SQL brutes SEULES (PostGIS/GEOS/PROJ, sans le calcul JS)
 *
 * Rejoue EXACTEMENT le cas golden de `app/lib/db/pipeline.itest.ts` (Asnières, azimut 90, étage 2, profil gelé de
 * référence) par le MÊME chemin que la production : `construireEntree` puis `analyser` — c'est ce que fait
 * `analyserAdresse`, ligne à ligne. Aucune étape du moteur n'est réécrite ici : on ne fait que REGARDER.
 *
 * Imprime sur la sortie standard un JSON aux clés triées, nombres en pleine précision (aucun arrondi), stable d'une
 * machine à l'autre : comparer les deux sorties (`diff`) désigne la PREMIÈRE valeur qui diverge. La cause n'est pas
 * supposée : c'est à la comparaison de la dire.
 *
 * 🔒 AUCUNE ÉCRITURE EN BASE, PAR CONSTRUCTION :
 *   · toutes les requêtes du moteur passent par `query()` (`db/client.ts`), qui appelle `pool.query` ; on remplace cette
 *     méthode, le temps du diagnostic, par un client DÉDIÉ ouvert en `BEGIN TRANSACTION READ ONLY` — PostgreSQL y REFUSE
 *     toute écriture (SQLSTATE 25006) ;
 *   · la transaction se termine par ROLLBACK, quoi qu'il arrive ;
 *   · `withTransaction` (qui COMMITE au retour normal) n'est jamais utilisé.
 * Le moteur lui-même n'écrit rien (aucun INSERT/UPDATE/DELETE dans pipeline, origine, obstacles, hauteurLidar,
 * faisceaux, profilConfig, preparateurPaysage, analyse) : la transaction en lecture seule en est la garantie, pas la seule.
 */
import os from 'node:os';
import path from 'node:path';
import type { PoolClient, QueryResult } from 'pg';
import { pool, closePool } from '../app/lib/db/client';
import { construireEntree } from '../app/lib/db/pipeline';
import { chargerProfilDegagement } from '../app/lib/db/profilConfig';
import { analyser } from '../app/lib/svv/analyse';
import { hauteurVision } from '../app/lib/svv/config';
import type { ProfilDegagement } from '../app/lib/svv/profilDegagement';
import { CAS_GOLDEN, PROFIL_GOLDEN_DIAG, SCORE_GOLDEN, jsonStable, sqlNormalise } from '../app/lib/diag/diagGolden';

const SQL_SEUL = process.argv.includes('--sql-seul');
const RACINE = path.resolve(__dirname, '..');

interface EntreeJournal {
  n: number;
  appelant: string;          // la fonction du moteur qui a émis la requête (pile d'appels, chemins relatifs au dépôt)
  sql: string;
  params: unknown[];
  colonnes: { nom: string; typeOid: number }[];
  nbLignes: number | null;
  lignes: unknown[];
}

/** La première fonction du dépôt (hors ce script et `db/client.ts`) dans la pile : « obstacles.ts:obstaclesSurAxe ». */
function appelant(): string {
  const pile = (new Error().stack ?? '').split('\n').slice(1);
  for (const ligne of pile) {
    const m = /at (?:async )?(?:(\S+) \()?(.+?):\d+:\d+\)?$/.exec(ligne.trim());
    if (!m) continue;
    const fichier = m[2].replace(/^file:\/\//, '');
    if (!fichier.startsWith(RACINE) || fichier.includes('node_modules')) continue;
    const rel = path.relative(RACINE, fichier);
    if (rel === 'scripts/diag-golden.ts' || rel === 'app/lib/db/client.ts') continue;
    return `${rel}:${m[1] ?? '(anonyme)'}`;
  }
  return '(inconnu)';
}

async function environnement(c: PoolClient): Promise<Record<string, unknown>> {
  const { rows } = await c.query(`
    SELECT version() AS postgresql, postgis_full_version() AS postgis_full_version,
           current_setting('extra_float_digits') AS extra_float_digits, current_setting('TimeZone') AS timezone_session,
           current_setting('DateStyle') AS datestyle, current_setting('lc_numeric') AS lc_numeric,
           current_setting('server_encoding') AS server_encoding, current_setting('transaction_read_only') AS transaction_read_only`);
  return {
    node: { version: process.version, versions: process.versions, arch: process.arch, platform: process.platform, os_release: os.release() },
    TZ: process.env.TZ ?? null,
    fuseau_resolu: Intl.DateTimeFormat().resolvedOptions().timeZone,
    base: rows[0],
  };
}

async function main(): Promise<void> {
  const c = await pool.connect();
  const original = pool.query;
  const journal: EntreeJournal[] = [];
  let sortie: Record<string, unknown> = {};
  try {
    await c.query('BEGIN TRANSACTION READ ONLY');
    const env = await environnement(c);

    // Toutes les requêtes du moteur passent désormais par le client dédié, en lecture seule, et sont journalisées dans
    // l'ORDRE D'ÉMISSION (numéro posé à l'appel). Le moteur en lance certaines en parallèle : on les FILE nous-mêmes, une à
    // une, dans cet ordre (un client pg n'exécute qu'une requête à la fois ; laisser pg les empiler est déprécié).
    let file: Promise<unknown> = Promise.resolve();
    (pool as unknown as { query: unknown }).query = async (texte: string | { text: string }, params?: unknown[]): Promise<QueryResult> => {
      const entree: EntreeJournal = {
        n: journal.length + 1, appelant: appelant(), sql: sqlNormalise(typeof texte === 'string' ? texte : texte.text),
        params: params ?? [], colonnes: [], nbLignes: null, lignes: [],
      };
      journal.push(entree);
      const execution = file.then(() => c.query(texte as string, params as never));
      file = execution.catch(() => undefined); // une requête en échec ne bloque pas la suivante (l'erreur remonte à son appelant)
      const r = await execution;
      entree.colonnes = r.fields.map((f) => ({ nom: f.name, typeOid: f.dataTypeID }));
      entree.nbLignes = r.rowCount;
      entree.lignes = r.rows;
      return r;
    };

    // a → f : le chemin de production, inchangé (analyserAdresse = construireEntree puis analyser).
    const { validation, entree } = await construireEntree({ ...CAS_GOLDEN, point: { ...CAS_GOLDEN.point } });
    const profilGolden = PROFIL_GOLDEN_DIAG as unknown as ProfilDegagement;
    // config_scoring LUE (profil live) : n'entre PAS dans le golden (profil gelé injecté), imprimée pour comparaison.
    const profilLive = await chargerProfilDegagement();
    const configBrute = await c.query('SELECT * FROM config_scoring WHERE id = 1'); // lecture du diagnostic, hors journal du moteur

    if (SQL_SEUL) {
      sortie = { environnement: env, sql: journal };
    } else {
      // g : l'étape PURE, telle que analyserAdresse l'appelle (sans ventilation), puis avec la ventilation par faisceau
      //     (opt-in, bit-identique sur le total — BE-19) pour le détail des 61 faisceaux.
      const resultat = entree === null ? null : analyser(entree, profilGolden);
      const detail = entree === null ? null : analyser(entree, profilGolden, { ventilation: true });
      const resultatLive = entree === null ? null : analyser(entree, profilLive);
      const total = resultat?.score.total ?? null;
      sortie = {
        environnement: env,
        parametres: { ...CAS_GOLDEN, hauteurSousPlafondM: null, mode: 'semi_auto', profil: 'PROFIL_GOLDEN_REF (copie exacte)' },
        etapes: {
          a_validation_origine: validation,
          b_hauteur_vision_m: hauteurVision(CAS_GOLDEN.etage),
          b_altitude_fenetre_m: entree?.altitudeFenetreM ?? null,
          c_obstacles_axe_principal: entree?.obstaclesAxePrincipal ?? null,
          d_faisceaux_61: entree?.faisceaux ?? null,
          d_bis_extraction_vue_nature: entree?.extractionVueNature ?? null,
          d_ter_extraction_immobilier: entree?.extractionImmobilier ?? null,
          d_quater_extraction_monuments: entree?.extractionMonuments ?? null,
          e_paysage: entree?.paysage ?? null,
          g_profil_golden: profilGolden,
          g_resultat_golden: resultat,
          g_ventilation_par_faisceau: detail?.ventilation ?? null,
        },
        config_scoring: { ligne_brute: configBrute.rows[0] ?? null, profil_lu: profilLive, resultat_avec_profil_lu: resultatLive },
        controle: {
          score_total: total,
          score_golden_scelle: SCORE_GOLDEN,
          egal_au_golden: total === SCORE_GOLDEN,
          ecart: total === null ? null : total - SCORE_GOLDEN,
          verdict: resultat?.verdict.verdict ?? null,
        },
        sql: journal,
      };
    }
  } finally {
    (pool as unknown as { query: unknown }).query = original;
    try { await c.query('ROLLBACK'); } finally { c.release(); }
    await closePool();
  }
  process.stdout.write(jsonStable(sortie));
}

main().catch((e) => {
  console.error('[diag-golden] échec :', e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
