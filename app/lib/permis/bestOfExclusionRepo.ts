import { query } from '../db/client';

/**
 * LOT 61 — EXCLUSIONS du best-of (pages retirées à la main, réversibles). On ne persiste QUE les exclusions : le best-of reste
 * calculé à la volée, on lui soustrait ces pages. Identité STABLE d'une page = (pieceId = dossier_document.id, page 1-based).
 * RÉSILIENT : migration 190 absente (42P01/42703) → lecture [] et écritures no-op (best-of complet, comportement d'avant) — jamais
 * d'exception propagée à l'appelant. Le retrait ne touche NI le document NI la page en GED : il ne fait qu'ôter de la SÉLECTION.
 */
export interface PageExclue { pieceId: number; page: number }

/** Pages exclues d'un dossier. [] si la table manque (résilient) → best-of complet. */
export async function lireExclusionsBestOf(dossierId: number): Promise<PageExclue[]> {
  try {
    const { rows } = await query<{ piece_id: number; page: number }>(
      `SELECT piece_id::int AS piece_id, page FROM permis_best_of_exclusion WHERE dossier_id = $1 ORDER BY piece_id, page`, [dossierId]);
    return rows.map((r) => ({ pieceId: r.piece_id, page: r.page }));
  } catch { return []; } // 190 absente → aucune exclusion (best-of complet)
}

/** Retire une page du best-of (réversible). Idempotent (ON CONFLICT DO NOTHING). `true` = persisté ; `false` = table absente (no-op). */
export async function exclurePageBestOf(dossierId: number, pieceId: number, page: number, par: string | null): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_best_of_exclusion (dossier_id, piece_id, page, exclu_par) VALUES ($1, $2, $3, $4)
         ON CONFLICT (piece_id, page) DO NOTHING`, [dossierId, pieceId, page, par]);
    return true;
  } catch { return false; } // 190 absente → non persisté (l'UI réintègrera la page)
}

/** Réintègre une page dans le best-of (annule le retrait). `true` = fait ; `false` = table absente (no-op). */
export async function reintegrerPageBestOf(pieceId: number, page: number): Promise<boolean> {
  try {
    await query(`DELETE FROM permis_best_of_exclusion WHERE piece_id = $1 AND page = $2`, [pieceId, page]);
    return true;
  } catch { return false; }
}
