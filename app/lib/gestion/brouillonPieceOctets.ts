import { query } from '../db/client';
import { piecesEnvoiDisponibles } from './schema';
import { lireOctetsPiece } from './octetsPiece';
import { depsOctetsPiece, lirePiecesALire } from './octetsPieceCablage';
import { recuperer } from '../stockage';

/**
 * ══ 🔴🔴 LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES — LES OCTETS D'UNE PIÈCE DE BROUILLON ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Arno veut voir ses pièces jointes EN MINIATURE dans l'éditeur, « pour vérifier ce que j'envoie ». Une vignette se
 * fabrique à partir des octets ; ce module dit où les prendre, et c'est tout ce qu'il fait.
 *
 * 🔴 DEUX PROVENANCES, ET ELLES NE SE LISENT PAS PAREIL :
 *   ① UNE PIÈCE REPRISE d'un message (transfert) porte `piece_id`. On passe alors par `lireOctetsPiece`, qui
 *      descend l'escalier connu — stockage objet, copie Drive vérifiée, message d'origine dans Gmail. C'est
 *      indispensable : les 26 522 pièces vidées de MinIO n'ont plus leurs octets qu'au Drive, et une vignette qui
 *      les ignorerait serait vide précisément sur les pièces les plus anciennes.
 *   ② UN FICHIER AJOUTÉ (Mac, Drive, « Récents ») n'a que sa clé de stockage propre. On la lit directement.
 *
 * 🔒 LA PIÈCE EST CHERCHÉE PAR SON BROUILLON, et les deux identifiants sont dans la MÊME requête : un identifiant
 * de pièce forgé ne peut pas aller lire la pièce d'un autre brouillon. C'est la garantie, et elle tient au SQL, pas
 * à un contrôle qu'on pourrait oublier d'écrire ailleurs.
 *
 * 🔒 AUCUNE CLÉ DE STOCKAGE NE SORT D'ICI : on rend des octets, un nom et un type. L'appelant n'apprend rien de
 * l'endroit où ils dorment.
 *
 * ⚠️ PAS DE `server-only` ICI, et c'est le motif F1 du dépôt : ce module tire `pg` et le client S3, mais il doit
 * rester importable par un CLI sous `tsx`. La frontière client est tenue par `clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type IssueOctetsBrouillon =
  | { ok: true; octets: Buffer; nomFichier: string; typeMime: string | null }
  | { ok: false; motif: string };

/**
 * LES OCTETS D'UNE PIÈCE DE BROUILLON, quelle que soit sa provenance.
 *
 * ⚠️ UN REFUS DIT POURQUOI. « Cette pièce n'a plus d'octets » et « cette pièce n'existe pas » ne se corrigent pas
 * de la même façon, et l'écran n'a pas à les confondre.
 */
export async function octetsDUnePieceDeBrouillon(
  brouillonId: number, pieceBrouillonId: number,
): Promise<IssueOctetsBrouillon> {
  if (!(await piecesEnvoiDisponibles())) return { ok: false, motif: 'Les pièces jointes ne sont pas disponibles.' };

  const { rows } = await query<{
    nom_fichier: string; type_mime: string | null; cle_stockage: string | null; piece_id: string | null;
  }>(
    /* 🔒 LES DEUX IDENTIFIANTS DANS LA MÊME CLAUSE : voir l'encadré. */
    `SELECT bp.nom_fichier, bp.type_mime, bp.cle_stockage, bp.piece_id::text
       FROM gestion_brouillon_piece bp
      WHERE bp.brouillon_id = $1 AND bp.id = $2`,
    [brouillonId, pieceBrouillonId]);
  const r = rows[0];
  if (r === undefined) return { ok: false, motif: 'Cette pièce n’appartient pas à ce brouillon.' };

  /* ① LA PIÈCE REPRISE : l'escalier complet, parce que ses octets peuvent n'être plus qu'au Drive. */
  const pieceId = r.piece_id === null ? null : Number(r.piece_id);
  if (pieceId !== null && Number.isSafeInteger(pieceId)) {
    const brute = (await lirePiecesALire([pieceId])).get(pieceId);
    if (brute !== undefined) {
      const lu = await lireOctetsPiece(brute, depsOctetsPiece());
      if (lu.ok) return { ok: true, octets: lu.octets, nomFichier: r.nom_fichier, typeMime: r.type_mime };
      return { ok: false, motif: lu.motif };
    }
  }

  /* ② LE FICHIER AJOUTÉ : sa clé propre, et rien d'autre. */
  if (r.cle_stockage === null) return { ok: false, motif: 'Cette pièce n’a pas d’octets accessibles.' };
  try {
    return {
      ok: true, octets: await recuperer(r.cle_stockage), nomFichier: r.nom_fichier, typeMime: r.type_mime,
    };
  } catch (e) {
    return { ok: false, motif: `Octets illisibles : ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) };
  }
}
