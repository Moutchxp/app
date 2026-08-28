import { query } from '../db/client';
import type { LigneStatutPolygone, StatutDecide } from './polygoneStatut';

/**
 * RATT-1 (2) — ADAPTATEUR IMPUR du statut décidé d'un polygone existant (préservé/détruit). Table APPEND-ONLY `permis_polygone_statut`
 * (migration 164). 🔴 La source IGN `batiment.etat_de_l_objet` n'est JAMAIS écrite ni effacée ici : on lit son SNAPSHOT au moment de
 * la décision et on l'écrit dans NOTRE table, à côté. Résilient : table absente (164 non appliquée) → lecture vide / écriture refusée
 * avec motif clair. AUCUNE écriture moteur (verdict/altitude/rattachement).
 */
export type ResultatStatut = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

/** PostgreSQL 42P01 = undefined_table (migration non appliquée). */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}

/** Toutes les lignes du registre pour un dossier (ordre quelconque ; la logique de « courant » est PURE, cf. polygoneStatut). `[]` si table absente. */
export async function lireStatutsPolygones(dossierId: number): Promise<LigneStatutPolygone[]> {
  try {
    const { rows } = await query<{ cleabs: string; statut: LigneStatutPolygone['statut']; etat: string | null; par: string | null; le: string }>(
      `SELECT cleabs, statut, etat_bdtopo_au_moment AS etat, decide_par AS par, decide_le AS le
         FROM permis_polygone_statut WHERE dossier_id = $1`, [dossierId]);
    return rows.map((r) => ({ cleabs: r.cleabs, statut: r.statut, etatBdtopoAuMoment: r.etat, decidePar: r.par, decideLe: new Date(r.le).toISOString() }));
  } catch (e) { if (estTableAbsente(e)) return []; throw e; }
}

/** cleabs des polygones BD TOPO RECOUVERTS par une emprise PROJETÉE (tracée) du dossier — ceux que le futur bâtiment remplace, donc
 *  HORS statut préservé/détruit. `[]` si aucune emprise ou table absente. Intersection PostGIS autoritaire (Lambert-93, ST_Force2D). */
export async function polygonesRecouvertsParEmprise(dossierId: number): Promise<string[]> {
  try {
    const { rows } = await query<{ cleabs: string }>(
      `WITH emp AS (SELECT geom FROM permis_emprise_reconstruite WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT DISTINCT b.cleabs
         FROM batiment b, emp
        WHERE b.cleabs IS NOT NULL AND b.geom && emp.geom AND ST_Intersects(ST_Force2D(b.geom), ST_Force2D(emp.geom))`, [dossierId]);
    return rows.map((r) => r.cleabs);
  } catch (e) { if (estTableAbsente(e)) return []; throw e; }
}

/**
 * POSER une décision de statut (append-only : une nouvelle LIGNE). `statut` = 'preserve' | 'detruit' | 'revoque'. On lit le SNAPSHOT de
 * la source IGN (`batiment.etat_de_l_objet`) au moment — jamais on ne la réécrit. Idempotence non requise (l'historique est le but).
 */
export async function poserStatutPolygone(dossierId: number, cleabs: string, statut: StatutDecide | 'revoque', par: string | null): Promise<ResultatStatut> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  try {
    // SNAPSHOT de la source IGN au moment (lecture SEULE de batiment) — la source n'est jamais modifiée.
    const src = await query<{ etat: string | null }>(`SELECT etat_de_l_objet AS etat FROM batiment WHERE cleabs = $1 LIMIT 1`, [cleabs]);
    const etatMoment = src.rows[0]?.etat ?? null;
    await query(
      `INSERT INTO permis_polygone_statut (dossier_id, cleabs, statut, etat_bdtopo_au_moment, decide_par)
       VALUES ($1, $2, $3, $4, $5)`, [dossierId, cleabs, statut, etatMoment, par]);
    return { ok: true };
  } catch (e) { if (estTableAbsente(e)) return { ok: false, motif: 'statut indisponible (migration 164 non appliquée)', tableAbsente: true }; throw e; }
}
