/**
 * MODULE « GESTION » — LOT BOITE-INTERNE-CORBEILLE : LES MAILS D'UN ÉCHANGE. IMPUR (base), LECTURE SEULE.
 *
 * 🔴 POURQUOI UN FICHIER POUR UNE REQUÊTE. Le geste « Supprimer » du menu « ⋯ » porte sur une LIGNE, c'est-à-dire
 * sur un échange ; la corbeille de Gmail, elle, porte sur des MESSAGES. Il faut donc traduire l'un en l'autre, et
 * cette traduction est exactement ce que fait Gmail quand on supprime une conversation depuis sa liste.
 *
 * Elle ne vit pas dans `corbeilleRepo` parce que celui-ci ne parle QUE de l'état de la corbeille : y mettre une
 * lecture d'échange en ferait un module qui ne sait plus de quoi il parle.
 */
import { query } from '../db/client';
import { corbeilleGmailDisponible } from './schema';

/**
 * LES MAILS D'UN ÉCHANGE, du plus ancien au plus récent.
 *
 * ⚠️ TOUS, Y COMPRIS CEUX QUE LES RÈGLES ÉCARTENT (`exclu_le`) : supprimer une conversation supprime la
 * conversation. En laisser trois derrière parce qu'un robot les a écrits donnerait un échange à moitié effacé,
 * qui resterait visible sous « Courrier automatique » sans que personne comprenne pourquoi.
 */
export async function messagesDuFil(
  filIds: readonly number[], seulementCorbeille = false,
): Promise<number[]> {
  if (filIds.length === 0) return [];
  /**
   * 🔴 `seulementCorbeille` N'EST PAS UN CONFORT, C'EST UN GARDE-FOU.
   *
   * Depuis la LISTE « Corbeille », « Réintégrer » et « Supprimer définitivement » portent sur des lignes qui
   * représentent un échange — mais cet échange peut parfaitement être encore VIVANT, avec trois mails en
   * Réception et un seul à la corbeille. Agir sur tous ses messages réintégrerait, ou pire supprimerait, des
   * mails que personne n'a jamais jetés. Le drapeau borne le geste à ce que la corbeille contient réellement.
   *
   * Depuis le menu « ⋯ » d'une ligne ordinaire, à l'inverse, « Supprimer » porte sur TOUT l'échange — y compris
   * ce que les règles écartent (`exclu_le`) : supprimer une conversation supprime la conversation, et en laisser
   * trois derrière parce qu'un robot les a écrits donnerait un échange à moitié effacé, qui resterait visible
   * sous « Courrier automatique » sans que personne comprenne pourquoi.
   *
   * ⚠️ SANS LA MIGRATION 275, LA COLONNE N'EST PAS NOMMÉE : le drapeau ne peut pas être demandé (la Corbeille
   * n'existe pas à l'écran), et la requête est celle d'avant.
   */
  const filtre = seulementCorbeille && await corbeilleGmailDisponible() ? 'AND corbeille_le IS NOT NULL' : '';
  const { rows } = await query<{ id: string }>(
    `SELECT id::text FROM gestion_message
      WHERE fil_id = ANY($1::bigint[]) ${filtre} ORDER BY recu_le, id`, [[...filIds]]);
  return rows.map((r) => Number(r.id));
}
