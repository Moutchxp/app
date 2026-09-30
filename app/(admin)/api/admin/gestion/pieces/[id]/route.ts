import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { lirePieceAServir } from '../../../../../../lib/gestion/carteRepo';
import { recuperer } from '../../../../../../lib/stockage';
import { jetonPourSubject } from '../../../../../../lib/gestion/driveDelegue';
// 🔴 LOT PJ-APRES-VIDAGE — « lire les octets d'une pièce » s'écrit UNE fois, et tout le monde l'appelle.
import { lireOctetsPiece } from '../../../../../../lib/gestion/octetsPiece';
import { depsOctetsPiece } from '../../../../../../lib/gestion/octetsPieceCablage';
import {
  lienDrive, lireContenuDrive, messageIndisponible,
} from '../../../../../../lib/gestion/pieceDriveLecture';
// Le nom de fichier selon la RFC 2231, écrit UNE fois pour tout le module (voir `disposition` plus bas).
import { parametreNomFichier } from '../../../../../../lib/gestion/envoiGmail';
// 🔴 LOT PIECES-DE-LA-CONVERSATION — la lecture d'un en-tête `Range`, ÉCRITE UNE FOIS (module pur, déjà éprouvé).
import { lireIntervalle } from '../../../../../../lib/gestion/apercuDrive';

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

/**
 * L'EN-TÊTE `Content-Disposition` D'UNE PIÈCE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DÉFAUT TROUVÉ DANS LA NUIT DU 27/09/2026, en éprouvant la route par le VRAI chemin de l'application. Cette
 * fonction écrivait le nom tel quel : `filename="mandat de gestion signé.pdf"`. Or un en-tête HTTP ne transporte pas
 * d'UTF-8 — il est lu en ISO-8859-1. Le navigateur recevait donc, mesuré et vérifié octet par octet,
 * `mandat de gestion signé.pdf` relu comme « signÃ©.pdf » : le fichier s'enregistrait sous un nom abîmé.
 *
 * Deux pièces sur dix étaient touchées dans l'échantillon d'épreuve — toutes celles dont le nom porte un accent, soit
 * une bonne part des pièces d'une gestion locative française (« signé », « Thaïs », « état des lieux »…). Le défaut
 * est ANTÉRIEUR au vidage : il frappait aussi les pièces servies depuis MinIO. Il ne se voyait pas parce que rien ne
 * comparait le nom reçu au nom attendu.
 *
 * ⚠️ LA CORRECTION RÉEMPLOIE `parametreNomFichier`, écrite pour les pièces jointes des mails sortants : c'est la même
 * question (RFC 2231, reprise par la RFC 6266 pour HTTP) et il n'y a aucune raison d'en avoir deux implémentations.
 * Elle rend les DEUX formes — `filename="translittéré"` pour les clients anciens, `filename*=UTF-8''…` pour tous les
 * autres, qui l'emportent — et ne touche pas aux noms purement ASCII, qui restent lisibles à l'œil dans un journal.
 *
 * 🔒 L'ANTI-INJECTION RESTE EN PREMIER : guillemets, antislashs et retours de ligne sont retirés avant tout encodage.
 * `parametreNomFichier` retire déjà `[\r\n"]` ; on enlève aussi l'antislash, qu'elle laisse passer et qui n'a rien à
 * faire dans un nom de fichier servi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function disposition(nomFichier: string, telechargement: boolean): string {
  const propre = (nomFichier || 'piece-jointe').replace(/[\r\n"\\]/g, '_').trim() || 'piece-jointe';
  return `${telechargement ? 'attachment' : 'inline'}; ${parametreNomFichier(propre)}`;
}

/**
 * 🔴 LOT PJ-APRES-VIDAGE — `lireDepuisDrive` A ÉTÉ RETIRÉE D'ICI. Elle faisait, pour cette seule route, ce que
 * `lireOctetsPiece` fait désormais pour tout le monde : essayer la copie Drive et comparer son empreinte. La
 * garder aurait laissé deux écritures de la même règle — et c'est exactement ce qui a produit le défaut du fil
 * 3494, où l'affichage savait ce que l'envoi ignorait.
 */

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

    /**
     * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — CETTE ROUTE PASSE MAINTENANT PAR LE LECTEUR CENTRAL ═══════════════════════
     *
     * Elle savait DÉJÀ basculer sur la copie Drive (lot DRIVE-3), et c'est justement le problème : elle le
     * savait TOUTE SEULE. Le chemin d'envoi, lui, ne le savait pas — et transférer un mail ancien rendait
     * « The specified key does not exist ». Deux écritures pour la même question, une seule à jour.
     *
     * Elle appelle donc la même fonction que l'envoi, l'archive et les vignettes. Elle y gagne au passage le
     * DERNIER RECOURS (la pièce du message d'origine dans Gmail), qu'elle n'avait pas.
     *
     * ⚠️ `?depuis=drive` EST CONSERVÉ : il sert à éprouver le chemin Drive sur une pièce encore présente dans
     * les deux endroits. On le traduit en « fais comme si MinIO était vide ».
     */
    /**
     * ⚠️ AUCUNE REQUÊTE DE PLUS : `lirePieceAServir` rend désormais la TAILLE et l'ancre du message d'origine,
     * dans la MÊME lecture. Une seconde requête pour deux colonnes coûterait un aller-retour à chaque ouverture
     * de pièce, sur la route qui sert les octets.
     */
    const lu = await lireOctetsPiece(
      { ...piece, pieceId: id, stockageVide: forcerDrive ? true : piece.stockageVide },
      depsOctetsPiece());

    // 🔴 AUCUNE SOURCE N'A RÉPONDU : on le DIT, avec le lien Drive. Jamais un 404, jamais un écran vide.
    if (!lu.ok) {
      return Response.json(
        { erreur: lu.motif, lienDrive: piece.driveFileId === null ? null : lienDrive(piece.driveFileId) },
        { status: 503, headers: { 'Cache-Control': CACHE_PRIVE } });
    }
    const octets = lu.octets;

    /**
     * ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — LES TRANCHES (`Range`), ET POURQUOI ELLES CHANGENT TOUT ═══════════
     *
     * Demande d'Arno : « documents voisins préchargés (début du fichier seulement) », et « le temps d'ouverture de
     * la page 1 ne doit pas se dégrader ».
     *
     * 🔴 SANS TRANCHE, « LE DÉBUT DU FICHIER » N'EXISTE PAS. Cette route servait toujours le fichier ENTIER : un
     * préchargement aurait donc tiré douze mégaoctets pour un document que personne ne regarde encore — l'inverse
     * de ce qu'on cherche. Avec les tranches, un voisin coûte quelques dizaines de kilo-octets.
     *
     * ══ 🔴🔴 ET POURTANT : PAS D'EN-TÊTE `Accept-Ranges`. MESURÉ, PAS SUPPOSÉ ═══════════════════════════════
     *
     * ⚠️ UNE TRANCHE NE COÛTE PAS MOINS CHER AU SERVEUR, ICI. Contrairement au Drive — qui sait découper
     * lui-même, et à qui l'on transmet la demande telle quelle — MinIO nous rend l'objet ENTIER, et l'on en
     * coupe un morceau. Chaque tranche paie donc une lecture COMPLÈTE du stockage. Une tranche épargne le
     * TRANSPORT vers le navigateur, jamais la lecture.
     *
     * 🔴 CE QUE L'ANNONCE APPORTE AUJOURD'HUI : RIEN. Mesuré à l'écran le 30/09/2026 sur EDLS.pdf (3 194 577 o,
     * 16 pages), AVEC puis SANS `Accept-Ranges: bytes` : dans les deux cas PDF.js émet DEUX requêtes SANS
     * en-tête `Range`, pour 4 243 753 octets transférés (le fetch principal, vérifié à la trace, sort en 200
     * sans tranche). PDF.js n'active son mode « tranches » que si la réponse porte un `Content-Length`, que
     * Next ne met pas sur un flux. L'annoncer ne change donc pas une requête.
     *
     * 🔴 CE QU'ELLE RISQUERAIT DE COÛTER DEMAIN : le jour où ce `Content-Length` apparaît, PDF.js se mettrait à
     * découper — et chaque morceau paierait une lecture complète du stockage. C'est le piège déjà mesuré côté
     * Drive (« disableStream: true, tranches de 128 Kio : 20 requêtes, 13 646 ms — douze fois PIRE »), et là-bas
     * il n'est supportable que grâce à la mémoire courte des octets, que cette route-ci n'a pas.
     *
     * 🔴 LA RÈGLE D'ARNO EST « le temps d'ouverture de la page 1 ne doit pas se dégrader ». Un en-tête qui
     * n'apporte rien et qui peut coûter cher ne se met pas : on ne l'annonce pas.
     *
     * ⚠️ ET LA TRANCHE RESTE SERVIE À QUI LA DEMANDE EXPLICITEMENT — c'est tout ce dont le préchargement d'un
     * voisin a besoin : il envoie `Range: bytes=0-…` de sa propre initiative, reçoit 256 ko, et la lecture
     * complète faite par le serveur réchauffe le stockage pour le moment où l'on cliquera « Suivant ».
     *
     * 🔒 AUCUN ASSOUPLISSEMENT DE LA RÈGLE : le droit `gestion` a été relu au début de cette requête, comme pour
     * toute autre. Une tranche n'est qu'une découpe de ce qu'on avait déjà le droit de lire.
     *
     * ⚠️ UNE DEMANDE ILLISIBLE OU HORS BORNES REND LE FICHIER ENTIER (200), jamais une erreur : c'est ce que fait
     * `lireIntervalle` en rendant `null`, et c'est le comportement d'avant ce lot — donc rien ne peut casser.
     */
    const entetes = {
      'Content-Type': piece.typeMime || TYPE_PAR_DEFAUT,
      'Content-Disposition': disposition(piece.nomFichier, telechargement),
      'Cache-Control': CACHE_PRIVE,
      // Le navigateur ne doit pas re-deviner le type : un `.txt` renommé ne devient pas du HTML exécutable.
      'X-Content-Type-Options': 'nosniff',
      // D'où viennent les octets. Utile pour éprouver le chemin, et pour comprendre un délai inhabituel.
      'X-Source-Contenu': (piece.stockageVide || forcerDrive) ? 'drive' : 'stockage',
    };
    const tranche = lireIntervalle(request.headers.get('range'), octets.byteLength);
    if (tranche !== null) {
      const morceau = octets.subarray(tranche.debut, tranche.fin + 1);
      return new Response(new Uint8Array(morceau), {
        status: 206,
        headers: { ...entetes, 'Content-Range': `bytes ${tranche.debut}-${tranche.fin}/${octets.byteLength}` },
      });
    }

    return new Response(new Uint8Array(octets), { headers: entetes });
  } catch (e) {
    console.error('[gestion/piece] lecture impossible', e);
    return erreur('Pièce jointe indisponible : le stockage n’a pas répondu.', 503);
  }
}
