/**
 * ⚠️ CE FICHIER EST LE MÊME QUE `brouillonPieceRepo.ts`, SANS `import 'server-only'` — motif F1 du dépôt.
 *
 * Le travailleur de fond de la file d’envoi lit les pièces d’un brouillon, et il tourne aussi sous `tsx`.
 *
 * 🔴 `server-only` LÈVE HORS DU BUNDLE react-server. Une CLI lancée par `tsx` (ici : la relève continue, démarrée
 * par launchd) qui atteindrait le fichier d'origine MOURRAIT AU CHARGEMENT, sans rapport apparent avec ce qu'elle
 * fait. C'est le bug 0d57224, et le garde `app/lib/garde/serverOnly.guard.test.ts` l'a attrapé pendant ce lot.
 *
 * ⚠️ NE PAS RETIRER `import 'server-only'` DU FICHIER D'ORIGINE pour « simplifier » : il protège les chemins où il
 * doit protéger. On sépare, on ne désarme pas.
 */
import { query } from '../db/client';
/**
 * 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — UN TRANSFERT OU UNE RÉPONSE PART SOUS LE NOM D'USAGE (demande d'Arno).
 *
 * La reprise COPIE le nom dans `gestion_brouillon_piece` : c'est donc ici, et une seule fois, que le nom d'usage
 * entre dans ce qui partira. La copier plus tard (à l'assemblage) obligerait à la relire pour chaque envoi, et
 * ferait diverger ce qu'on voit dans le brouillon de ce qui part vraiment.
 */
import { sqlNomAffiche } from './nomUsageSql';
/**
 * 🔴🔴 LOT TRANSFERT-AVEC-PIECES — « PAS LES IMAGES INTÉGRÉES : MÊME CRITÈRE QUE LE COMPTEUR » (Arno). C'est
 * `sqlEstVraiePiece` qui le dit, et c'est le MÊME fragment que les cinq compteurs et que le trombone. En écrire
 * un second ferait partir dans un transfert ce que la ligne ne compte pas — exactement l'incohérence qu'on évite.
 */
import { sqlEstVraiePiece } from './lisibilite';
import { pieceIntegreeDisponible } from './schema';
import { fileEnvoiDisponible, piecesEnvoiDisponibles } from './schema';
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
  /**
   * 🔴 LOT PJ-APRES-VIDAGE — l'identifiant de la PIÈCE REÇUE d'origine, quand c'en est une. C'est par lui qu'on
   * retrouve sa copie Drive si MinIO a été vidé. `null` = un fichier ajouté à la main au brouillon : il n'a ni
   * copie Drive ni message d'origine, et sa seule source est le stockage objet.
   */
  pieceId: number | null;
}

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — LES PIÈCES AFFICHABLES, COCHÉES **ET** DÉCOCHÉES ══════════════════════════
 *
 * AVANT, cette lecture écartait les lignes `retire_le IS NOT NULL` : une pièce décochée disparaissait de l'écran,
 * et l'on ne pouvait plus la recocher. Elles sont toutes rendues ; c'est `cochee` qui dit laquelle part.
 *
 * 🔒 AUCUNE CLÉ DE STOCKAGE NE SORT D'ICI, et ce lot n'en fait pas sortir : `disponible` est un BOOLÉEN calculé
 * en SQL, jamais le chemin de l'objet.
 *
 * ⚠️ `disponible` EST VRAI POUR UN FICHIER AJOUTÉ : ses octets sont sur le stockage, posés par le dépôt lui-même.
 * Il n'est faux que pour une pièce REPRISE dont le message d'origine n'a plus d'octets chez nous.
 */
export async function listerPieces(brouillonId: number): Promise<PieceBrouillonAffichee[]> {
  if (!await piecesEnvoiDisponibles()) return [];
  const { rows } = await query<{
    id: number; nom_fichier: string; type_mime: string | null; taille_octets: string;
    piece_id: string | null; cochee: boolean; disponible: boolean;
  }>(
    `SELECT bp.id::int AS id, bp.nom_fichier, bp.type_mime, bp.taille_octets::text, bp.piece_id::text,
            (bp.retire_le IS NULL) AS cochee,
            (bp.piece_id IS NULL OR p.cle_stockage IS NOT NULL) AS disponible
       FROM gestion_brouillon_piece bp
       LEFT JOIN gestion_piece p ON p.id = bp.piece_id
      WHERE bp.brouillon_id = $1
      ORDER BY bp.id`,
    [brouillonId]);
  return rows.map((r) => ({
    id: r.id, nom: r.nom_fichier, typeMime: r.type_mime, taille: Number(r.taille_octets),
    origine: r.piece_id === null ? 'ajoutee' : 'reprise',
    cochee: r.cochee === true, disponible: r.disponible === true,
    /* 🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — l'identifiant de la pièce REÇUE, pour l'œil. Il était déjà
       lu par cette requête ; il ne sortait simplement pas. Voir l'encadré de `PieceBrouillonAffichee.pieceId`. */
    pieceId: r.piece_id === null ? null : Number(r.piece_id),
  }));
}

/** Les pièces d'un brouillon, AVEC de quoi lire leurs octets. Réservé au serveur, au moment de l'envoi. */
export async function listerPiecesPourEnvoi(brouillonId: number): Promise<PiecePourEnvoi[]> {
  if (!await piecesEnvoiDisponibles()) return [];
  const { rows } = await query<{
    nom_fichier: string; type_mime: string | null; taille_octets: string;
    cle_stockage: string | null; cle_piece: string | null; piece_id: string | null;
  }>(
    /**
     * 🔴 LOT PJ-APRES-VIDAGE — `bp.piece_id` EST RENDU, et c'est ce qui manquait. Sans lui, l'envoi ne pouvait
     * pas retrouver la COPIE DRIVE d'une pièce vidée de MinIO : il ne tenait qu'une clé de stockage, et cette
     * clé désignait un objet effacé. C'est la cause du « The specified key does not exist » du fil 3494.
     */
    `SELECT bp.nom_fichier, bp.type_mime, bp.taille_octets::text, bp.cle_stockage,
            p.cle_stockage AS cle_piece, bp.piece_id::text AS piece_id
       FROM gestion_brouillon_piece bp
       LEFT JOIN gestion_piece p ON p.id = bp.piece_id
      WHERE bp.brouillon_id = $1 AND bp.retire_le IS NULL
      ORDER BY bp.id`,
    [brouillonId]);
  return rows.map((r) => ({
    nom: r.nom_fichier, typeMime: r.type_mime, taille: Number(r.taille_octets),
    cleStockage: r.cle_stockage, cleStockagePiece: r.cle_piece,
    pieceId: r.piece_id === null ? null : Number(r.piece_id),
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
 * ══ 🔴 LOT ENVOI-ARRIERE-PLAN — UNE PIÈCE DU DRIVE, INSCRITE AVANT D'AVOIR SES OCTETS ═══════════════════════════
 *
 * C'est tout l'objet du lot : la ligne existe TOUT DE SUITE, avec le nom et la taille lus dans les métadonnées
 * Drive (un appel court), et les octets suivent en tâche de fond. L'écran affiche la pièce dans la seconde, et le
 * « Joindre » suivant reste cliquable.
 *
 * 🔴 `source_compte` EST UNE COLONNE DE SÉCURITÉ. Le Drive se lit par DÉLÉGATION au nom de la personne : en tâche
 * de fond il n'y a plus de session, et lire avec le jeton de `gestion@` irait chercher des fichiers que le
 * demandeur n'a peut-être pas le droit de voir. On garde donc son adresse pour redemander un jeton POUR ELLE.
 *
 * ⚠️ SANS LA MIGRATION 271, cette fonction rend `null` : l'appelant retombe alors sur le dépôt en un seul temps,
 * c'est-à-dire le comportement d'avant ce lot.
 */
export async function inscrirePieceDrive(
  brouillonId: number,
  o: { nom: string; typeMime: string | null; taille: number; driveId: string; compte: string },
): Promise<PieceBrouillonAffichee | null> {
  if (!await piecesEnvoiDisponibles()) return null;
  if (!await fileEnvoiDisponible()) return null;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO gestion_brouillon_piece
       (brouillon_id, nom_fichier, type_mime, taille_octets, etat, source_drive_id, source_compte)
     VALUES ($1, $2, $3, $4, 'attente', $5, $6) RETURNING id::int AS id`,
    [brouillonId, o.nom, o.typeMime, o.taille, o.driveId, o.compte]);
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
  /**
   * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — DEUX CHANGEMENTS, ET CHACUN EST UNE RÈGLE D'ARNO ════════════════════
   *
   * ① LES IMAGES INTÉGRÉES NE SUIVENT PAS. « Pas les images intégrées (signatures, logos) : même critère que le
   *    compteur. » C'est `sqlEstVraiePiece` — le MÊME fragment que les cinq compteurs et le trombone, pas une
   *    seconde écriture. Sans lui, un transfert emportait les trois pictos de notre propre signature.
   *
   * ② UNE PIÈCE SANS OCTETS EST QUAND MÊME REPRISE, mais DÉCOCHÉE. « Si une pièce est introuvable : ligne grisée
   *    “Pièce indisponible”, non cochée, avec un message clair. Jamais un envoi qui échoue en silence. » Avant,
   *    la condition `cle_stockage IS NOT NULL` la faisait disparaître : on ne savait même pas qu'elle existait.
   *    `retire_le` posé à la naissance = case décochée, donc rien ne part — et la ligne se voit.
   *
   * ⚠️ IDEMPOTENT, et il le reste : `NOT EXISTS` regarde la ligne, pas son `retire_le`. Une pièce décochée à la
   * main n'est donc pas ressuscitée par l'enregistrement suivant — c'est la règle d'avant ce lot, intacte.
   */
  const avecIntegree = await pieceIntegreeDisponible();
  const { rowCount } = await query(
    `INSERT INTO gestion_brouillon_piece
       (brouillon_id, nom_fichier, type_mime, taille_octets, piece_id, retire_le)
     SELECT $1, ${await sqlNomAffiche('p')}, p.type_mime, coalesce(p.taille_octets, 0), p.id,
            CASE WHEN p.cle_stockage IS NULL THEN now() END
       FROM gestion_piece p
      WHERE p.message_id = $2
        AND ${sqlEstVraiePiece('p', avecIntegree)}
        AND NOT EXISTS (SELECT 1 FROM gestion_brouillon_piece b
                         WHERE b.brouillon_id = $1 AND b.piece_id = p.id)`,
    [brouillonId, messageId]);
  return rowCount ?? 0;
}

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — COCHER OU DÉCOCHER UNE PIÈCE ═══════════════════════════════════════════════
 *
 * Décocher pose `retire_le`, recocher le remet à `NULL`. C'est le MÊME champ que « retirer », et c'est voulu :
 * l'envoi ne lit que les lignes non retirées, et il n'avait donc rien à apprendre de ce lot.
 *
 * 🔒 ON NE RECOCHE JAMAIS UNE PIÈCE SANS OCTETS. La condition est en SQL, pas à l'écran : une requête forgée ne
 * doit pas pouvoir faire partir un envoi voué à l'échec. C'est la demande d'Arno — « jamais un envoi qui échoue
 * en silence » — tenue à l'endroit qui ne se contourne pas.
 */
export async function cocherPiece(
  brouillonId: number, pieceId: number, cochee: boolean,
): Promise<boolean> {
  if (!await piecesEnvoiDisponibles()) return false;
  const { rowCount } = await query(
    cochee
      ? `UPDATE gestion_brouillon_piece bp
            SET retire_le = NULL
           FROM (SELECT 1) AS _
          WHERE bp.id = $1 AND bp.brouillon_id = $2 AND bp.retire_le IS NOT NULL
            AND (bp.piece_id IS NULL
                 OR EXISTS (SELECT 1 FROM gestion_piece p
                             WHERE p.id = bp.piece_id AND p.cle_stockage IS NOT NULL))`
      : `UPDATE gestion_brouillon_piece SET retire_le = now()
          WHERE id = $1 AND brouillon_id = $2 AND retire_le IS NULL`,
    [pieceId, brouillonId]);
  return (rowCount ?? 0) > 0;
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
