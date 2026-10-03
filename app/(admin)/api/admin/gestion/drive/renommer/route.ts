import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { renommerPiece } from '../../../../../../lib/gestion/renommagePieceReel';
import { nomUsageDisponible } from '../../../../../../lib/gestion/schema';
import { eclaterNom, verifierNom } from '../../../../../../lib/gestion/renommagePiece';
import { lirePieceANommer, pieceDuFichierDrive } from '../../../../../../lib/gestion/nomUsageRepo';
import { etatAccesDrive } from '../../../../../../lib/gestion/jetonCollaborateur';

/**
 * ══ 🔴🔴 /api/admin/gestion/drive/renommer — LOT ETOILE-SIGNATURES-PIECES, POINT 0 ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026), qui tranche la question laissée ouverte au lot RENOMMAGE-UN-SEUL-NOM :
 * « UN DOCUMENT = UN SEUL NOM gagne. Le crayon ✎ d'une vignette dupliquée renomme AUSSI le fichier source et
 * toutes les copies connues (même mécanisme files.update, jamais de copie). »
 *
 * Jusqu'ici le crayon d'une vignette ne retenait, DANS LE NAVIGATEUR, que le nom sous lequel la future copie
 * naîtrait. Le fichier source gardait le sien, et le nom choisi se perdait si l'on ne rangeait pas. C'est
 * exactement ce qu'Arno a vécu le 03/10 : « reco renomage » n'existait nulle part.
 *
 * ═══ 🔴 POURQUOI UNE ROUTE À PART, ET NON `/pieces/[id]/nom` ════════════════════════════════════════════════════
 *
 * Une vignette est désignée par un IDENTIFIANT DRIVE, pas par un identifiant de pièce. L'écran ne connaît que le
 * premier, et il ne doit pas avoir à deviner le second — la correspondance vit dans NOTRE registre
 * (`gestion_piece_drive`), donc côté serveur. Cette route fait ce pont, et rien d'autre : elle retrouve la pièce,
 * puis appelle EXACTEMENT le même `renommerPiece` que la visionneuse du mail.
 *
 * ═══ 🔒 CE QU'ELLE NE PEUT PAS FAIRE ════════════════════════════════════════════════════════════════════════════
 *
 *   · RIEN HORS DE NOTRE REGISTRE. Un identifiant Drive absent de `gestion_piece_drive` n'est pas à nous : la
 *     route refuse en le DISANT, plutôt que de renommer le fichier d'un correspondant. C'est le cas, par exemple,
 *     des fichiers « _MESURE … » du Drive « Test », posés par un script et jamais rangés par l'application.
 *   · RIEN SOUS « Documents clients scannés » : la chaîne de parents est remontée chez Google avant chaque
 *     écriture, par `renommerPiece`. Ce contrôle-là n'est pas réécrit ici, il est HÉRITÉ.
 *   · NI COPIE, NI ENVOI NEUF : le seul écrivain reste `files.update(name)`, dont le corps ne porte que `name`.
 *
 * 🔒 L'EXTENSION D'ORIGINE EST RECOLLÉE ICI AUSSI, et pour la même raison qu'au lot précédent : l'écran se
 * contourne, pas le serveur. Un « .pdf » devenu « .exe » par une requête forgée serait un fichier piégé portant
 * le nom d'un document de l'agence.
 *
 * Runtime Node (driver pg + appels Google).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function PATCH(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  if (!(await nomUsageDisponible())) {
    return Response.json({
      etat: 'indisponible',
      message: 'Mise à jour de la base à appliquer (migration 286) : le nom d’usage n’est pas encore installé.',
    }, { status: 409, headers: ENTETES });
  }

  try {
    const corps = (await request.json().catch(() => null)) as { driveFileId?: unknown; nom?: unknown } | null;
    const driveFileId = typeof corps?.driveFileId === 'string' ? corps.driveFileId.trim() : '';
    const voulu = typeof corps?.nom === 'string' ? corps.nom : '';
    if (driveFileId === '') {
      return Response.json({ etat: 'invalide', message: 'Aucun fichier désigné.' },
        { status: 400, headers: ENTETES });
    }

    /* 🔒 ① LE REGISTRE, ET LUI SEUL. Un identifiant qui n'y est pas n'est pas un fichier que nous avons créé. */
    const pieceId = await pieceDuFichierDrive(driveFileId);
    if (pieceId === null) {
      return Response.json({
        etat: 'refuse',
        message: 'Ce fichier n’a pas été créé par l’application : elle ne le renomme pas. '
          + 'Renommez-le dans Google Drive.',
      }, { status: 409, headers: ENTETES });
    }

    const piece = await lirePieceANommer(pieceId);
    if (piece === null) {
      return Response.json({ etat: 'invalide', message: 'Pièce inconnue.' }, { status: 404, headers: ENTETES });
    }

    /* 🔒 L'EXTENSION VIENT DU NOM ACTUEL — et, à défaut, du TYPE de la pièce (lot RENOMMAGE-UN-SEUL-NOM). */
    const { extension } = eclaterNom(piece.nomAffiche, piece.typeMime);
    const verdict = verifierNom(voulu, extension);
    if (verdict.refus !== null) {
      return Response.json({ etat: 'refuse', message: verdict.refus }, { status: 422, headers: ENTETES });
    }

    const auteur = await auteurDeLaRequete(request);
    const acces = await etatAccesDrive(request);
    const issue = await renommerPiece({
      pieceId, nom: verdict.nom, par: auteur.id, parLibelle: auteur.libelle,
      sujet: acces.etat === 'ok' ? acces.adresse : null,
      // 🔴 L'ORIGINE DIT LE GESTE : ce renommage-ci vient de la fenêtre du Drive, et le journal doit le relire.
      origine: 'visionneuse_drive',
    });
    if (!issue.ok) {
      return Response.json({ etat: 'refuse', message: issue.motif }, { status: 422, headers: ENTETES });
    }
    return Response.json({
      etat: 'ok', nom: issue.nom, faits: issue.faits, refus: issue.refus, pieceId,
    }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/drive/renommer] renommage impossible', e);
    return Response.json({ etat: 'erreur', message: 'Le renommage n’a pas abouti.' },
      { status: 503, headers: ENTETES });
  }
}
