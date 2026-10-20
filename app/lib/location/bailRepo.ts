import type { RequeteTx } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';

/**
 * ══ 🔴🔴 LE BAIL, FICHE À PART ENTIÈRE (migration 393, Arno, 20/10/2026). ═══════════════════════════════════════════════════
 *
 * Avant la 393, un « bail » n'existait pas : on le reconstituait par « même lot + même date d'entrée ». Depuis, chaque
 * occupation porte `bail_id` (FK) ; le loyer de départ (370), les conditions d'entrée (391) et les garants s'y rattachent.
 * Une nouvelle occupation reçoit son bail PAR DÉCLENCHEUR (bail désigné par l'appelant, sinon le bail en cours du même bien à
 * la même date, sinon un bail neuf) : aucun chemin d'écriture ne peut l'oublier.
 * 🔴 AVANT LA 393 : tout est SONDÉ ; sans elle, chaque lecture garde sa règle d'avant (par occupation, par « lot + date »).
 */

export function bailDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_occupation', 'bail_id');
}

export function garantsDisponibles(): Promise<boolean> {
  return colonneExisteMemo('gestion_bail_garant', 'bail_id');
}

/**
 * Les lignes de loyer de départ (370, alias `x`) d'une occupation (alias `o`) : avec la 393, celles de SON BAIL (une occupation
 * sans bien — hors gestion — garde les siennes) ; sans elle, les siennes. Une seule écriture du prédicat pour tous les lecteurs.
 */
export function sqlConditionsDe(x: string, o: string, avecBail: boolean): string {
  return avecBail ? `(${x}.bail_id = ${o}.bail_id OR (${o}.bail_id IS NULL AND ${x}.occupation_id = ${o}.id))` : `${x}.occupation_id = ${o}.id`;
}

/** Les occupations du même bail qu'une occupation `o` (alias `y`), pour un `EXISTS` / une jointure. */
export function sqlMemeBail(y: string, o: string, avecBail: boolean): string {
  return avecBail ? `(${y}.bail_id = ${o}.bail_id)` : `(${y}.lot_id = ${o}.lot_id AND ${y}.entree IS NOT DISTINCT FROM ${o}.entree)`;
}

/** Crée un bail (dans la transaction de l'appelant) : le bien et la date d'entrée. Rend son identifiant. */
export async function creerBailDans(q: RequeteTx, lotId: number, entree: string | null): Promise<number> {
  const { rows } = await q<{ id: string }>('INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, $2::date) RETURNING id::text', [lotId, entree]);
  return Number(rows[0].id);
}

/** Le bail EN COURS d'un lot (« Ajouter un occupant » rejoint ce bail), ou `null`. */
export async function bailEnCoursDuLotDans(q: RequeteTx, lotId: number): Promise<number | null> {
  const { rows } = await q<{ bail_id: string | null }>(
    `SELECT o.bail_id::text FROM gestion_annuaire_occupation o
      WHERE o.lot_id = $1 AND o.sortie IS NULL AND o.bail_id IS NOT NULL
      ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1`, [lotId]);
  return rows[0]?.bail_id == null ? null : Number(rows[0].bail_id);
}
