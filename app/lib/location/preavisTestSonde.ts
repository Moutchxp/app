import { query } from '../db/client';

/**
 * 🔴 Arno (14/11/2026, 473) — la table des préavis de test est-elle là, et le fragment SQL qui EXCLUT leurs biens. Module à part (aucune
 * dépendance vers les repos de la Location) : le lisent `preavisRepo`, les tâches, les analyses, sans boucle d'import.
 */
let present: boolean | null = null;
export async function testDisponible(): Promise<boolean> {
  if (present === true) return true;
  try {
    const { rows } = await query<{ t: string | null }>(`SELECT to_regclass('public.gestion_location_preavis_test')::text AS t`);
    present = rows[0]?.t != null;
  } catch { present = false; }
  return present;
}
/** Épreuves seulement : oublier la sonde. */
export const oublierSondeTest = (): void => { present = null; };

/**
 * Le fragment SQL « ce bien n'est PAS un préavis de test » (`col` : la colonne du lot) — sans la 473 : vrai. Les tests masqués restent exclus.
 */
export async function sqlHorsTest(col: string): Promise<string> {
  return (await testDisponible()) ? `NOT EXISTS (SELECT 1 FROM gestion_location_preavis_test t__ WHERE t__.lot_id = ${col})` : 'TRUE';
}

