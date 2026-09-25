import 'server-only';
import { lireOriginalGmailOctets, chercherParMessageId } from './google';
import { listerPiecesPourEnvoi } from './brouillonPieceRepo';
import { ancreDuFil } from './lectureGmail';
import { recuperer } from '../stockage';
import { query } from '../db/client';
import type { PieceAEnvoyer } from './envoiGmail';
import type { DemandeEnvoi } from './envoi';

/**
 * MODULE « GESTION » — LOT 5-PJ-ENVOI : CÂBLAGE RÉEL des pièces jointes d'un envoi. Même rôle que `depotDriveReel`
 * pour le Drive : tenir les I/O à un seul endroit, pour que `envoi.ts` reste éprouvable sans réseau ni stockage.
 *
 * DEUX SOURCES, ET UNE SEULE EST DISTANTE :
 *   ① les pièces du BROUILLON — fichiers ajoutés (stockage objet) ou pièces reprises d'un message d'origine
 *      (déjà chez nous). Dans les deux cas, on lit NOS octets ;
 *   ② pour la voie `transferer_piece`, l'ORIGINAL COMPLET, tiré de Gmail au moment de l'envoi (`lireOriginalGmail`).
 *      Il n'est stocké nulle part chez nous : le rapatrier à l'envoi, c'est joindre le message tel qu'il est
 *      AUJOURD'HUI dans la boîte, et ne rien garder d'une copie qui vieillirait.
 *
 * 🔴 UNE LECTURE QUI ÉCHOUE LÈVE. C'est voulu : `envoi.ts` transforme l'exception en refus clair et n'envoie RIEN.
 * Un transfert dont la pièce manque, parti quand même, ne se découvre que chez le correspondant.
 */

/** Le nom du fichier .eml joint. L'objet du message d'origine le rend reconnaissable dans la liste des pièces. */
export function nomEml(objet: string | null | undefined): string {
  const base = (objet ?? '').trim().replace(/[\\/:*?"<>|\r\n]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
  return `${base === '' ? 'message' : base}.eml`;
}

async function objetDuMessage(messageId: number): Promise<string | null> {
  const { rows } = await query<{ objet: string | null }>(
    `SELECT objet FROM gestion_message WHERE id = $1`, [messageId]);
  return rows[0]?.objet ?? null;
}

export interface DepsPiecesEnvoi {
  /** Le jeton de gestion@, pour aller chercher l'original. `null` = connexion Google absente. */
  jeton(): Promise<string | null>;
  /** Les pièces du brouillon, avec de quoi lire leurs octets. */
  duBrouillon(brouillonId: number): Promise<{ nom: string; typeMime: string | null; cleStockage: string | null; cleStockagePiece: string | null }[]>;
  /** Lit les octets d'une clé de stockage. */
  octets(cle: string): Promise<Buffer>;
  /** Le `Message-ID` RFC du message d'origine — l'ancre vers Gmail. */
  ancre(messageId: number): Promise<string | null>;
  /** Retrouve le message dans Gmail, puis rapatrie son original brut. */
  original(jeton: string, messageIdRfc: string): Promise<Buffer | null>;
  /** L'objet du message d'origine, pour nommer le .eml. */
  objet(messageId: number): Promise<string | null>;
}

/**
 * LES PIÈCES D'UN ENVOI, prêtes à être mises dans le message. PUR quant à la décision — tout est injecté.
 */
export async function piecesDeLEnvoi(d: DemandeEnvoi, deps: DepsPiecesEnvoi): Promise<PieceAEnvoyer[]> {
  const pieces: PieceAEnvoyer[] = [];

  // ① Les pièces du brouillon (ajoutées ou reprises). Aucune n'est distante : ce sont NOS octets.
  if (d.brouillonId !== null) {
    for (const p of await deps.duBrouillon(d.brouillonId)) {
      const cle = p.cleStockage ?? p.cleStockagePiece;
      if (cle === null) continue; // une pièce sans octets lisibles n'est pas jointe — et elle ne fait rien échouer
      pieces.push({ nom: p.nom, typeMime: p.typeMime, octets: await deps.octets(cle) });
    }
  }

  // ② L'ORIGINAL COMPLET, pour la seule voie qui le demande.
  if (d.voie === 'transferer_piece' && d.repondAMessageId !== null) {
    const jeton = await deps.jeton();
    if (jeton === null) throw new Error('la connexion Google de gestion@ n’est pas faite');
    const ancre = await deps.ancre(d.repondAMessageId);
    if (ancre === null) throw new Error('le message d’origine n’a pas de Message-ID connu');
    const brut = await deps.original(jeton, ancre);
    if (brut === null) throw new Error('le message d’origine n’a pas été retrouvé dans Gmail');
    pieces.push({
      nom: nomEml(await deps.objet(d.repondAMessageId)),
      typeMime: 'message/rfc822',
      octets: brut,
    });
  }

  return pieces;
}

/** Le câblage RÉEL. `envoi.ts` ne voit que `piecesDeLEnvoi`, qui ne voit que ces dépendances. */
export function depsPiecesEnvoi(jeton: () => Promise<string | null>): DepsPiecesEnvoi {
  return {
    jeton,
    duBrouillon: listerPiecesPourEnvoi,
    octets: recuperer,
    ancre: async (messageId: number) => {
      const { rows } = await query<{ message_id: string | null }>(
        `SELECT message_id FROM gestion_message WHERE id = $1`, [messageId]);
      return rows[0]?.message_id ?? null;
    },
    original: async (jetonAcces: string, messageIdRfc: string) => {
      const trouve = await chercherParMessageId(jetonAcces, messageIdRfc, { fetch });
      if (!trouve.ok || trouve.valeur === null) return null;
      // EN OCTETS : un original n'est pas garanti valide en UTF-8, et le décoder abîmerait le .eml en silence.
      const brut = await lireOriginalGmailOctets(jetonAcces, trouve.valeur.id, { fetch });
      return brut.ok ? brut.valeur : null;
    },
    objet: objetDuMessage,
  };
}

/** Réexporté pour que rien d'autre n'ait à connaître `lectureGmail` : une seule porte vers l'ancre d'un fil. */
export { ancreDuFil };
