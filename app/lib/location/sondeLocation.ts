import { query } from '../db/client';
import { creerMemoireSonde } from '../db/sondeSchema';

/**
 * TUILE LOCATION — « cette colonne existe-t-elle ? », sondé HORS transaction et mémorisé (le « oui » pour toujours, le
 * « non » quelques secondes). Même règle que `gestion/schema.ts` : une migration appliquée se voit sans redémarrer, et
 * une base plus ancienne que le code ne fait jamais tomber un écran.
 */
const memoire = creerMemoireSonde();

export function colonneExisteMemo(table: string, colonne: string): Promise<boolean> {
  return memoire.memoiser(`${table}.${colonne}`, async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, colonne]);
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false;
    }
  });
}

/** Pour les tests : oublie ce qu'on croyait savoir du schéma. */
export function oublierSchemaLocation(): void { memoire.oublier(); }
