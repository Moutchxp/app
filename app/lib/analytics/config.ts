import 'server-only';

/**
 * M2 — Analytics, LOT 1 (fondation). Paramètres d'INFRASTRUCTURE du canal d'écriture analytique.
 *
 * POURQUOI ICI ET PAS EN TABLE DE CONFIG ? Ces paramètres dimensionnent le POOL `pg` dédié, qui est
 * créé à l'IMPORT du module `pool.ts` — donc AVANT qu'aucune lecture base ne soit possible. Ils ne
 * peuvent pas être lus depuis la base au démarrage. Ils sont donc des constantes d'infrastructure,
 * surchargeables par variable d'environnement (éditable sans toucher au code, via `.env`).
 *
 * ⚠️ DISTINCTION IMPORTANTE (voir rapport de build, décision A) :
 *  - Les DURÉES DE RÉTENTION (combien de temps on garde un agrégat / une session éphémère) sont des
 *    variables de COMPORTEMENT, éditables au runtime par un non-développeur → elles vivent dans la
 *    table `analytics_retention` (migration 018), PAS ici. Le hot path ne les lit jamais.
 *  - Les bornes du pool + timeouts d'écriture sont des garde-fous d'INFRASTRUCTURE (hot path, avant
 *    toute lecture base) → ici, surchargeables par env.
 *
 * INVARIANT DE SÛRETÉ : perdre un événement analytique est ACCEPTABLE ; bloquer/ralentir une
 * certification ne l'est JAMAIS. Toutes les valeurs ci-dessous sont choisies dans ce sens (bornage
 * strict, échec rapide plutôt qu'attente).
 */

/** Lit une surcharge d'env entière positive, sinon la valeur par défaut. */
function entierEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || brut === '') return defaut;
  const n = Number(brut);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : defaut;
}

/**
 * Nombre MAX de connexions du pool analytique dédié. Volontairement TRÈS bas : l'analytique est
 * best-effort et de faible priorité ; la borner à 2 garantit qu'une rafale d'écritures ne peut jamais
 * consommer les connexions du pool de CALCUL (LiDAR), même si les deux pointaient la même base.
 * Surcharge : `ANALYTICS_POOL_MAX`.
 */
export const POOL_MAX = entierEnv('ANALYTICS_POOL_MAX', 2);

/**
 * Attente MAX (ms) pour obtenir une connexion analytique libre. Court : si le pool analytique est
 * saturé, on ABANDONNE l'événement plutôt que d'attendre (jamais d'attente infinie comme le pool
 * applicatif `client.ts` dont `connectionTimeoutMillis` vaut 0). Surcharge : `ANALYTICS_CONNECT_TIMEOUT_MS`.
 */
export const CONNECT_TIMEOUT_MS = entierEnv('ANALYTICS_CONNECT_TIMEOUT_MS', 2000);

/**
 * `statement_timeout` (ms) posé sur CHAQUE connexion analytique : Postgres ANNULE côté serveur toute
 * requête analytique dépassant ce délai. Une écriture d'agrégat normale prend < 10 ms ; 3 s est un
 * plafond généreux qui borne le rayon de souffle d'une requête pathologique. Surcharge : `ANALYTICS_STATEMENT_TIMEOUT_MS`.
 */
export const STATEMENT_TIMEOUT_MS = entierEnv('ANALYTICS_STATEMENT_TIMEOUT_MS', 3000);

/** Fermeture d'une connexion analytique inactive (ms). Surcharge : `ANALYTICS_IDLE_TIMEOUT_MS`. */
export const IDLE_TIMEOUT_MS = entierEnv('ANALYTICS_IDLE_TIMEOUT_MS', 10000);

/**
 * `idle_in_transaction_session_timeout` (ms) : un événement analytique NE DOIT jamais ouvrir de
 * transaction longue (écritures mono-instruction auto-commit) ; ce garde-fou tue toute transaction
 * analytique laissée ouverte. Surcharge : `ANALYTICS_IDLE_IN_TX_TIMEOUT_MS`.
 */
export const IDLE_IN_TX_TIMEOUT_MS = entierEnv('ANALYTICS_IDLE_IN_TX_TIMEOUT_MS', 3000);

/**
 * Timeout DUR côté JS (ms) : si l'écriture analytique n'a pas abouti dans ce délai, on ABANDONNE
 * l'événement (la promesse d'écriture est laissée se résoudre en arrière-plan, jamais attendue au-delà).
 * Ceinture + bretelles avec `statement_timeout` (qui, lui, annule côté serveur). Surcharge : `ANALYTICS_ECRITURE_TIMEOUT_MS`.
 */
export const ECRITURE_TIMEOUT_MS = entierEnv('ANALYTICS_ECRITURE_TIMEOUT_MS', 2000);
