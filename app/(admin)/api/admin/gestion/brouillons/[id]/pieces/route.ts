import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import {
  ajouterPieceFichier, listerPieces, retirerPiece,
} from '../../../../../../../lib/gestion/brouillonPieceRepo';
import { TAILLE_MAX_TOTALE, totalJoint, verifierPiece } from '../../../../../../../lib/gestion/piecesEnvoi';
import { piecesEnvoiDisponibles } from '../../../../../../../lib/gestion/schema';
import { deposerPieceBrouillon, recuperer } from '../../../../../../../lib/stockage';
// LOT EDITEUR-PJ — l'historique « Récents ». Il vit dans NOTRE base ; rien n'est écrit dans le Drive pour lui.
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { cleLocaleDuRecent, noterRecent } from '../../../../../../../lib/gestion/recentsPieceRepo';

/**
 * /api/admin/gestion/brouillons/[id]/pieces (lot 5-PJ-ENVOI) — LES PIÈCES JOINTES D'UN BROUILLON.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 AUCUNE CLÉ DE STOCKAGE NE SORT D'ICI. Le navigateur ne voit que le nom, le type et la taille ; les octets ne
 * sont lus que par le serveur, au moment de fabriquer le message. Une URL de stockage rendue à l'écran serait une
 * porte ouverte sur le seau entier.
 *
 * 🔴 LA LIMITE EST VÉRIFIÉE SUR LE TOTAL, PIÈCES DÉJÀ JOINTES COMPRISES. Fichier par fichier, cinq fois 6 Mo
 * passeraient — et c'est Gmail qui refuserait, à l'envoi, quand le message est déjà écrit.
 *
 * 🔴 LE REFUS EST DIT AVEC SON MOTIF (le nom du fichier, l'extension, le total en mégaoctets). « Fichier invalide »
 * oblige à deviner, et on réessaie trois fois avant de comprendre.
 *
 * ⚠️ RETIRER N'EFFACE PAS : `retire_le` est posé, la ligne reste, et l'envoi ignore les pièces retirées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

async function brouillonDeLaRequete(ctx: Contexte): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** La liste des pièces — sans aucune clé de stockage. */
export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brouillonId = await brouillonDeLaRequete(ctx);
  if (brouillonId === null) return json({ erreur: 'Brouillon inconnu.' }, 400);
  if (!await piecesEnvoiDisponibles()) return json({ etat: 'sans_schema', pieces: [] });
  try {
    return json({ etat: 'ok', pieces: await listerPieces(brouillonId), tailleMax: TAILLE_MAX_TOTALE });
  } catch (e) {
    console.error('[gestion/brouillon/pieces] lecture impossible', e);
    return json({ etat: 'erreur', pieces: [] }, 503);
  }
}

/** AJOUTE un fichier. Le corps est un `multipart/form-data` — c'est ce qu'un navigateur envoie sans rien inventer. */
export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brouillonId = await brouillonDeLaRequete(ctx);
  if (brouillonId === null) return json({ erreur: 'Brouillon inconnu.' }, 400);
  if (!await piecesEnvoiDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
  }

  try {
    const formulaire = await request.formData();
    const auteur = await auteurDeLaRequete(request);
    const champ = (n: string): string => {
      const v = formulaire.get(n);
      return typeof v === 'string' ? v.trim() : '';
    };

    /**
     * ══ 🔴 LOT EDITEUR-PJ — REJOINDRE UNE PIÈCE DÉJÀ ENVOYÉE, SANS REPASSER PAR LE MAC ═══════════════════════
     * Le navigateur n'a PAS accès à l'historique du disque — et c'est une protection, pas un manque. On s'appuie
     * donc sur NOS propres pièces : les octets sont déjà chez nous, on les redépose pour ce brouillon.
     *
     * 🔴 LA CLÉ N'EST PAS CRUE SUR PAROLE. `cleLocaleDuRecent` ne la rend que si elle figure dans l'historique DE
     * CE COMPTE : sans cette garde, une clé de stockage envoyée par l'écran ferait de n'importe quel objet du seau
     * une pièce jointe. C'est le point le plus sensible de ce lot, et il tient en cette ligne.
     *
     * ⚠️ ON RECOPIE LES OCTETS, on ne partage pas la clé. Deux brouillons qui pointeraient sur le même objet se
     * partageraient son sort : retirer la pièce de l'un viderait l'autre, plus tard, sans rapport apparent.
     */
    const recent = champ('recent');
    if (recent !== '' && auteur.id !== null) {
      const connu = await cleLocaleDuRecent(auteur.id, recent);
      if (!connu) return json({ etat: 'invalide', message: 'Cette pièce récente n’est plus disponible.' }, 404);
      const deja = totalJoint(await listerPieces(brouillonId));
      const verdict = verifierPiece({ nom: connu.libelle, taille: connu.tailleOctets ?? 0, dejaJoint: deja });
      if (!verdict.ok) return json({ etat: 'refuse', message: verdict.motif }, 422);
      const octets = await recuperer(connu.cle);
      const depot = await deposerPieceBrouillon(octets, connu.detail || null, {
        brouillonId, tailleMaxOctets: TAILLE_MAX_TOTALE,
      });
      if (!depot.depose) return json({ etat: 'refuse', message: depot.motif }, 422);
      const piece = await ajouterPieceFichier(brouillonId, {
        nom: connu.libelle, typeMime: connu.detail, taille: octets.byteLength, cleStockage: depot.cle,
      });
      // La cible remonte en tête de l'historique — mais on garde la clé D'ORIGINE, pas la nouvelle copie : c'est
      //   elle que les prochains « Récents » rejoindront, et elle survit au retrait de cette pièce-ci.
      await noterRecent({
        compteId: auteur.id, sorte: 'locale', cle: connu.cle, libelle: connu.libelle,
        detail: connu.detail, tailleOctets: octets.byteLength,
      });
      return json({ etat: 'ok', piece });
    }

    const fichier = formulaire.get('fichier');
    if (!(fichier instanceof File)) return json({ etat: 'invalide', message: 'Aucun fichier reçu.' }, 400);

    // ① LA RÈGLE, AVANT DE LIRE LES OCTETS : inutile de charger 30 Mo en mémoire pour les refuser ensuite.
    const deja = totalJoint(await listerPieces(brouillonId));
    const verdict = verifierPiece({ nom: fichier.name, taille: fichier.size, dejaJoint: deja });
    if (!verdict.ok) return json({ etat: 'refuse', message: verdict.motif }, 422);

    // ② LE DÉPÔT. Le nom d'origine n'entre pas dans la clé (cf. `construireCleBrouillon`).
    const octets = Buffer.from(await fichier.arrayBuffer());
    const depot = await deposerPieceBrouillon(octets, fichier.type || null, {
      brouillonId, tailleMaxOctets: TAILLE_MAX_TOTALE,
    });
    if (!depot.depose) return json({ etat: 'refuse', message: depot.motif }, 422);

    const piece = await ajouterPieceFichier(brouillonId, {
      nom: fichier.name, typeMime: fichier.type || null, taille: octets.byteLength, cleStockage: depot.cle,
    });

    /**
     * ══ 🔴 ON NOTE CE QUI VIENT D'ÊTRE JOINT — ICI, ET PAS AILLEURS ═══════════════════════════════════════════
     * C'est le seul endroit qui SAIT que la pièce est réellement attachée : ni refusée pour sa taille, ni perdue
     * en route. Noter côté écran donnerait une liste de « Récents » pleine de fichiers qui n'ont jamais été joints.
     *
     * ⚠️ TROIS CIBLES POSSIBLES, ET ELLES NE SE CONFONDENT PAS :
     *   · la pièce LOCALE, par sa clé de stockage — c'est elle qu'on rejoindra sans redemander le fichier au Mac ;
     *   · le FICHIER Drive d'où elle vient, par son identifiant Google ;
     *   · le DOSSIER Drive où on l'a prise — demande d'Arno : « les derniers dossiers dans lesquels il a pris ou
     *     ajouté des pièces ».
     *
     * 🔴 LES IDENTIFIANTS DRIVE VIENNENT DE L'ÉCRAN, ET CELA NE DONNE AUCUN DROIT : ce ne sont que des noms de
     * raccourcis. Les rouvrir repasse par `/drive/fichiers`, qui remonte la chaîne des parents et refuse tout ce
     * qui est sous « Documents clients scannés » — un fichier de ce dossier ne peut donc jamais arriver ici.
     *
     * ⚠️ ÉCRITURE DE CONFORT : `noterRecent` ne jette jamais. Une pièce jointe ne doit pas échouer parce qu'un
     * raccourci n'a pas pu être enregistré.
     */
    if (auteur.id !== null) {
      await noterRecent({
        compteId: auteur.id, sorte: 'locale', cle: depot.cle, libelle: fichier.name,
        detail: fichier.type || null, tailleOctets: octets.byteLength,
      });
      const driveFichier = champ('driveFichier');
      if (driveFichier !== '') {
        await noterRecent({
          compteId: auteur.id, sorte: 'drive_fichier', cle: driveFichier,
          libelle: champ('driveNom') || fichier.name,
          detail: fichier.type || null, tailleOctets: octets.byteLength,
        });
      }
      const driveDossier = champ('driveDossier');
      if (driveDossier !== '') {
        await noterRecent({
          compteId: auteur.id, sorte: 'drive_dossier', cle: driveDossier,
          libelle: champ('driveDossierNom') || 'Dossier', detail: null, tailleOctets: null,
        });
      }
    }
    return json({ etat: 'ok', piece });
  } catch (e) {
    console.error('[gestion/brouillon/pieces] dépôt impossible', e);
    return json({ etat: 'erreur', message: 'La pièce n’a pas pu être jointe.' }, 503);
  }
}

/** RETIRE une pièce (sans effacer sa ligne). L'identifiant vient de la requête : `?piece=…`. */
export async function DELETE(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brouillonId = await brouillonDeLaRequete(ctx);
  if (brouillonId === null) return json({ erreur: 'Brouillon inconnu.' }, 400);

  const pieceId = Number(new URL(request.url).searchParams.get('piece') ?? '');
  if (!Number.isInteger(pieceId) || pieceId <= 0) return json({ erreur: 'Pièce inconnue.' }, 400);
  if (!await piecesEnvoiDisponibles()) return json({ etat: 'sans_schema' }, 409);

  try {
    const fait = await retirerPiece(brouillonId, pieceId);
    // Une pièce déjà retirée, ou d'un autre brouillon : ce n'est pas une panne, et le mot le dit.
    return fait ? json({ etat: 'ok' }) : json({ etat: 'inconnue', message: 'Cette pièce n’est pas (ou plus) jointe.' }, 404);
  } catch (e) {
    console.error('[gestion/brouillon/pieces] retrait impossible', e);
    return json({ etat: 'erreur', message: 'Le retrait n’a pas abouti.' }, 503);
  }
}
