import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { renommerPiece } from '../../../../../../../lib/gestion/renommagePieceReel';
import { nomUsageDisponible } from '../../../../../../../lib/gestion/schema';
import { eclaterNom, verifierNom } from '../../../../../../../lib/gestion/renommagePiece';
import { lirePieceANommer } from '../../../../../../../lib/gestion/nomUsageRepo';

/**
 * ══ 🔴🔴 /api/admin/gestion/pieces/[id]/nom — LOT NOM-UNIQUE-DES-PIECES ═══════════════════════════════════════
 *
 * Arno : « une pièce jointe ne doit avoir qu'un seul nom, qu'elle soit dans un mail ou dans le Drive ».
 *
 * Cette route change le NOM D'USAGE d'une pièce, puis aligne les copies Drive que le programme a lui-même
 * créées — et seulement celles-là.
 *
 * ═══ 🔒 CE QU'ELLE NE PEUT PAS FAIRE ════════════════════════════════════════════════════════════════════════════
 *
 *   · RIEN HORS DE NOTRE REGISTRE. La liste des identifiants renommables vient de `gestion_piece_drive`, pour
 *     CETTE pièce. Un identifiant envoyé par le navigateur n'existe pas ici : l'écran ne dit QUE le nom voulu.
 *   · RIEN SOUS « Documents clients scannés ». La chaîne de parents est remontée chez Google avant chaque
 *     écriture — pas le nom du dossier enregistré au dépôt, qui date et peut mentir.
 *   · NI SUPPRESSION, NI CORBEILLE, NI PARTAGE : le module d'écriture n'en connaît pas les verbes, et un garde
 *     statique le vérifie sur son source.
 *
 * 🔒 LE NOM EST RE-VALIDÉ ICI. L'écran nettoie déjà (caractères interdits, extension verrouillée), mais c'est le
 * serveur qui ne peut pas être contourné : on recolle l'extension d'ORIGINE, quoi qu'on ait reçu. Un « .pdf »
 * devenu « .exe » par une requête forgée serait un fichier piégé portant notre nom.
 *
 * Runtime Node (driver pg + appels Google).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ etat: 'invalide', message: 'Pièce inconnue.' }, { status: 400, headers: ENTETES });
  }

  /**
   * ⚠️ SANS LA MIGRATION 286, ON REFUSE AVEC LE MOTIF — on ne fait pas semblant. Le stylo garde alors son
   * comportement d'avant ce lot (nommer la copie au moment de la ranger), et l'écran ne propose pas ce geste-ci.
   */
  if (!(await nomUsageDisponible())) {
    return Response.json({
      etat: 'indisponible',
      message: 'Mise à jour de la base à appliquer (migration 286) : le nom d’usage n’est pas encore installé.',
    }, { status: 409, headers: ENTETES });
  }

  try {
    const corps = (await request.json().catch(() => null)) as { nom?: unknown } | null;
    const voulu = typeof corps?.nom === 'string' ? corps.nom : '';

    const piece = await lirePieceANommer(id);
    if (piece === null) {
      return Response.json({ etat: 'invalide', message: 'Pièce inconnue.' }, { status: 404, headers: ENTETES });
    }

    /**
     * 🔒 L'EXTENSION VIENT DU NOM ACTUEL, JAMAIS DE CE QUI EST REÇU. C'est la garantie du lot
     * RENOMMER-AVANT-RANGER, et elle vaut ici à l'identique : on ne change QUE la base du nom.
     */
    const { extension } = eclaterNom(piece.nomAffiche);
    const verdict = verifierNom(eclaterNom(voulu).base === '' ? voulu : eclaterNom(voulu).base, extension);
    if (verdict.refus !== null) {
      return Response.json({ etat: 'refuse', message: verdict.refus }, { status: 422, headers: ENTETES });
    }

    const auteur = await auteurDeLaRequete(request);
    const issue = await renommerPiece({
      pieceId: id, nom: verdict.nom, par: auteur.id, parLibelle: auteur.libelle,
    });
    if (!issue.ok) {
      return Response.json({ etat: 'refuse', message: issue.motif }, { status: 422, headers: ENTETES });
    }
    return Response.json({
      etat: 'ok', nom: issue.nom, faits: issue.faits, refus: issue.refus,
    }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/piece/nom] renommage impossible', { id, e });
    return Response.json({ etat: 'erreur', message: 'Le renommage n’a pas abouti.' },
      { status: 503, headers: ENTETES });
  }
}
