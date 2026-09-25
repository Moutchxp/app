import 'server-only';
import { query } from '../db/client';
import { piecesEnvoiDisponibles } from './schema';
import type { PieceBrouillonAffichee } from './piecesEnvoi';

/**
 * MODULE « GESTION » — LOT 5-PJ-ENVOI : LES PIÈCES D'UN BROUILLON, côté base.
 *
 * 🔴 DEUX ORIGINES, UNE SEULE PAR LIGNE (cf. migration 252) : un fichier AJOUTÉ (ses octets sur le stockage objet,
 * sous `cle_stockage`) ou une pièce du message d'origine REPRISE par un transfert (`piece_id`, dont les octets sont
 * déjà chez nous). On ne recopie jamais les octets d'une pièce reprise : ce serait doubler le stockage à chaque
 * transfert, et laisser deux exemplaires diverger.
 *
 * 🔴 RETIRER N'EFFACE PAS : `retire_le` est posé, et tout le reste ignore les pièces retirées.
 *
 * 🔒 AUCUNE CLÉ DE STOCKAGE NE SORT VERS L'ÉCRAN : `listerPieces` rend le nom, le type et la taille, rien d'autre.
 *
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION : sans la migration 252, ces fonctions rendent « rien » et
 * n'émettent AUCUNE requête — nommer une table absente ferait échouer tout l'éditeur.
 */

/** Ce que l'ENVOI a besoin de savoir : de quoi aller chercher les octets. Ne sort jamais vers le navigateur. */
export interface PiecePourEnvoi {
  nom: string;
  typeMime: string | null;
  taille: number;
  /** L'une des deux est renseignée, jamais les deux (contrainte en base). */
  cleStockage: string | null;
  cleStockagePiece: string | null;
}

/** Les pièces AFFICHABLES d'un brouillon — sans aucune clé de stockage. */
export async function listerPieces(brouillonId: number): Promise<PieceBrouillonAffichee[]> {
  if (!await piecesEnvoiDisponibles()) return [];
  const { rows } = await query<{ id: number; nom_fichier: string; type_mime: string | null; taille_octets: string; piece_id: string | null }>(
    `SELECT id::int AS id, nom_fichier, type_mime, taille_octets::text, piece_id::text
       FROM gestion_brouillon_piece
      WHERE brouillon_id = $1 AND retire_le IS NULL
      ORDER BY id`,
    [brouillonId]);
  return rows.map((r) => ({
    id: r.id, nom: r.nom_fichier, typeMime: r.type_mime, taille: Number(r.taille_octets),
    origine: r.piece_id === null ? 'ajoutee' : 'reprise',
  }));
}

/** Les pièces d'un brouillon, AVEC de quoi lire leurs octets. Réservé au serveur, au moment de l'envoi. */
export async function listerPiecesPourEnvoi(brouillonId: number): Promise<PiecePourEnvoi[]> {
  if (!await piecesEnvoiDisponibles()) return [];
  const { rows } = await query<{
    nom_fichier: string; type_mime: string | null; taille_octets: string;
    cle_stockage: string | null; cle_piece: string | null;
  }>(
    `SELECT bp.nom_fichier, bp.type_mime, bp.taille_octets::text, bp.cle_stockage, p.cle_stockage AS cle_piece
       FROM gestion_brouillon_piece bp
       LEFT JOIN gestion_piece p ON p.id = bp.piece_id
      WHERE bp.brouillon_id = $1 AND bp.retire_le IS NULL
      ORDER BY bp.id`,
    [brouillonId]);
  return rows.map((r) => ({
    nom: r.nom_fichier, typeMime: r.type_mime, taille: Number(r.taille_octets),
    cleStockage: r.cle_stockage, cleStockagePiece: r.cle_piece,
  }));
}

/** AJOUTE un fichier déposé sur le stockage objet. Rend la pièce telle que l'écran l'affichera. */
export async function ajouterPieceFichier(
  brouillonId: number, o: { nom: string; typeMime: string | null; taille: number; cleStockage: string },
): Promise<PieceBrouillonAffichee | null> {
  if (!await piecesEnvoiDisponibles()) return null;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO gestion_brouillon_piece (brouillon_id, nom_fichier, type_mime, taille_octets, cle_stockage)
     VALUES ($1, $2, $3, $4, $5) RETURNING id::int AS id`,
    [brouillonId, o.nom, o.typeMime, o.taille, o.cleStockage]);
  return { id: rows[0].id, nom: o.nom, typeMime: o.typeMime, taille: o.taille, origine: 'ajoutee' };
}

/**
 * REPREND les pièces d'un message d'origine — ce que fait « Transférer », comme dans Gmail.
 *
 * ⚠️ IDEMPOTENT : rouvrir le même brouillon ne doit pas doubler ses pièces. La clause `NOT EXISTS` le tient en base,
 * là où une vérification applicative laisserait passer deux ouvertures simultanées.
 */
export async function reprendrePiecesDuMessage(brouillonId: number, messageId: number): Promise<number> {
  if (!await piecesEnvoiDisponibles()) return 0;
  const { rowCount } = await query(
    `INSERT INTO gestion_brouillon_piece (brouillon_id, nom_fichier, type_mime, taille_octets, piece_id)
     SELECT $1, p.nom_fichier, p.type_mime, coalesce(p.taille_octets, 0), p.id
       FROM gestion_piece p
      WHERE p.message_id = $2 AND p.cle_stockage IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_brouillon_piece b
                         WHERE b.brouillon_id = $1 AND b.piece_id = p.id)`,
    [brouillonId, messageId]);
  return rowCount ?? 0;
}

/** RETIRE une pièce — sans effacer sa ligne. Rend `false` si elle n'appartient pas à ce brouillon. */
export async function retirerPiece(brouillonId: number, pieceId: number): Promise<boolean> {
  if (!await piecesEnvoiDisponibles()) return false;
  const { rowCount } = await query(
    `UPDATE gestion_brouillon_piece SET retire_le = now()
      WHERE id = $1 AND brouillon_id = $2 AND retire_le IS NULL`,
    [pieceId, brouillonId]);
  return (rowCount ?? 0) > 0;
}
