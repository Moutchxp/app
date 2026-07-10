import 'server-only';
import { withTransaction } from '../../db/client';
import type { QueryResultRow } from 'pg';

/**
 * M2 — LOT 4. Accès LECTURE du grand livre. Deux garanties structurelles :
 *  1. LECTURE SEULE RÉELLE — `SET TRANSACTION READ ONLY` : tout INSERT/UPDATE/DELETE dans cette
 *     transaction LÈVE côté Postgres. La couche de lecture ne peut PAS écrire, même par accident (pas
 *     seulement par convention). C'est la réponse à la revue R2.
 *  2. BORNE — `statement_timeout` court : une requête pathologique est annulée côté serveur, ne peut pas
 *     tenir une connexion du pool applicatif indéfiniment.
 *
 * POOL : le pool APPLICATIF (`db/client`), en lecture — ce n'est PAS de l'écriture analytique, donc PAS le
 * pool dédié du writer (Lot 1). Un SELECT ne bloque jamais un INSERT concurrent (MVCC) → lire le grand
 * livre ne gêne pas l'écriture du writer (qui vit de toute façon sur son propre pool `svav_analytics`).
 *
 * ⚠️ Ce module ne lit JAMAIS `analytics_session` (sessions brutes) — seulement les COMPTEURS permanents.
 * Vérifié par test de source (aucun `analytics_session` sous `lecture/`).
 */

/** Délai max (ms) d'une requête de lecture statistique. Borne d'infra (pas une variable de comportement). */
const TIMEOUT_LECTURE_MS = 5000;

export async function lireGrandLivre<R extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return withTransaction(async (q) => {
    await q('SET TRANSACTION READ ONLY'); // 1re instruction : verrouille la transaction en lecture seule
    await q(`SET LOCAL statement_timeout = ${TIMEOUT_LECTURE_MS}`);
    const r = await q<R>(sql, params);
    return r.rows;
  });
}
