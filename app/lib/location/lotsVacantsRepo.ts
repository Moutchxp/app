import { query } from '../db/client';
import { sqlBienDuPortefeuille } from './portefeuilleRepo';
import { colonneExisteMemo } from './sondeLocation';
import { aujourdhuiParis } from './reglagesDpe';
import { biensVacants, detailVacants, type DetailVacants, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 6 ; règle du 28/11/2026, 11h43) LE NOMBRE DE LOTS VACANTS À L'INSTANT : les lots actifs du portefeuille, leur
 * rattachement (lot principal, « Détacher », fiche autonome ouverte) et leurs occupations ; les BIENS et leur vacance sont ceux du module pur
 * (`biensVacants`). LECTURE SEULE ; `null` si la lecture échoue (le titre reste « Location »).
 */
export async function lireLotsPourVacance(): Promise<LotPourVacance[]> {
  const annexes = await colonneExisteMemo('gestion_lot_annexe', 'parent_id');
  const detache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const regroupement = await colonneExisteMemo('gestion_bien_regroupement', 'tete_id');
  const categorie = await colonneExisteMemo('gestion_annuaire_lot', 'categorie');
  const nomAnnexe = await colonneExisteMemo('gestion_annuaire_lot', 'nom_annexe');
  const { rows } = await query<{ id: string; categorie: string | null; nom_annexe: string | null; nature: string | null; type_bien: string | null; parent: string | null; detachee: boolean; regroupement: { id: number; tete: number } | null;
    occupations: { entree: string | null; sortie: string | null }[] | null }>(
    `SELECT lo.id::text, ${categorie ? 'lo.categorie' : 'NULL::text'} AS categorie, ${nomAnnexe ? 'lo.nom_annexe' : 'NULL::text'} AS nom_annexe, lo.nature, lo.type_bien,
            ${annexes ? '(SELECT min(ax.parent_id)::text FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id)' : 'NULL::text'} AS parent,
            ${detache ? 'lo.annexe_detachee_le IS NOT NULL' : 'false'} AS detachee,
            ${regroupement ? `(SELECT json_build_object('id', r.id, 'tete', r.tete_id) FROM gestion_bien_regroupement r
                                WHERE r.clos_le IS NULL AND lo.id = ANY (r.lot_ids) ORDER BY r.id DESC LIMIT 1)` : 'NULL::json'} AS regroupement,
            (SELECT json_agg(json_build_object('entree', o.entree::text, 'sortie', o.sortie::text)) FROM gestion_annuaire_occupation o
              WHERE o.lot_id = lo.id AND o.absent_le IS NULL) AS occupations
       FROM gestion_annuaire_lot lo
      WHERE ${await sqlBienDuPortefeuille('lo')}`);
  return rows.map((r) => ({
    id: Number(r.id), parentId: r.parent === null ? null : Number(r.parent), detachee: r.detachee === true,
    regroupement: r.regroupement === null ? null : { id: Number(r.regroupement.id), teteId: Number(r.regroupement.tete) },
    occupations: r.occupations ?? [],
    categorie: r.categorie, nomAnnexe: r.nom_annexe, nature: r.nature, typeBien: r.type_bien,
  }));
}

/** 🔴 (Arno, 28/11/2026, 11h47) le total ET le décompte par type des biens vacants ; `null` si la lecture échoue. */
export async function compterLotsVacants(maintenant: Date = new Date()): Promise<DetailVacants | null> {
  try {
    return detailVacants(biensVacants(await lireLotsPourVacance(), aujourdhuiParis(maintenant)));
  } catch {
    return null;
  }
}
