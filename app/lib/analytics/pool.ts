import 'server-only';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import {
  POOL_MAX,
  CONNECT_TIMEOUT_MS,
  STATEMENT_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  IDLE_IN_TX_TIMEOUT_MS,
} from './config';

/**
 * M2 — Analytics, LOT 1. POOL `pg` DÉDIÉ ET BORNÉ, strictement DISTINCT du pool applicatif
 * (`app/lib/db/client.ts:8`, non configuré, `max=10`, `connectionTimeoutMillis=0`).
 *
 * RAISON D'ÊTRE (constat R2/R3 de la revue) : sur le pool applicatif partagé, une rafale d'écritures
 * analytiques pourrait AFFAMER les lectures LiDAR du tunnel public → un `connect()` du calcul
 * attendrait indéfiniment → certification bloquée. En isolant l'analytique dans un pool à `max` très
 * bas + timeouts courts, une écriture analytique ne peut JAMAIS consommer une connexion du calcul ni
 * faire patienter le tunnel.
 *
 * ISOLATION : ce module N'IMPORTE PAS `app/lib/db/client.ts`. Il crée sa PROPRE instance `Pool`. Le
 * `application_name = svav_analytics` rend l'isolation visible dans `pg_stat_activity`.
 *
 * ⚠️ Ce module ne DOIT jamais être importé par le moteur de calcul (`app/lib/svv/**`, `pipeline.ts`) —
 * garde ESLint + test de graphe d'imports (voir `gardeImports.test.ts`).
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL manquant — analytics/pool.ts');
}

/** Instance de pool DÉDIÉE à l'analytique. Jamais partagée avec le calcul. */
export const poolAnalytics = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'svav_analytics',
  max: POOL_MAX,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: IDLE_IN_TX_TIMEOUT_MS,
});

/**
 * Requête analytique — passe TOUJOURS par `poolAnalytics`, jamais par `pool` (applicatif). Mono-
 * instruction auto-commit (jamais de transaction : cela épinglerait une connexion). L'appelant
 * (`writer.ts`) enveloppe déjà tout throw ; cette fonction reste volontairement mince.
 */
export function queryAnalytics<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return poolAnalytics.query<R>(text, params as never);
}

/** Fermeture propre (arrêt du process / tests). N'attend pas les écritures en vol. */
export async function fermerPoolAnalytics(): Promise<void> {
  await poolAnalytics.end();
}
