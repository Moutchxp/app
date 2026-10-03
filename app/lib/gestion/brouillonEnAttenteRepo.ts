import { query } from '../db/client';
import { corbeilleBrouillonDisponible, redactionDisponible } from './schema';

/**
 * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — QUELS ÉCHANGES ONT UNE RÉPONSE COMMENCÉE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « un picto “brouillon en attente” sur la ligne du listing de la Réception et des
 * autres dossiers […]. Il disparaît quand le brouillon est envoyé ou supprimé. »
 *
 * 🔴 UNE LECTURE À PART, PAS UNE COLONNE DE PLUS DANS LA GRANDE REQUÊTE DE LA BOÎTE. C'est le patron déjà employé
 * pour les avis de non-remise, les étoiles et les envois en échec : la requête de page est le morceau le plus
 * délicat du module, et y greffer une sous-requête par ligne coûterait cher pour une mention.
 *
 * 🔴 « EN ATTENTE » VEUT DIRE VIVANT, et les trois conditions comptent : ni envoyé, ni abandonné, ni à la
 * corbeille. Un brouillon parti n'attend plus rien — c'est exactement ce qu'Arno demande (« il disparaît quand le
 * brouillon est envoyé ou supprimé »).
 *
 * ⚠️ SANS LA MIGRATION DES BROUILLONS, on rend un ensemble VIDE : aucune ligne ne porte le picto, et la liste est
 * celle d'avant ce lot. Rien ne casse, et rien ne ment.
 *
 * 🔒 LECTURE SEULE, et bornée aux fils de la page.
 */

/**
 * Les échanges, parmi ceux qu'on lui donne, qui portent au moins un brouillon VIVANT.
 *
 * ⚠️ ON NE REND PAS LE BROUILLON, SEULEMENT LE FAIT QU'IL Y EN A UN : la ligne de liste n'a rien à en dire de
 * plus, et faire voyager un corps de message vers une liste de vingt-cinq lignes serait payer très cher un picto.
 */
export async function filsAvecBrouillonEnAttente(filIds: readonly number[]): Promise<Set<number>> {
  const ids = [...new Set(filIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return new Set();
  if (!(await redactionDisponible())) return new Set();
  /* ⚠️ `corbeille_le` N'EXISTE QU'APRÈS LA MIGRATION 276 : sans elle, la colonne n'est NOMMÉE NULLE PART et la
     requête est celle d'avant — un brouillon à la corbeille n'existe simplement pas encore. */
  const avecCorbeille = await corbeilleBrouillonDisponible();
  const { rows } = await query<{ fil_id: string }>(
    `SELECT DISTINCT fil_id::text FROM gestion_brouillon
      WHERE fil_id = ANY($1::bigint[])
        AND envoye_le IS NULL AND abandonne_le IS NULL${avecCorbeille ? ' AND corbeille_le IS NULL' : ''}`,
    [ids]);
  return new Set(rows.map((r) => Number(r.fil_id)));
}
