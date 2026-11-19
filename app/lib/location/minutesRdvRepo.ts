import { query } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { DUREES_RDV_DEFAUT, lireDureesRdv, lireMinutesRdv, lirePlageRdv, MINUTES_RDV_DEFAUT, PLAGE_RDV_DEFAUT, type DureesRdv, type PlageRdv } from './minutesRdv';

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

/**
 * 🔴 Arno (19/11/2026) — la plage horaire des rendez-vous du préavis (`gestion_config.rdv_debut_au_plus_tot`, `rdv_debut_au_plus_tard`,
 * `rdv_fin_au_plus_tard`, migration 499). Sans la 499, ou en erreur : 8h00, 20h00, 21h00. Ne lève jamais.
 */
export async function plageRdvAutorisee(): Promise<PlageRdv> {
  try {
    if (!(await colonneExisteMemo('gestion_config', 'rdv_fin_au_plus_tard'))) return { ...PLAGE_RDV_DEFAUT };
    const { rows } = await query<{ a: string | null; b: string | null; c: string | null }>(
      `SELECT to_char(rdv_debut_au_plus_tot, 'HH24:MI') AS a, to_char(rdv_debut_au_plus_tard, 'HH24:MI') AS b, to_char(rdv_fin_au_plus_tard, 'HH24:MI') AS c
         FROM gestion_config WHERE id = 1`);
    const r = rows[0];
    return lirePlageRdv(r === undefined ? null : { debutMin: r.a, debutMax: r.b, finMax: r.c });
  } catch {
    return { ...PLAGE_RDV_DEFAUT };
  }
}


/**
 * 🔴 Arno (19/11/2026) — les durées proposées d'un rendez-vous du préavis et celle choisie d'office (`gestion_config.durees_rdv`,
 * `duree_rdv_defaut`, migration 501). Sans la 501, ou en erreur : 15, 30, 45 min, 1 h ; 30 min d'office. Ne lève jamais.
 */
export async function dureesRdvReglees(): Promise<DureesRdv> {
  try {
    if (!(await colonneExisteMemo('gestion_config', 'duree_rdv_defaut'))) return lireDureesRdv(DUREES_RDV_DEFAUT);
    const { rows } = await query<{ d: number[] | null; x: number | null }>('SELECT durees_rdv AS d, duree_rdv_defaut AS x FROM gestion_config WHERE id = 1');
    return lireDureesRdv({ durees: rows[0]?.d, defaut: rows[0]?.x });
  } catch {
    return lireDureesRdv(DUREES_RDV_DEFAUT);
  }
}
