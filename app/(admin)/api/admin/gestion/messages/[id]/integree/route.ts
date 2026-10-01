import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { query } from '../../../../../../../lib/db/client';
import { htmlDuMessage } from '../../../../../../../lib/gestion/carteRepo';
import { adressesDesImages } from '../../../../../../../lib/gestion/imagesMail';
import {
  lireDataImage, mimeDuType, octetsDeLaCharge, TAILLE_IMAGE_MAX, typeImageSur,
} from '../../../../../../../lib/gestion/imagesIntegrees';

/**
 * ══ 🔴🔴 /api/admin/gestion/messages/[id]/integree?rang=N — LES OCTETS D'UNE IMAGE INTÉGRÉE ════════════════════
 *
 * LOT IMAGES-INTEGREES. Une image collée dans un mail voyage en `data:image/…;base64,…` : ses octets sont DANS le
 * corps HTML. Pour le message 57381 d'Arno, cela fait 2,3 Mo pour une seule photo, sur un corps de 2 327 574
 * caractères — que la lecture coupait à 400 000, en plein milieu de la balise, d'où le code affiché à l'écran.
 *
 * 🔴 LA CHARGE EST DONC RETIRÉE À LA LECTURE (`sqlSansChargeImage`) ET SERVIE ICI, à la demande. La page ne porte
 * plus que du balisage ; les octets ne traversent le réseau que si quelqu'un regarde vraiment l'image.
 *
 * ═══ IL NE PREND JAMAIS UNE ADRESSE EN PARAMÈTRE — même raison que le relais d'images distantes ═══════════════
 *
 * Il prend un MESSAGE et un RANG, puis relit le document NOUS-MÊME, assaini par la même fonction qu'à l'affichage :
 * les deux côtés comptent donc les mêmes `<img>` dans le même ordre. Une route qui accepterait une adresse serait
 * un relais ouvert (SSRF) ; une route qui accepterait du base64 serait pire — elle servirait n'importe quels
 * octets sous n'importe quel type, depuis notre domaine.
 *
 * 🔴 ET LE TYPE EST REVÉRIFIÉ ICI, sur les octets qu'on s'apprête à rendre : jpeg, png, gif, webp, et rien
 * d'autre. Pas de SVG — c'est un document, pas une image : il porte `<script>` et `onload`, et le servir sous
 * notre domaine reviendrait à exécuter chez nous ce qu'un expéditeur a écrit.
 *
 * ⚠️ LA CHARGE EST RELUE DANS LA COLONNE ENTIÈRE, par une expression SQL qui n'en extrait QUE la n-ième — sans
 * jamais ramener les 15 Mo d'un mail pathologique dans la mémoire du serveur.
 *
 * 🔒 Droit `gestion`, relu en base à chaque requête. La réponse ne rend que des octets d'image.
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

/** Un refus ne DIT rien : toujours le même 404, sans corps exploitable. */
function refus(): Response {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const garde = await exigerCompteActif(request, 'gestion');
  if (garde) return garde;

  const messageId = Number((await ctx.params).id);
  const rang = Number(new URL(request.url).searchParams.get('rang'));
  if (!Number.isInteger(messageId) || messageId <= 0) return refus();
  if (!Number.isInteger(rang) || rang < 0 || rang > 500) return refus();

  try {
    /**
     * ① QUELLE IMAGE ? Le document assaini — le MÊME qu'à l'affichage — dit ce que porte le rang demandé. Si ce
     *    n'est pas une image intégrée, la requête ne désigne rien : 404, sans explication.
     */
    const html = await htmlDuMessage(messageId);
    if (html === null) return refus();
    const toutes = adressesDesImages(html);
    const src = toutes[rang];
    if (src === undefined) return refus();
    const data = lireDataImage(src);
    if (data === null || !typeImageSur(data.type)) return refus();
    /**
     * 🔴🔴 DEUX COMPTAGES, ET IL FAUT LES RELIER. Le `rang` compte TOUTES les images du document (`cid:`,
     * distantes, intégrées) — c'est la règle de `reecrireImages`, et on n'en change pas. L'extraction en base, elle,
     * ne voit que les images INTÉGRÉES. On convertit donc l'un dans l'autre ici, en comptant combien d'images
     * intégrées précèdent ce rang. Sans cette conversion, un mail portant un logo `cid:` avant sa photo servirait
     * une image pour une autre.
     */
    const rangIntegree = toutes.slice(0, rang).filter((s) => lireDataImage(s) !== null).length;

    /**
     * ② LES OCTETS. On ne relit pas la colonne entière : `regexp_matches` rend les charges DANS L'ORDRE, et l'on
     *    ne garde que celle du rang. Le compte est le même des deux côtés parce que l'expression ne reconnaît que
     *    ce que `lireDataImage` reconnaît : `data:image/<type>;base64,<charge>`.
     *
     * ⚠️ `OFFSET`/`LIMIT` SUR LA LISTE ORDONNÉE : c'est ce qui évite de ramener 15 Mo pour en garder 2.
     */
    const { rows } = await query<{ type: string; charge: string }>(
      `SELECT m[1] AS type, m[2] AS charge
         FROM gestion_message g,
              LATERAL regexp_matches(g.corps_html,
                'data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=[:space:]]+)', 'gi') AS m
        WHERE g.id = $1
        OFFSET $2 LIMIT 1`, [messageId, rangIntegree]);
    const brut = rows[0];
    if (brut === undefined) return refus();
    if (!typeImageSur(brut.type)) return refus();

    const charge = brut.charge.replace(/\s+/g, '');
    if (charge === '' || octetsDeLaCharge(charge) > TAILLE_IMAGE_MAX) return refus();
    const octets = Buffer.from(charge, 'base64');
    if (octets.length === 0) return refus();

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        'Content-Type': mimeDuType(brut.type),
        // `private` : ce sont les images du courrier d'un client, aucun cache partagé ne les garde. Un cache privé
        //   évite de refaire l'extraction à chaque défilement de la conversation.
        'Cache-Control': 'private, max-age=600',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[gestion/integree] image intégrée illisible', { messageId, rang, e });
    return refus();
  }
}
