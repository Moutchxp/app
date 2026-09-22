import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool } from 'pg';

/**
 * PLAFOND D'ATTENTE DE LA BASE, SCOPÉ AU SEUL CHEMIN DE L'ANALYSE PUBLIQUE (`POST /api/analyse`).
 *
 * ── Le trou qu'on bouche ─────────────────────────────────────────────────────────────────────────
 * Le pool applicatif (`client.ts:8`) est construit NU : valeurs `pg` par défaut, donc `max=10`,
 * `connectionTimeoutMillis=0` (attente d'une connexion INFINIE) et AUCUN `statement_timeout`
 * (Postgres est lui aussi à `statement_timeout=0`). Une requête PostGIS pathologique peut donc tourner
 * sans borne et immobiliser l'une des 10 connexions ; l'internaute, lui, voit son navigateur abandonner
 * au bout de 60 s (`app/page.tsx:2502`) sans que rien ne soit relâché côté serveur.
 *
 * ── Pourquoi PAS de plafond global sur le pool partagé ───────────────────────────────────────────
 * Arbitrage du porteur : 384 fichiers passent par ce pool — imports BD TOPO / cadastre / Sitadel,
 * veille, relève IMAP, migrations, scripts CLI. Ces opérations sont LÉGITIMEMENT longues (plusieurs
 * minutes) ; un `statement_timeout` global les tuerait. Le plafond est donc posé sur le SEUL chemin
 * public, et sur lui seul.
 *
 * ── Forme retenue : pool dédié + contexte asynchrone (et pourquoi) ───────────────────────────────
 * Les 7 modules du chemin public (`origine`, `obstacles`, `faisceaux`, `hauteurLidar`,
 * `obstacleIdentite`, `profilConfig`, `svv/preparateurPaysage`) accèdent TOUS à la base par la MÊME
 * porte : la fonction `query()` de `client.ts`. Aucun n'ouvre de `pool.connect()` ni de transaction.
 * On exploite cette porte unique : `avecPlafondAnalyse()` pose un `AsyncLocalStorage` que `query()`
 * consulte pour router vers le pool BORNÉ. Conséquences :
 *   - ZÉRO modification des 7 modules du moteur d'accès données (fichiers sensibles) → le calcul, le
 *     score et le verdict sont intouchés, le golden 29.107259068449615 reste bit-identique ;
 *   - le périmètre est EXACT : seul ce qui s'exécute À L'INTÉRIEUR de `avecPlafondAnalyse()` est routé.
 *     Tout le reste (admin, imports, veille, relève, scripts, tests d'intégration, golden) garde le pool
 *     par défaut, SANS plafond — comportement rigoureusement inchangé.
 * L'alternative `SET LOCAL statement_timeout` dans une transaction dédiée a été écartée : elle aurait
 * imposé de faire traverser un client à ces 7 modules (même invasivité) ET d'ouvrir une transaction là
 * où il n'y en avait aucune — épingler une connexion pour poser un plafond est un remède plus lourd que
 * le mal. Un `statement_timeout` porté par les paramètres de connexion du pool obtient le même plafond
 * sans transaction.
 *
 * ⚠️ Ce module ne dépend PAS de `client.ts` (il crée sa propre instance `Pool`) : c'est `client.ts` qui
 * l'importe. Sens unique, aucun cycle.
 */

/** Lecture d'un entier d'environnement, avec repli sur le défaut si absent/illisible/non positif. */
function entierEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined) return defaut;
  const n = Number.parseInt(brut, 10);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

/**
 * `statement_timeout` (ms) posé sur CHAQUE connexion du chemin public : Postgres ANNULE côté serveur
 * (SQLSTATE 57014) toute requête qui dépasse. Le calcul complet MESURÉ le 22/09/2026 tient en
 * 0,15 s à chaud et 0,69 s à froid, requête la plus lente ≈ 0,4 s → 15 s est une marge de deux ordres
 * de grandeur : seul un blocage réel peut l'atteindre. Surcharge : `ANALYSE_STATEMENT_TIMEOUT_MS`.
 */
export const STATEMENT_TIMEOUT_ANALYSE_MS = entierEnv('ANALYSE_STATEMENT_TIMEOUT_MS', 15_000);

/**
 * Attente MAX (ms) d'une connexion libre du pool public. Le pool applicatif attend INDÉFINIMENT
 * (`connectionTimeoutMillis=0`) : sous saturation, la requête de l'internaute resterait pendue sans
 * jamais rendre la main. Ici on abandonne proprement à 10 s → la route répond 503 au lieu de laisser
 * le navigateur expirer. Surcharge : `ANALYSE_CONNECT_TIMEOUT_MS`.
 */
export const CONNECT_TIMEOUT_ANALYSE_MS = entierEnv('ANALYSE_CONNECT_TIMEOUT_MS', 10_000);

/** Taille du pool public — IDENTIQUE au défaut `pg` du pool applicatif (10) : on borne l'ATTENTE, pas
 *  la capacité de service. Surcharge : `ANALYSE_POOL_MAX`. */
export const POOL_MAX_ANALYSE = entierEnv('ANALYSE_POOL_MAX', 10);

/**
 * Pool DÉDIÉ au chemin de l'analyse publique. `application_name` distinct → l'isolation est visible
 * dans `pg_stat_activity` (même convention que `svav_analytics`).
 */
export const poolAnalysePublique = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'svav_analyse_publique',
  max: POOL_MAX_ANALYSE,
  connectionTimeoutMillis: CONNECT_TIMEOUT_ANALYSE_MS,
  statement_timeout: STATEMENT_TIMEOUT_ANALYSE_MS,
});

// Filet de sûreté pg (cf. `client.ts`, item G3) : un 'error' émis par un client INACTIF et non écouté
// fait tomber TOUT le process Node. On le journalise ; pg recycle le client mort. Aucun autre effet.
poolAnalysePublique.on('error', (e) => { console.error('[db/plafondAnalyse] erreur pool pg (client inactif)', e); });

/** Contexte asynchrone : porte le pool à utiliser pour la durée d'une analyse publique. */
const contextePool = new AsyncLocalStorage<Pool>();

/** Pool imposé par le contexte courant, ou `undefined` hors analyse publique (→ pool applicatif). */
export function poolContextuel(): Pool | undefined {
  return contextePool.getStore();
}

/**
 * Exécute `fn` avec le plafond d'analyse publique : toute requête émise par `query()` pendant
 * l'exécution (y compris à travers les `await`) part sur `poolAnalysePublique`. À utiliser UNIQUEMENT
 * dans `POST /api/analyse`, autour de l'appel au pipeline.
 */
export function avecPlafondAnalyse<T>(fn: () => Promise<T>): Promise<T> {
  return contextePool.run(poolAnalysePublique, fn);
}

/**
 * Vrai si l'erreur est la MANIFESTATION d'un plafond atteint — les deux seules formes possibles :
 *  - `57014` (`query_canceled`) : Postgres a annulé la requête sur `statement_timeout` ;
 *  - « timeout exceeded when trying to connect » : `pg` a abandonné l'attente d'une connexion libre.
 * Toute autre erreur (SQL, réseau, métier) retourne `false` et suit le chemin d'erreur habituel.
 */
export function estPlafondAtteint(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '57014') return true;
  const message = e instanceof Error ? e.message : '';
  return /timeout exceeded when trying to connect/i.test(message);
}
