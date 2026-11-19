import { query } from '../db/client';
import { minutesRdvAutorisees, plageRdvAutorisee } from './minutesRdvRepo';
import { refusMinutesRdv, refusPlageRdv } from './minutesRdv';
import { heureFinRdv } from '../gestion/taches';

/**
 * ══ 🔴🔴 LES TÂCHES QUI SONT UN RENDEZ-VOUS DE PRÉAVIS (Arno, 18/11/2026) ═════════════════════════════════════════════════════════════════════
 * Arno : « Module Tâches : applique la même limite (minutes de gestion_config.minutes_rdv) UNIQUEMENT quand la tâche est un rendez-vous de préavis
 * (pré-visite ou état des lieux de sortie), dans la fenêtre de tâche ET dans le décalage, côté écran ET côté serveur. Les autres tâches restent
 * libres. » Une tâche est un rendez-vous de préavis quand une pré-visite (464) ou un état des lieux planifié (385) la porte. Sans ces tables : aucune.
 */

/** Les tâches, parmi `ids`, qui portent une pré-visite ou un état des lieux de sortie. LECTURE ; ne lève jamais (en erreur : aucune). */
export async function tachesRdvPreavis(ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  try {
    const { rows: t } = await query<{ p: boolean; e: boolean }>(
      `SELECT to_regclass('public.gestion_location_previsite') IS NOT NULL AS p, to_regclass('public.gestion_location_edls') IS NOT NULL AS e`);
    const parts = [t[0]?.p ? 'SELECT tache_id FROM gestion_location_previsite WHERE tache_id = ANY($1::bigint[])' : null,
      t[0]?.e ? 'SELECT tache_id FROM gestion_location_edls WHERE tache_id = ANY($1::bigint[])' : null].filter((x): x is string => x !== null);
    if (parts.length === 0) return new Set();
    const { rows } = await query<{ tache_id: string }>(`SELECT DISTINCT tache_id::text FROM (${parts.join(' UNION ALL ')}) x`, [[...ids]]);
    return new Set(rows.map((r) => Number(r.tache_id)));
  } catch {
    return new Set();
  }
}

/**
 * Le refus du serveur pour une heure choisie hors des minutes du réglage — seulement si la tâche est un rendez-vous de préavis ET que l'heure
 * CHANGE (une tâche existante à 09h53 qu'on ne touche pas, ou dont on ne change que la note, n'est jamais refusée). Sinon `null`.
 */
export async function refusMinutesTachePreavis(tacheId: number, heure: string | null, dureeMinutes?: number | null): Promise<string | null> {
  if (heure === null || heure.trim() === '') return null;
  if (!(await tachesRdvPreavis([tacheId])).has(tacheId)) return null;
  const { rows } = await query<{ heure: string | null; duree: number | null }>(
    `SELECT to_char(heure, 'HH24:MI') AS heure, duree_minutes AS duree FROM gestion_tache WHERE id = $1`, [tacheId]);
  // 🔴 Arno (19/11/2026) — + la plage horaire : début de 8h00 à 20h00 ; avec une durée, la fin au plus tard à 21h00 (réglage 499)
  const fin = dureeMinutes ? heureFinRdv(heure.slice(0, 5), dureeMinutes) ?? '' : '';
  if ((rows[0]?.heure ?? null) === heure.slice(0, 5)) {
    // l'heure ne change pas : rien n'est refusé… sauf une DURÉE changée qui ferait finir après la fin au plus tard (« le serveur refuse tout
    // dépassement », Arno 19/11/2026) ; la minute d'origine (09h53) n'est jamais refusée
    const dureeAvant = rows[0]?.duree === null || rows[0]?.duree === undefined ? null : Number(rows[0].duree);
    if (!dureeMinutes || dureeMinutes === dureeAvant) return null;
    return refusPlageRdv({ debut: '', fin }, await plageRdvAutorisee());
  }
  return refusMinutesRdv({ debut: heure, fin: '' }, await minutesRdvAutorisees()) ?? refusPlageRdv({ debut: heure, fin }, await plageRdvAutorisee());
}
