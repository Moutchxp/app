import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { lirePieceAServir } from '../../../../../../lib/gestion/carteRepo';
import { recuperer } from '../../../../../../lib/stockage';
import { jetonPourSubject } from '../../../../../../lib/gestion/driveDelegue';
import {
  lienDrive, lireContenuDrive, messageIndisponible,
} from '../../../../../../lib/gestion/pieceDriveLecture';

/**
 * /api/admin/gestion/pieces/[id] (lot 4c) — LES OCTETS D'UNE PIÈCE JOINTE, servis PAR L'APPLICATION.
 *
 * ⚠️ AUCUNE URL DE STOCKAGE NE SORT D'ICI, et ce n'est pas une préférence d'architecture : c'est la même décision que
 * pour les certificats (22/09/2026), pour les deux mêmes raisons.
 *   1. Une URL signée porte l'ENDPOINT S3 (en développement `localhost:9000`) : injoignable dès qu'on consulte l'écran
 *      ailleurs que depuis le Mac — tunnel, 4G, et demain la production si l'endpoint reste interne.
 *   2. Une URL signée est un LAISSEZ-PASSER TRANSMISSIBLE, valable pendant toute sa durée de vie, vers la pièce jointe
 *      d'un locataire — bail, RIB, constat, certificat médical. Servir par l'application replace le contrôle d'accès à
 *      CHAQUE ouverture : le droit `gestion` est relu en base à chaque requête, et un droit retiré ferme la porte
 *      immédiatement, y compris sur un lien déjà copié.
 *
 * `private, no-store` : aucun cache partagé (proxy, tunnel, CDN) ne conserve ces octets, et rien n'atterrit sur disque
 * — y compris sur les réponses d'ERREUR, qu'un navigateur peut enregistrer SOUS LE NOM DU FICHIER attendu (incident du
 * 22/09 : un 401 rendait un JSON de 29 octets là où l'on attendait un `.png`).
 *
 * `inline` par défaut (on consulte sans rien enregistrer) ; `?telecharger=1` bascule en `attachment` avec le MÊME nom.
 * Runtime Node (driver pg + client S3).
 *
 * ═══ 🔴 LOT DRIVE-3 — LE CONTENU PEUT VENIR DU DRIVE, ET L'UTILISATEUR NE LE VOIT PAS ════════════════════════════
 * Quand le contenu d'une pièce a quitté MinIO parce que sa copie Drive est prouvée, cette route lit dans le Drive et
 * sert exactement la même chose : même nom, même type, mêmes octets, même contrôle d'accès. Tout au plus un délai.
 *
 * 🔒 ELLE NE LIT QUE NOS PROPRES COPIES. L'identifiant vient de `gestion_piece_drive` avec `origine = 'copie'` —
 * des fichiers que le programme a créés dans « 00 Arrivée des mails », derrière le double garde-fou. « Documents
 * clients scannés » n'est jamais approché, et aucune écriture Drive n'est émise d'ici.
 *
 * ⚠️ `?depuis=drive` FORCE LA LECTURE CÔTÉ DRIVE même si MinIO a encore le contenu. C'est ce qui permet d'éprouver ce
 * chemin AVANT le premier vidage, sur une pièce présente aux deux endroits — et de comparer les deux empreintes.
 *
 * 🔴 UNE LECTURE DRIVE QUI ÉCHOUE NE DIT JAMAIS « INTROUVABLE ». La pièce existe, sa copie existe : ce qui a échoué
 * est la lecture, à l'instant. On le dit, avec le lien vers la copie, pour que la personne puisse aller la chercher
 * elle-même plutôt que de croire le document perdu.
 */
export const runtime = 'nodejs';

const CACHE_PRIVE = 'private, no-store';
/** Type par défaut : un type inconnu ne doit pas être INTERPRÉTÉ par le navigateur (pas d'exécution d'un HTML piégé). */
const TYPE_PAR_DEFAUT = 'application/octet-stream';
/**
 * Au nom de qui lire le Drive. La MÊME adresse que la copie (`copier-pieces-drive.ts`) : c'est elle qui a créé les
 * fichiers, c'est elle qui peut les relire. Écrite une fois — deux valeurs finiraient par diverger.
 */
const COMPTE_DRIVE = 'gestion@criterimmo.fr';

type Contexte = { params: Promise<{ id: string }> };

function erreur(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': CACHE_PRIVE } });
}

/** Même en-tête de cache sur le refus de la garde, sans toucher ni à son statut ni à son corps. */
function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', CACHE_PRIVE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

/** Anti-injection d'en-tête : guillemets, antislashs et retours de ligne ne franchissent pas un `Content-Disposition`. */
function disposition(nomFichier: string, telechargement: boolean): string {
  const nom = (nomFichier || 'piece-jointe').replace(/[\r\n"\\]/g, '_').trim();
  return `${telechargement ? 'attachment' : 'inline'}; filename="${nom}"`;
}

/**
 * LES OCTETS, LUS DANS LE DRIVE. Rend un `Buffer`, ou de quoi expliquer l'échec à un humain.
 *
 * 🔒 L'IDENTIFIANT VIENT DE NOTRE REGISTRE DE COPIES, jamais d'une requête. C'est ce qui garantit qu'on ne lit que
 * dans « 00 Arrivée des mails ».
 */
async function lireDepuisDrive(piece: {
  driveFileId: string | null; md5Attendu: string | null; nomFichier: string;
}): Promise<Buffer | { message: string; lien: string | null }> {
  if (piece.driveFileId === null) {
    return {
      message: 'Pièce momentanément indisponible : aucune copie Drive vérifiée n’est enregistrée pour elle.',
      lien: null,
    };
  }
  const jeton = await jetonPourSubject(COMPTE_DRIVE, { fetch });
  if (!jeton.ok) return { message: messageIndisponible(piece.driveFileId, jeton.motif), lien: lienDrive(piece.driveFileId) };

  const r = await lireContenuDrive(piece.driveFileId, jeton.jeton, { fetch });
  if (!r.ok) return { message: messageIndisponible(piece.driveFileId, r.motif), lien: lienDrive(piece.driveFileId) };

  /**
   * 🔴 ON COMPARE L'EMPREINTE DE CE QU'ON VIENT DE RECEVOIR à celle enregistrée lors de la copie. Un fichier
   * remplacé dans le Drive depuis la copie donnerait des octets différents sous le même nom : les servir sans
   * rien dire serait le pire des silences. On les refuse, et on renvoie vers la copie.
   */
  if (piece.md5Attendu !== null && r.md5.toLowerCase() !== piece.md5Attendu.toLowerCase()) {
    return {
      message: messageIndisponible(
        piece.driveFileId, 'le fichier du Drive ne porte plus la même empreinte que la pièce d’origine'),
      lien: lienDrive(piece.driveFileId),
    };
  }
  return r.octets;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return sansCache(refus);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return erreur('Pièce inconnue.', 400);

  try {
    const piece = await lirePieceAServir(id);
    // Pièce inconnue ET pièce jamais déposée donnent le MÊME 404 : la réponse ne renseigne pas sur ce qui existe.
    if (!piece) return erreur('Cette pièce jointe n’est pas disponible.', 404);

    const params = new URL(request.url).searchParams;
    const telechargement = params.get('telecharger') === '1';
    // `?depuis=drive` : éprouver le chemin Drive sur une pièce encore présente dans les deux endroits.
    const forcerDrive = params.get('depuis') === 'drive';

    const octets = (piece.stockageVide || forcerDrive)
      ? await lireDepuisDrive(piece)
      : await recuperer(piece.cleStockage);

    // 🔴 LA LECTURE DRIVE A ÉCHOUÉ : on le DIT, avec le lien. Jamais un 404, jamais un écran vide.
    if (!(octets instanceof Buffer) && !(octets instanceof Uint8Array)) {
      return Response.json(
        { erreur: octets.message, lienDrive: octets.lien },
        { status: 503, headers: { 'Cache-Control': CACHE_PRIVE } });
    }

    return new Response(new Uint8Array(octets), {
      headers: {
        'Content-Type': piece.typeMime || TYPE_PAR_DEFAUT,
        'Content-Disposition': disposition(piece.nomFichier, telechargement),
        'Cache-Control': CACHE_PRIVE,
        // Le navigateur ne doit pas re-deviner le type : un `.txt` renommé ne devient pas du HTML exécutable.
        'X-Content-Type-Options': 'nosniff',
        // D'où viennent les octets. Utile pour éprouver le chemin, et pour comprendre un délai inhabituel.
        'X-Source-Contenu': (piece.stockageVide || forcerDrive) ? 'drive' : 'stockage',
      },
    });
  } catch (e) {
    console.error('[gestion/piece] lecture impossible', e);
    return erreur('Pièce jointe indisponible : le stockage n’a pas répondu.', 503);
  }
}
