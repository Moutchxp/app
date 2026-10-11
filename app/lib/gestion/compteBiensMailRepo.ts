import { query } from '../db/client';
import { sqlLiensDuBien } from './rattachement';
import { rattachementsDisponibles } from './schema';

/**
 * ══ 🔴🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — « N BIENS RATTACHÉS » SOUS LA DATE DE CHAQUE MAIL. LECTURE SEULE ══
 *
 * DEMANDE D'ARNO (12/10/2026) : « Le nombre est celui des biens rattachés à CE mail tel qu'il s'applique réellement :
 * suivi de fond, one shot éventuel, changements “pour la suite”, hors biens “sortis du suivi”. C'est le même calcul
 * que celui de la fenêtre “Bien(s) rattaché(s) à ce mail”, pour que les deux chiffres concordent toujours. »
 *
 * 🔴 LE MÊME CALCUL QUE LA FENÊTRE : la fenêtre montre `biensDuMail` — les biens dont un lien VIVANT et CONFIRMÉ porte
 * sur ce mail (`sqlLiensDuBien`, sans les propositions : `sorti_le IS NULL`, pièce nulle, cible « lot »), et seulement
 * ceux que l'annuaire des lots connaît (la fiche saute un lot introuvable). Les liens sont la PROJECTION des fenêtres
 * de suivi et des exceptions : fond, one shot et « pour la suite » y sont déjà appliqués.
 *
 * 🔒 AUCUNE ÉCRITURE. UNE requête pour toute une page (500 mails au plus). ⚠️ Silencieuse : sans réponse, aucune
 * mention plutôt qu'un faux « aucun bien rattaché ».
 */
export const PLAFOND_COMPTE_BIENS = 500;

export async function comptesBiensParMail(messageIds: readonly number[]): Promise<Map<number, number>> {
  const ids = [...new Set(messageIds.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, PLAFOND_COMPTE_BIENS);
  const out = new Map<number, number>();
  if (ids.length === 0 || !(await rattachementsDisponibles())) return out;
  const { rows } = await query<{ message_id: string; n: number }>(
    `SELECT r.message_id::text, count(DISTINCT r.cible_cle)::int AS n
       FROM gestion_rattachement r
       JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
      WHERE r.message_id = ANY($1::bigint[]) AND ${sqlLiensDuBien('r')}
      GROUP BY r.message_id`, [ids]);
  for (const id of ids) out.set(id, 0);
  for (const r of rows) out.set(Number(r.message_id), r.n);
  return out;
}
