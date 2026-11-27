import { query } from '../db/client';
import { sqlBienDuPortefeuille } from './portefeuilleRepo';
import { colonneExisteMemo } from './sondeLocation';
import { aujourdhuiParis } from './reglagesDpe';
import { lotsVacants, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 6) LE NOMBRE DE LOTS VACANTS À L'INSTANT : les biens actifs du portefeuille, s'ils sont rattachés comme annexe, et
 * leurs occupations ; la règle est celle du module pur (`lotsVacants`). LECTURE SEULE ; `null` si la lecture échoue (le titre reste « Location »).
 */
export async function compterLotsVacants(maintenant: Date = new Date()): Promise<number | null> {
  try {
    const detache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
    const { rows } = await query<{ id: string; annexe: boolean; occupations: { entree: string | null; sortie: string | null }[] | null }>(
      `SELECT lo.id::text,
              EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id)${detache ? ' AND lo.annexe_detachee_le IS NULL' : ''} AS annexe,
              (SELECT json_agg(json_build_object('entree', o.entree::text, 'sortie', o.sortie::text)) FROM gestion_annuaire_occupation o
                WHERE o.lot_id = lo.id AND o.absent_le IS NULL) AS occupations
         FROM gestion_annuaire_lot lo
        WHERE ${await sqlBienDuPortefeuille('lo')}`);
    const lots: LotPourVacance[] = rows.map((r) => ({ id: Number(r.id), annexeRattachee: r.annexe === true, occupations: r.occupations ?? [] }));
    return lotsVacants(lots, aujourdhuiParis(maintenant)).length;
  } catch {
    return null;
  }
}
