import { Pool, QueryResult, QueryResultRow } from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL manquant — vérifie le fichier .env à la racine du repo.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return pool.query<R>(text, params as never);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/** Fonction de requête transactionnelle passée à `withTransaction` (même signature que `query`). */
export type RequeteTx = <R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<QueryResult<R>>;

/**
 * Exécute `fn` dans UNE transaction (BEGIN → COMMIT ; ROLLBACK complet si `fn` throw). Le client dédié
 * est toujours libéré (`finally`). Sert aux opérations multi-requêtes atomiques (ex. rollback d'édition
 * de curation) que le pool `query()` (auto-commit par appel) ne peut pas garantir seul.
 */
export async function withTransaction<T>(fn: (q: RequeteTx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q: RequeteTx = (text, params) => client.query(text, params as never);
    const resultat = await fn(q);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
