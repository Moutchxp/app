/**
 * LOT 5-FIDÈLE — LA CORRESPONDANCE ENTRE NOS MESSAGES ET CEUX DE GMAIL. IMPUR (base).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE PONT EST LE `Message-ID` RFC, jamais autre chose. L'identifiant Gmail n'existe pas chez nous tant qu'on ne l'a
 * pas demandé ; le `Message-ID`, lui, est écrit dans le message lui-même et ne bouge jamais — ni au déplacement, ni au
 * changement de libellé, ni au réétiquetage. C'est le seul repère stable entre les deux mondes.
 *
 * 🔴 ON NE MÉMORISE JAMAIS UN LIBELLÉ (étoile, non lu, spam). L'état vrai est celui de Gmail, et il change sous nos
 * pieds : quelqu'un de l'équipe étoile depuis son téléphone pendant qu'on regarde l'écran. Le recopier en base, c'est
 * garantir de l'afficher faux un jour — on le relit donc à chaque ouverture.
 *
 * ⚠️ Migration 242 en attente ⇒ on ne mémorise rien, et tout continue de marcher : la correspondance se refait par
 * recherche à chaque geste. Une fonctionnalité ne dépend jamais d'une migration dans ce dépôt.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { identifiantsGmailDisponibles } from './schema';

export interface AncrageGmail {
  /** Notre `Message-ID` RFC — le pont. Toujours présent : la colonne est `NOT NULL` depuis la migration 228. */
  messageIdRfc: string;
  /** L'identifiant Gmail du message, si la correspondance a déjà été faite ET mémorisée. */
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  /** L'expéditeur, pour « Bloquer … » et « Filtrer les messages similaires ». */
  de: string;
  deNom: string | null;
}

/** Ce qu'on sait d'un message avant d'aller voir Gmail. `null` = ce message n'existe pas chez nous. */
export async function lireAncrage(messageId: number): Promise<AncrageGmail | null> {
  const avecColonnes = await identifiantsGmailDisponibles();
  const colonnes = avecColonnes
    ? 'gmail_message_id, gmail_thread_id'
    : 'NULL::text AS gmail_message_id, NULL::text AS gmail_thread_id';
  const { rows } = await query<{
    message_id: string; gmail_message_id: string | null; gmail_thread_id: string | null;
    de_adresse: string; de_nom: string | null;
  }>(
    `SELECT message_id, ${colonnes}, de_adresse, de_nom FROM gestion_message WHERE id = $1`, [messageId]);
  const r = rows[0];
  if (!r) return null;
  return {
    messageIdRfc: r.message_id,
    gmailMessageId: r.gmail_message_id,
    gmailThreadId: r.gmail_thread_id,
    de: r.de_adresse,
    deNom: (r.de_nom ?? '').trim() || null,
  };
}

/**
 * MÉMORISE la correspondance, quand la migration le permet. Sans elle, c'est un geste vide — et c'est très bien :
 * la fonctionnalité marche sans, simplement au prix d'une recherche de plus au geste suivant.
 *
 * ⚠️ Une écriture qui échoue N'EST PAS une erreur remontée à l'utilisateur : on vient de réussir à retrouver le
 * message dans Gmail, et c'est ce qui compte. Ne pas avoir pu l'écrire coûte une requête, pas une fonctionnalité.
 */
export async function memoriserAncrage(
  messageId: number, gmail: { id: string; threadId: string },
): Promise<void> {
  if (!await identifiantsGmailDisponibles()) return;
  try {
    await query(
      `UPDATE gestion_message SET gmail_message_id = $2, gmail_thread_id = $3 WHERE id = $1`,
      [messageId, gmail.id, gmail.threadId]);
  } catch {
    // Voir l'encadré : on ne casse pas un geste réussi pour une mémorisation manquée.
  }
}
