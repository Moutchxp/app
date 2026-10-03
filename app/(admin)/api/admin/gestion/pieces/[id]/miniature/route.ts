import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import {
  DEPOT_MAX_OCTETS, genererMiniature, miniatureDepuisImageDeposee, MOTIF_MINIATURE_NAVIGATEUR, TYPE_MINIATURE,
} from '../../../../../../../lib/gestion/miniature';
// 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — une VIDÉO ne se décode pas ici : voir le `POST` en bas de fichier.
import { estVideo } from '../../../../../../../lib/gestion/pieces';
import {
  lireEtatMiniature, memoriserEchecMiniature, memoriserMiniature,
} from '../../../../../../../lib/gestion/piecesRepo';
import { deposerMiniatureGestion, recuperer } from '../../../../../../../lib/stockage';
// 🔴 LOT PJ-APRES-VIDAGE — « lire les octets d'une pièce » s'écrit UNE fois, et tout le monde l'appelle.
import { lireOctetsPiece } from '../../../../../../../lib/gestion/octetsPiece';
import { depsOctetsPiece, lirePiecesALire } from '../../../../../../../lib/gestion/octetsPieceCablage';

/**
 * /api/admin/gestion/pieces/[id]/miniature (lot 5-PJ-A) — LA VIGNETTE D'UNE PIÈCE JOINTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * FABRIQUÉE PARESSEUSEMENT, PUIS CONSERVÉE. Au premier affichage, on lit la pièce, on en tire une vignette, on la
 * dépose sur le stockage objet et on retient sa clé (migration 244). Les fois suivantes, on ne fait que servir le
 * fichier dérivé : aucun décodage, aucune dépense.
 *
 * 🔴 UN ÉCHEC EST MÉMORISÉ, ET NE SE RETENTE PAS. Un PDF mal formé ou une image tronquée sont fréquents dans du vrai
 * courrier. Sans mémoire de l'échec, chaque ouverture du message relancerait le décodage d'un fichier qu'on sait
 * illisible — un défaut connu deviendrait une charge permanente.
 *
 * 🔴 LE DROIT EST LE MÊME QUE POUR LA PIÈCE ELLE-MÊME (`gestion`), relu à CHAQUE requête. Une vignette montre le
 * contenu : elle ne mérite pas un régime plus souple que l'original.
 *
 * 🔴 AUCUNE URL DE STOCKAGE NE SORT D'ICI — même règle que `/api/admin/gestion/pieces/[id]` depuis le lot 4c.
 *
 * CACHE : `private, max-age` est autorisé POUR LA VIGNETTE SEULE, et c'est la seule exception du module. Elle est
 * dérivée, sa clé change si on la refabrique, et c'est ce qui évite de redemander vingt images au moindre défilement.
 * `private` interdit tout cache PARTAGÉ (proxy, tunnel, CDN) : seul le navigateur de la personne connectée la garde.
 * Les réponses d'ERREUR, elles, ne sont JAMAIS mises en cache (incident du 22/09 : un 401 enregistré sous le nom du
 * fichier attendu).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Runtime Node : pilote `pg`, client S3, `sharp` et le rasteriseur PDF en WebAssembly.
 */
export const runtime = 'nodejs';

/** Une vignette est dérivée et immuable tant que sa clé ne change pas : une heure dans le navigateur, nulle part ailleurs. */
const CACHE_VIGNETTE = 'private, max-age=3600';
const SANS_CACHE = 'private, no-store';

type Contexte = { params: Promise<{ id: string }> };

/** Un refus ne porte pas d'image, et ne doit JAMAIS être gardé en cache sous le nom du fichier attendu. */
function refus(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

function servir(octets: Buffer): Response {
  return new Response(new Uint8Array(octets), {
    headers: {
      'Content-Type': TYPE_MINIATURE,
      'Cache-Control': CACHE_VIGNETTE,
      // Le navigateur ne re-devine pas le type : ce que nous servons est un JPEG que NOUS avons fabriqué.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return refus('Pièce inconnue.', 400);

  try {
    const etat = await lireEtatMiniature(id);
    // Pièce inconnue et pièce jamais déposée donnent le MÊME 404 : la réponse ne renseigne pas sur ce qui existe.
    if (etat === null) return refus('Cette pièce jointe n’est pas disponible.', 404);

    // ── ① DÉJÀ FABRIQUÉE : on sert le fichier dérivé, sans rien décoder ──
    if (etat.etat === 'ok' && etat.cleMiniature !== null) {
      try {
        return servir(await recuperer(etat.cleMiniature));
      } catch {
        // La vignette a disparu du stockage : on ne ment pas, on la refait ci-dessous plutôt que de rendre une erreur.
      }
    }
    // ── ② ÉCHEC DÉJÀ CONSTATÉ : on ne retente pas. L'écran affiche son icône de type. ──
    if (etat.etat === 'echec') return refus('Pas de vignette pour cette pièce.', 404);

    /**
     * ── ③ PREMIER AFFICHAGE : on fabrique, on dépose, on retient ──
     *
     * 🔴 LOT PJ-APRES-VIDAGE — LES OCTETS PASSENT PAR LE LECTEUR CENTRAL. `recuperer` seul ne trouvait plus rien
     * depuis le vidage du 29/09 : la vignette d'une pièce ancienne échouait, et l'échec était MÉMORISÉ
     * (`memoriserEchecMiniature`) — donc jamais retenté, même une fois la lecture réparée.
     */
    const lu = await lireOctetsPiece(
      (await lirePiecesALire([id])).get(id) ?? {
        pieceId: id, nomFichier: etat.nomFichier, cleStockage: etat.cleStockage,
        stockageVide: false, driveFileId: null, md5Attendu: null, tailleAttendue: null, messageIdRfc: null,
      },
      depsOctetsPiece());
    /**
     * ⚠️ UNE SOURCE INJOIGNABLE N'EST PAS UN ÉCHEC DE VIGNETTE, et il ne faut SURTOUT pas le mémoriser : le
     * Drive peut être momentanément indisponible, et l'on s'interdirait la vignette pour toujours. On rend 404
     * sans rien retenir — l'écran affiche son icône de type, et réessaiera demain.
     */
    if (!lu.ok) return refus('Vignette momentanément indisponible pour cette pièce.', 404);
    const octets = lu.octets;
    const issue = await genererMiniature(octets, etat.typeMime, etat.nomFichier);
    if (!issue.ok) {
      /**
       * ⚠️ UNE VIDÉO N'EST PAS UN ÉCHEC : sa vignette viendra du NAVIGATEUR, par le `POST` ci-dessous. L'inscrire
       * « echec » la condamnerait avant même qu'on ait essayé — la branche ② ci-dessus ne retente jamais.
       */
      if (issue.motif !== MOTIF_MINIATURE_NAVIGATEUR) await memoriserEchecMiniature(id, issue.motif);
      return refus('Pas de vignette pour cette pièce.', 404);
    }
    const depot = await deposerMiniatureGestion(issue.octets, id);
    // Un dépôt impossible (stockage non configuré) n'empêche PAS de servir la vignette qu'on vient de fabriquer : on
    //   ne la retiendra simplement pas. Mieux vaut une image affichée et refaite demain qu'une carte vide aujourd'hui.
    if (depot.depose) await memoriserMiniature(id, depot.cle);
    return servir(issue.octets);
  } catch (e) {
    console.error('[gestion/miniature] fabrication impossible', e);
    return refus('Vignette indisponible.', 503);
  }
}

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LE NAVIGATEUR DÉPOSE LA VIGNETTE D'UNE VIDÉO ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Miniature : une image extraite de la vidéo (vers 1 s), mise en cache, servie comme
 * les autres miniatures. Choisis la méthode : ffmpeg côté serveur s'il est déjà installé (vérifie : which ffmpeg),
 * sinon extraction dans le navigateur (<video> + canvas). N'installe RIEN sur le Mac sans demander à Arno. »
 *
 * 🔴 VÉRIFIÉ : `which ffmpeg` → INTROUVABLE. C'est donc la seconde voie, et elle a un avantage qu'il faut dire :
 * elle ne demande AUCUN outil système, ni ici ni sur le futur hébergement — la même contrainte qui avait fait
 * choisir PDFium (WASM) plutôt que poppler pour les PDF.
 *
 * ═══ 🔒 CE QUI PROTÈGE CE DÉPÔT, ET POURQUOI CHAQUE GARDE EST LÀ ══════════════════════════════════════════════════
 *
 *   ① LE MÊME DROIT que pour la pièce elle-même (`gestion`), relu à CHAQUE requête ;
 *   ② LA PIÈCE DOIT ÊTRE UNE VIDÉO. Sans cette garde, n'importe quelle pièce pourrait recevoir une image choisie
 *      par le client — c'est-à-dire qu'une facture pourrait s'afficher sous la vignette d'autre chose ;
 *   ③ UNE VIGNETTE DÉJÀ FABRIQUÉE NE SE REMPLACE PAS. Le dépôt sert à COMBLER une absence, jamais à réécrire ce
 *      qui est là : sans cela, un onglet resté ouvert écraserait le travail d'un autre à chaque affichage ;
 *   ④ LES OCTETS SONT RÉENCODÉS PAR `sharp` (voir `miniatureDepuisImageDeposee`). Ce qui est stocké est une image
 *      fabriquée par NOUS, aux dimensions que NOUS imposons. Ce qui n'est pas une image n'entre pas ;
 *   ⑤ LA TAILLE EST BORNÉE AVANT TOUTE LECTURE (`DEPOT_MAX_OCTETS`).
 *
 * ⚠️ UN ÉCHEC DE DÉPÔT N'EST PAS MÉMORISÉ comme un échec de vignette : le navigateur réessaiera à la prochaine
 * ouverture, et une vidéo qu'un navigateur ne sait pas décoder garde simplement son icône.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return refus('Pièce inconnue.', 400);

  try {
    const etat = await lireEtatMiniature(id);
    if (etat === null) return refus('Cette pièce jointe n’est pas disponible.', 404);
    // ② LA GARDE QUI COMPTE : seule une vidéo reçoit une vignette venue du navigateur.
    if (!estVideo(etat.typeMime, etat.nomFichier)) {
      return refus('Cette pièce n’est pas une vidéo : sa vignette est fabriquée par le serveur.', 409);
    }
    // ③ ON COMBLE UNE ABSENCE, ON NE REMPLACE RIEN.
    if (etat.etat === 'ok' && etat.cleMiniature !== null) {
      return Response.json({ etat: 'deja' }, { headers: { 'Cache-Control': SANS_CACHE } });
    }

    // ⑤ BORNÉ AVANT LECTURE : on refuse sans ouvrir ce qui est manifestement hors sujet.
    const annonce = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(annonce) && annonce > DEPOT_MAX_OCTETS) {
      return refus('Image déposée trop volumineuse.', 413);
    }
    const recu = Buffer.from(await request.arrayBuffer());
    if (recu.byteLength > DEPOT_MAX_OCTETS) return refus('Image déposée trop volumineuse.', 413);

    // ④ RÉENCODÉE PAR NOUS : ce qui entre dans le stockage est notre JPEG, jamais celui du client.
    const issue = await miniatureDepuisImageDeposee(recu);
    if (!issue.ok) return refus('Image déposée illisible.', 422);

    const depot = await deposerMiniatureGestion(issue.octets, id);
    if (!depot.depose) return refus('Le stockage n’a pas accepté la vignette.', 503);
    await memoriserMiniature(id, depot.cle);
    return Response.json({ etat: 'ok' }, { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    console.error('[gestion/miniature] dépôt impossible', e);
    return refus('Dépôt de vignette impossible.', 503);
  }
}
