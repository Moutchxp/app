import { query } from '../db/client';

/**
 * DÉBLOCAGE MANUEL de la traçabilité d'UNE PAGE (réversible). MÊME moule que les exclusions/inclusions best-of (LOT 61/92,
 * `bestOfExclusionRepo`) : on ne persiste QUE le geste manuel, grain = LA PAGE, identité STABLE = (pieceId = dossier_document.id,
 * page 1-based). La classification AUTO reste calculée à la volée ; ce registre lui ajoute, par page, une traçabilité VRAIE de plus.
 * RÉSILIENT : migration 210 absente (42P01/42703) → lecture [] et écritures no-op (aucun déblocage, comportement d'avant) — jamais
 * d'exception propagée à l'appelant. Le déblocage/retrait ne touche NI le document NI la page en GED.
 */
export interface PageTracableManuel { pieceId: number; page: number }

/** Pages débloquées à la main d'un dossier. [] si la table manque (résilient) → ces pages restent non traçables. */
export async function lireDeblocagesTracable(dossierId: number): Promise<PageTracableManuel[]> {
  try {
    const { rows } = await query<{ piece_id: number; page: number }>(
      `SELECT piece_id::int AS piece_id, page FROM permis_page_tracable_manuel WHERE dossier_id = $1 ORDER BY piece_id, page`, [dossierId]);
    return rows.map((r) => ({ pieceId: r.piece_id, page: r.page }));
  } catch { return []; } // 210 absente → aucun déblocage
}

/** Vrai si CETTE page (pieceId, page) a été débloquée à la main. `false` si la table manque (résilient → verrou métier maintenu). */
export async function estPageDebloquee(pieceId: number, page: number): Promise<boolean> {
  try {
    const { rowCount } = await query(
      `SELECT 1 FROM permis_page_tracable_manuel WHERE piece_id = $1 AND page = $2 LIMIT 1`, [pieceId, page]);
    return (rowCount ?? 0) > 0;
  } catch { return false; } // 210 absente → non débloquée (le verrou serveur tient)
}

/** Débloque une page pour le tracé (réversible). Idempotent (ON CONFLICT DO NOTHING). `true` = persisté ; `false` = table absente (no-op). */
export async function debloquerPageTracable(dossierId: number, pieceId: number, page: number, par: string | null): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_page_tracable_manuel (dossier_id, piece_id, page, debloque_par) VALUES ($1, $2, $3, $4)
         ON CONFLICT (piece_id, page) DO NOTHING`, [dossierId, pieceId, page, par]);
    return true;
  } catch { return false; } // 210 absente → non persisté (l'UI le reflétera après rechargement)
}

/** Retire le déblocage d'une page (la reverrouille). `true` = fait ; `false` = table absente (no-op). Ne supprime AUCUNE emprise (le geste sur les emprises est décidé côté route). */
export async function reverrouillerPageTracable(pieceId: number, page: number): Promise<boolean> {
  try {
    await query(`DELETE FROM permis_page_tracable_manuel WHERE piece_id = $1 AND page = $2`, [pieceId, page]);
    return true;
  } catch { return false; }
}
