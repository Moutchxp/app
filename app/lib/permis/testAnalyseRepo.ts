/**
 * LOT 51 — marqueur RÉVERSIBLE « testé en analyse » (par DOSSIER), table `dossier_test_analyse` (migration 189).
 *
 * OBJET : rendre un dossier INCOMPLET (régime partiel actif) visible dans « Analyse et projection » pour l'examiner, SANS lever le
 * marqueur partiel — les relances à la mairie CONTINUENT (le suivi ne s'interrompt pas). Aller-retour RÉVERSIBLE, PAS un changement
 * de statut : ce module N'ÉCRIT NI `demande.statut` NI `partiel_leve_le` (la sortie DÉFINITIVE = LOT 51-C, distinct).
 *   • POSE (marquer)   ← bouton « Tester le dossier en analyse » depuis « En cours ».
 *   • RETRAIT (retirer) ← bouton « Remettre dans En cours » depuis Analyse, OU relance envoyée depuis la famille Complétude.
 *
 * RÉSILIENCE : table 189 non appliquée (42P01) → lecture = ∅, écritures = no-op silencieux (jamais une erreur remontée à l'UI).
 */
import { query } from '../db/client';

function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}

/** IDs des dossiers ACTUELLEMENT « testés en analyse ». Alimente la porte FIX-2 de la file de projection. ∅ si 189 non appliquée. */
export async function lireDossiersEnTest(): Promise<number[]> {
  try {
    const { rows } = await query<{ dossier_id: number }>(`SELECT dossier_id::int AS dossier_id FROM dossier_test_analyse`);
    return rows.map((r) => r.dossier_id);
  } catch (e) {
    if (estTableAbsente(e)) return [];
    throw e;
  }
}

/** POSE le marqueur sur un dossier (idempotent). `par` = e-mail administrateur (traçabilité). No-op si 189 non appliquée. */
export async function marquerTestAnalyse(dossierId: number, par: string | null): Promise<boolean> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return false;
  try {
    await query(`INSERT INTO dossier_test_analyse (dossier_id, par) VALUES ($1, $2) ON CONFLICT (dossier_id) DO NOTHING`, [dossierId, par]);
    return true;
  } catch (e) {
    if (estTableAbsente(e)) return false;
    throw e;
  }
}

/**
 * POSE le marqueur sur TOUS les dossiers ACTIFS d'une demande (le geste « Tester » vit au niveau de la demande dans « En cours », mais le
 * marqueur est per-dossier — cohérent quel que soit le nombre de dossiers de la demande). Renvoie le nombre de dossiers marqués. No-op si 189 absente.
 */
export async function marquerTestAnalyseDemande(demandeId: number, par: string | null): Promise<number> {
  if (!Number.isInteger(demandeId) || demandeId <= 0) return 0;
  try {
    const { rowCount } = await query(
      `INSERT INTO dossier_test_analyse (dossier_id, par)
         SELECT dd.dossier_id, $2 FROM demande_dossier dd WHERE dd.demande_id = $1 AND dd.actif
       ON CONFLICT (dossier_id) DO NOTHING`, [demandeId, par]);
    return rowCount ?? 0;
  } catch (e) {
    if (estTableAbsente(e)) return 0;
    throw e;
  }
}

/** RETIRE le marqueur d'un dossier (idempotent : retirer un marqueur absent = succès silencieux). No-op si 189 non appliquée. */
export async function retirerTestAnalyse(dossierId: number): Promise<boolean> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return false;
  try {
    await query(`DELETE FROM dossier_test_analyse WHERE dossier_id = $1`, [dossierId]);
    return true;
  } catch (e) {
    if (estTableAbsente(e)) return false;
    throw e;
  }
}
