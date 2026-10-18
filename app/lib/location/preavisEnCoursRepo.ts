import { query } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';

/**
 * ══ QUI EST EN PRÉAVIS ? — LECTURE SEULE, pour colorer le statut « en préavis » (Arno, 19/10/2026) ══════════════════
 * Un locataire est « en préavis » quand une de ses occupations EN COURS (sans sortie) porte un préavis OUVERT (ni
 * remplacé, ni annulé). Rend, par locataire, la date maximale de sortie la plus proche. Sans la migration 383 : rien.
 *
 * Module à part, sans dépendance : la fiche commune de la Gestion le lit sans tirer le dépôt de la sortie.
 */
export async function locatairesEnPreavis(
  locataireIds: readonly number[], o: { lotId?: number } = {},
): Promise<Record<string, string>> {
  const ids = [...new Set(locataireIds)].filter((x) => Number.isInteger(x) && x > 0);
  if (ids.length === 0 || !(await colonneExisteMemo('gestion_location_preavis', 'date_max'))) return {};
  const { rows } = await query<{ locataire_id: string; date_max: string }>(
    `SELECT o.locataire_id::text, min(p.date_max)::text AS date_max
       FROM gestion_location_preavis p
       JOIN gestion_annuaire_occupation o ON o.id = p.occupation_id
      WHERE p.remplace_le IS NULL AND p.annule_le IS NULL AND o.sortie IS NULL
        AND o.locataire_id = ANY($1::bigint[]) AND ($2::bigint IS NULL OR o.lot_id = $2::bigint)
      GROUP BY o.locataire_id`, [ids, o.lotId ?? null]);
  const m: Record<string, string> = {};
  for (const r of rows) m[r.locataire_id] = r.date_max;
  return m;
}
