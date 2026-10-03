import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import {
  ajouterPieceFichier, cocherPiece, inscrirePieceDrive, listerPieces, retirerPiece,
} from '../../../../../../../lib/gestion/brouillonPieceRepo';
// LOT ENVOI-ARRIERE-PLAN — la pièce du Drive s'inscrit tout de suite, ses octets suivent en tâche de fond.
import { lireMetadonnees } from '../../../../../../../lib/gestion/drive';
import { jetonPourRequete } from '../../../../../../../lib/gestion/jetonCollaborateur';
import { verdictJoindre } from '../../../../../../../lib/gestion/driveVerdict';
import { placePourLaPiece } from '../../../../../../../lib/gestion/fileEnvoi';
import { lancerPasseEnFond } from '../../../../../../../lib/gestion/travailleurEnvoiReel';
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

    /**
     * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — UNE PIÈCE DU DRIVE, SANS ATTENDRE SES OCTETS ═══════════════════════════
     *
     * Le navigateur n'envoie plus que l'identifiant Drive. On lit les MÉTADONNÉES (un appel court), on inscrit la
     * ligne, et l'on rend la main : l'écran affiche la pièce dans la seconde et le « Joindre » suivant reste
     * cliquable. Les octets sont tirés derrière, par le travailleur de fond.
     *
     * 🔴🔴 LE VERDICT « JOINDRE » EST PRONONCÉ ICI, AVANT D'INSCRIRE QUOI QUE CE SOIT. C'est la même barrière
     * qu'avant — la chaîne des parents remontée, et un refus pour tout ce qui est sous « Documents clients
     * scannés ». Elle DOIT rester ici : après ce point, plus personne ne la repose, et une pièce inscrite serait
     * récupérée par le travailleur sans autre contrôle.
     *
     * 🔴 LE PLAFOND DE 25 Mo EST TRANCHÉ ICI AUSSI, sur la taille annoncée par le Drive — pendant que la personne
     * est là pour l'entendre. Différer ce refus le transformerait en alerte, une minute plus tard, pour quelque
     * chose qu'on savait déjà.
     */
    const driveId = champ('drive');
    if (driveId !== '') {
      const jeton = await jetonPourRequete(request);
      if (jeton.etat !== 'ok') return json({ etat: 'refuse', message: jeton.motif }, 409);

      const v = await verdictJoindre(jeton.jeton, driveId);
      if (!v.joindre) {
        return json({ etat: 'refuse', message: v.motif ?? 'Le contenu de ce fichier ne peut pas être lu.' }, 403);
      }

      const meta = await lireMetadonnees(jeton.jeton, driveId, { fetch });
      if (!meta.ok) return json({ etat: 'refuse', message: meta.motif }, 409);
      if (meta.valeur.typeMime.startsWith('application/vnd.google-apps')) {
        return json({
          etat: 'refuse',
          message: 'C’est un document Google (Docs, Sheets…) : il n’a pas de fichier à joindre. '
            + 'Insérez plutôt son lien.',
        }, 409);
      }

      const dejaJoint = totalJoint(await listerPieces(brouillonId));
      const place = placePourLaPiece({
        dejaJoint, taillePiece: meta.valeur.tailleOctets ?? -1, plafond: TAILLE_MAX_TOTALE,
      });
      if (!place.ok) return json({ etat: 'refuse', message: place.motif }, 422);

      const piece = await inscrirePieceDrive(brouillonId, {
        nom: meta.valeur.nom, typeMime: meta.valeur.typeMime || null,
        taille: meta.valeur.tailleOctets ?? 0, driveId,
        // 🔴 L'ADRESSE DU DEMANDEUR : c'est en SON nom que les octets seront lus, jamais au nom de gestion@.
        compte: jeton.compteGoogle,
      });
      if (piece === null) {
        return json({
          etat: 'sans_schema',
          message: 'Bientôt disponible — une mise à jour de la base est nécessaire.',
        }, 409);
      }
      if (auteur.id !== null) {
        await noterRecent({
          compteId: auteur.id, sorte: 'drive_fichier', cle: driveId, libelle: meta.valeur.nom,
          detail: meta.valeur.typeMime || null, tailleOctets: meta.valeur.tailleOctets ?? null,
        });
        const dossier = champ('driveDossier');
        if (dossier !== '') {
          await noterRecent({
            compteId: auteur.id, sorte: 'drive_dossier', cle: dossier,
            libelle: champ('driveDossierNom') || 'Dossier', detail: null, tailleOctets: null,
          });
        }
      }
      // Les octets, tout de suite et en tâche de fond : sans attendre la relève, et sans faire attendre l'écran.
      lancerPasseEnFond();
      return json({ etat: 'ok', piece, enFond: true });
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

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — COCHER OU DÉCOCHER UNE PIÈCE ═══════════════════════════════════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « chaque pièce reprise a une case : on la décoche pour ne pas l'envoyer, on la
 * recoche. Seules les pièces cochées partent. »
 *
 * 🔴 PAS UN SECOND « RETIRER », ET C'EST LA DIFFÉRENCE QUI COMPTE. `DELETE` retire une pièce qu'on ne veut plus
 * voir ; ce verbe-ci change une CASE, dans les deux sens, et la ligne reste à l'écran. Les deux écrivent le même
 * champ (`retire_le`), parce que c'est lui que l'envoi lit — mais ils ne disent pas la même chose à qui regarde.
 *
 * 🔒 LE SERVEUR REFUSE DE RECOCHER UNE PIÈCE SANS OCTETS (condition en SQL, voir `cocherPiece`). L'écran la grise
 * déjà ; une requête forgée ne doit pas pouvoir faire partir un envoi voué à l'échec.
 */
export async function PATCH(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brouillonId = await brouillonDeLaRequete(ctx);
  if (brouillonId === null) return json({ erreur: 'Brouillon inconnu.' }, 400);
  if (!await piecesEnvoiDisponibles()) return json({ etat: 'sans_schema' }, 409);

  const corps = (await request.json().catch(() => null)) as { piece?: unknown; cochee?: unknown } | null;
  const pieceId = Number(corps?.piece ?? '');
  if (!Number.isInteger(pieceId) || pieceId <= 0) return json({ erreur: 'Pièce inconnue.' }, 400);
  /* ⚠️ `=== true` / `=== false` ET NON UNE CONVERSION : une valeur floue venue du navigateur ne doit pas décider
     qu'un document part. Tout ce qui n'est pas un booléen est refusé, et le dit. */
  if (corps?.cochee !== true && corps?.cochee !== false) {
    return json({ erreur: 'État de la case non reconnu.' }, 400);
  }

  try {
    const fait = await cocherPiece(brouillonId, pieceId, corps.cochee);
    if (fait) return json({ etat: 'ok', cochee: corps.cochee });
    /* Déjà dans cet état, pièce d'un autre brouillon, ou pièce SANS OCTETS qu'on voulait recocher : aucun de ces
       trois n'est une panne, et le mot le dit plutôt qu'un 500. */
    return json({
      etat: 'refuse',
      message: corps.cochee
        ? 'Cette pièce ne peut pas être jointe : ses octets sont introuvables.'
        : 'Cette pièce n’est pas (ou plus) jointe.',
    }, 409);
  } catch (e) {
    console.error('[gestion/brouillon/pieces] case impossible', e);
    return json({ etat: 'erreur', message: 'Le changement n’a pas abouti.' }, 503);
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
