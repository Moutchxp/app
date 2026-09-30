import { query } from '../db/client';
import { recuperer } from '../stockage';
import { jetonPourSubject } from './driveDelegue';
import { lireContenuDrive } from './pieceDriveLecture';
import { chercherParMessageId, lireOriginalGmailOctets } from './google';
import { copiePiecesDisponible, vidageDisponible } from './schema';
import type { DepsOctetsPiece, PieceALire } from './octetsPiece';

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — LE CÂBLAGE RÉEL DE « LIRE LES OCTETS D'UNE PIÈCE » ═══════════════════════════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, et c'est délibéré — motif F1 du dépôt. Le travailleur de fond de la file
 * d'envoi assemble les pièces d'un message et tourne sous `tsx` : `server-only` lève hors du bundle react-server
 * et le tuerait au chargement, sans rapport apparent avec ce qu'il fait (bug 0d57224). La frontière client est
 * tenue par `clientBoundary.guard.test.ts`, qui vérifie qu'aucun composant client n'atteint ce fichier.
 *
 * 🔒 LE COMPTE DU DRIVE EST CELUI DE LA MAISON, et la délégation est celle qui existe déjà. Rien de nouveau n'est
 * autorisé ici : on emprunte le chemin que la route d'affichage emprunte depuis le lot DRIVE-3.
 */

/** Le compte au nom duquel on lit le Drive. Le même que la route d'affichage : une seule identité, un seul droit. */
const COMPTE_DRIVE = 'gestion@criterimmo.fr';

/**
 * ══ 🔒🔒 CE QUE CETTE REQUÊTE GARANTIT, ET QUI N'EST PAS NÉGOCIABLE ═════════════════════════════════════════════
 *
 * `origine = 'copie'` ET `verifie_le IS NOT NULL` : l'identifiant Drive rendu ne peut désigner QUE un fichier que
 * le programme a lui-même créé dans « 00 Arrivée des mails », et dont la copie a été vérifiée. Un dépôt manuel
 * dans un dossier client — qui peut vivre sous 🔴🔴 « Documents clients scannés » — n'entre JAMAIS ici.
 *
 * La garantie ne tient donc pas à une promesse faite au lecteur : elle tient à l'ORIGINE de l'identifiant, et une
 * épreuve vérifie que ces deux conditions sont bien dans le SQL.
 *
 * ⚠️ DEUX SONDES AVANT DE NOMMER QUOI QUE CE SOIT. `gestion_piece_vidage` (migration 260) et la colonne `origine`
 * de `gestion_piece_drive` (migration 255) peuvent manquer : les nommer sans les avoir sondées ferait échouer
 * TOUT envoi, y compris ceux qui marchaient la minute d'avant. Règle du module depuis le lot 4a.
 */
export async function lirePiecesALire(pieceIds: readonly number[]): Promise<Map<number, PieceALire>> {
  const m = new Map<number, PieceALire>();
  const ids = [...new Set(pieceIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return m;

  const avecVidage = await vidageDisponible();
  const avecCopie = await copiePiecesDisponible();

  const { rows } = await query<{
    id: string; nom_fichier: string; cle_stockage: string | null; taille_octets: string | null;
    vide: boolean; drive_file_id: string | null; md5: string | null; message_id_rfc: string | null;
  }>(
    `SELECT p.id::text, p.nom_fichier, p.cle_stockage, p.taille_octets::text,
            ${avecVidage ? 'EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : 'false'} AS vide,
            ${avecCopie ? 'd.drive_file_id' : 'NULL::text'} AS drive_file_id,
            ${avecCopie ? 'd.md5' : 'NULL::text'} AS md5,
            m.message_id AS message_id_rfc
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
       ${avecCopie
    ? `LEFT JOIN gestion_piece_drive d
                ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL`
    : ''}
      WHERE p.id = ANY($1::bigint[])`, [ids]);

  for (const r of rows) {
    m.set(Number(r.id), {
      pieceId: Number(r.id),
      nomFichier: r.nom_fichier,
      cleStockage: r.cle_stockage,
      stockageVide: r.vide === true,
      driveFileId: r.drive_file_id,
      md5Attendu: r.md5,
      tailleAttendue: r.taille_octets === null ? null : Number(r.taille_octets),
      messageIdRfc: r.message_id_rfc,
    });
  }
  return m;
}

/**
 * LE CÂBLAGE. `jeton` rend celui de gestion@ pour Gmail ; `null` ⇒ le dernier recours n'existe pas, et le motif
 * de refus le dira en toutes lettres plutôt que d'échouer sans raison visible.
 */
export function depsOctetsPiece(jetonGmail?: () => Promise<string | null>): DepsOctetsPiece {
  const deps: DepsOctetsPiece = {
    minio: recuperer,
    drive: async (driveFileId: string) => {
      const jeton = await jetonPourSubject(COMPTE_DRIVE, { fetch });
      if (!jeton.ok) return { ok: false, motif: jeton.motif };
      // 🔒 `lireContenuDrive` n'émet qu'un `GET … ?alt=media`. Il ne sait pas écrire dans le Drive.
      return lireContenuDrive(driveFileId, jeton.jeton, { fetch });
    },
  };

  /**
   * ══ 🔴 LE DERNIER RECOURS : LA PIÈCE, DANS LE MESSAGE D'ORIGINE, TEL QU'IL EST AUJOURD'HUI ═══════════════════
   *
   * On rapatrie l'original complet (`format=raw`) et l'on en extrait la pièce PAR SON NOM.
   *
   * ⚠️ C'EST COÛTEUX, ET C'EST POUR ÇA QUE C'EST LE DERNIER : un message de douze mégaoctets est rapatrié en
   * entier pour en tirer une pièce de soixante-dix kilo-octets. On n'y arrive que si MinIO est vide ET que la
   * copie Drive manque ou ne correspond plus — c'est-à-dire presque jamais.
   *
   * ⚠️ LE NOM SUFFIT À DÉSIGNER LA PIÈCE : un message qui porterait deux pièces homonymes rendrait la première.
   * C'est assumé — le cas est rare, et l'alternative (un index de position) supposerait que l'ordre des parties
   * MIME n'ait pas changé entre la capture et aujourd'hui, ce que rien ne garantit.
   */
  if (jetonGmail !== undefined) {
    deps.gmail = async (messageIdRfc: string, nomFichier: string) => {
      const jeton = await jetonGmail();
      if (jeton === null) return null;
      const trouve = await chercherParMessageId(jeton, messageIdRfc, { fetch });
      if (!trouve.ok || trouve.valeur === null) return null;
      const brut = await lireOriginalGmailOctets(jeton, trouve.valeur.id, { fetch });
      if (!brut.ok) return null;
      // Import DYNAMIQUE : `mailparser` ne doit pas entrer dans le graphe des appelants qui ne s'en servent pas.
      const { simpleParser } = await import('mailparser');
      const analyse = await simpleParser(brut.valeur);
      const voulu = (nomFichier ?? '').trim().toLowerCase();
      for (const piece of analyse.attachments ?? []) {
        if ((piece.filename ?? '').trim().toLowerCase() === voulu) return Buffer.from(piece.content);
      }
      return null;
    };
  }
  return deps;
}
