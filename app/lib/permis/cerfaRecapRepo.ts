import { query } from '../db/client';
import type { DeclarationsRecapCerfa } from './recapCerfa';

/**
 * LOT 67 — persistance de l'INSTANTANÉ des déclarations du Cerfa (récapitulatif). Informatif : affiché en lecture seule, n'alimente
 * AUCUNE colonne de valeur arbitrée par la précédence, n'écrase AUCUN champ Sitadel. RÉSILIENT : migration 192 absente (42P01/42703)
 * → écriture no-op et lecture null (aucun bloc « déclarations du Cerfa », comportement d'avant) — jamais d'exception propagée.
 */
export interface DeclarationsCerfaStockees { declarations: DeclarationsRecapCerfa; pieceSource: string | null; majLe: string | null }

/** Écrit (remplace) l'instantané d'un dossier. `true` = persisté ; `false` = table absente (no-op). */
export async function ecrireDeclarationsRecap(dossierId: number, declarations: DeclarationsRecapCerfa, pieceSource: string | null, majPar: string): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_cerfa_recap (dossier_id, declarations, piece_source, maj_le, maj_par)
         VALUES ($1, $2::jsonb, $3, now(), $4)
         ON CONFLICT (dossier_id) DO UPDATE
           SET declarations = EXCLUDED.declarations, piece_source = EXCLUDED.piece_source, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
      [dossierId, JSON.stringify(declarations), pieceSource, majPar]);
    return true;
  } catch { return false; } // 192 absente → non persisté
}

/** Lit l'instantané d'un dossier, ou null (table absente OU jamais écrit) → l'UI n'affiche pas le bloc. */
export async function lireDeclarationsRecap(dossierId: number): Promise<DeclarationsCerfaStockees | null> {
  try {
    const { rows } = await query<{ declarations: DeclarationsRecapCerfa; piece_source: string | null; maj_le: string }>(
      `SELECT declarations, piece_source, maj_le FROM permis_cerfa_recap WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    return r ? { declarations: r.declarations, pieceSource: r.piece_source, majLe: r.maj_le } : null;
  } catch { return null; } // 192 absente → aucun bloc
}
