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
