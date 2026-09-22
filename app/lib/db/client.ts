import { Pool, QueryResult, QueryResultRow } from "pg";
import "dotenv/config";
import { poolContextuel } from "./plafondAnalyse";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL manquant — vérifie le fichier .env à la racine du repo.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Filet de sûreté pg (robustesse) : un client INACTIF du pool peut émettre 'error' (coupure réseau / arrêt du
// backend). Sans écouteur, cet 'error' d'EventEmitter est NON CAPTÉ → Node fait tomber TOUT le process. On le
// journalise ; pg retire le client mort du pool, les requêtes suivantes rouvrent une connexion. Aucun autre effet.
pool.on('error', (e) => { console.error('[db/client] erreur pool pg (client inactif)', e); });

/**
 * Porte UNIQUE d'accès à la base pour tout le code applicatif (384 fichiers).
 *
 * Routage : par défaut le pool applicatif ci-dessus, SANS plafond — comportement historique, requis par
 * les opérations légitimement longues (imports BD TOPO/cadastre/Sitadel, veille, relève IMAP, scripts).
 * EXCEPTION : à l'intérieur de `avecPlafondAnalyse()` (uniquement `POST /api/analyse`), le contexte
 * asynchrone impose le pool BORNÉ du chemin public — cf. `plafondAnalyse.ts`. Le choix se fait ICI, à la
 * porte, pour que les 7 modules du chemin public (origine/obstacles/faisceaux/…) restent INTOUCHÉS.
 */
export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return (poolContextuel() ?? pool).query<R>(text, params as never);
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
