import { query } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { lireMinutesRdv, MINUTES_RDV_DEFAUT } from './minutesRdv';

/**
 * 🔴 Arno (18/11/2026) — le réglage des minutes autorisées pour les rendez-vous du préavis (`gestion_config.minutes_rdv`, migration 498).
 * Sans la 498, ou en erreur : 00, 15, 30, 45. Ne lève jamais.
 */
export async function minutesRdvAutorisees(): Promise<number[]> {
  try {
    if (!(await colonneExisteMemo('gestion_config', 'minutes_rdv'))) return [...MINUTES_RDV_DEFAUT];
    const { rows } = await query<{ m: number[] | null }>('SELECT minutes_rdv AS m FROM gestion_config WHERE id = 1');
    return lireMinutesRdv(rows[0]?.m);
  } catch {
    return [...MINUTES_RDV_DEFAUT];
  }
}
