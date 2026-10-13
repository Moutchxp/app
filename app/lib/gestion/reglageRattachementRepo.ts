import { query } from '../db/client';
import { reglageRattachementDisponible } from './schema';
import type { ReglageRattachement } from './reglesRattachement';

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET — LE RÉGLAGE, LU EN BASE (migration 345) ═════
 * `null` = pas de table, ou lecture impossible : le moteur garde EXACTEMENT ses règles d'avant (décision C).
 */
export async function lireReglageRattachement(): Promise<ReglageRattachement | null> {
  if (!(await reglageRattachementDisponible())) return null;
  try {
    const { rows } = await query<{ mise: string; mois: number }>(
      `SELECT to_char(mise_en_service AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS mise,
              ancien_locataire_mois AS mois
         FROM gestion_rattachement_reglage WHERE id = 1`);
    const r = rows[0];
    return r === undefined ? null : { miseEnService: r.mise, ancienLocataireMois: Number(r.mois) };
  } catch (e) {
    console.error('[gestion/reglage-rattachement] lecture impossible : règles d’avant', e);
    return null;
  }
}

/**
 * RÉGLER LA DURÉE « ANCIEN LOCATAIRE » (règle B). Le seul geste d'écriture de ce réglage — la mise en service, elle, est
 * l'instant d'application de la migration et ne se modifie pas ici. Signé et daté.
 */
export async function reglerAncienLocataireMois(mois: number, auteurLibelle: string): Promise<{ ok: boolean; motif?: string }> {
  if (!Number.isInteger(mois) || mois < 0 || mois > 120) return { ok: false, motif: 'La durée doit être un nombre entier de mois, de 0 à 120.' };
  if (auteurLibelle.trim() === '') return { ok: false, motif: 'L’auteur du réglage doit être nommé.' };
  if (!(await reglageRattachementDisponible())) return { ok: false, motif: 'La migration 345 n’est pas appliquée.' };
  const r = await query(
    `UPDATE gestion_rattachement_reglage SET ancien_locataire_mois = $1, modifie_le = now(), modifie_par_libelle = $2
      WHERE id = 1`, [mois, auteurLibelle.trim()]);
  return (r.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, motif: 'Réglage introuvable.' };
}
