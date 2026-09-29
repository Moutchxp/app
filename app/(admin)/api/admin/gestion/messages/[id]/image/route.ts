import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { htmlDuMessage } from '../../../../../../../lib/gestion/carteRepo';
import { adressesDesImages, estDistante } from '../../../../../../../lib/gestion/imagesMail';
/**
 * 🔴 LOT ETOILE-ET-SIGNATURE — LES VERROUS ONT DÉMÉNAGÉ dans `relaisImageReel`, sans changer d'un mot. Les images
 * de la signature Gmail en ont besoin des MÊMES, et une seconde copie serait une seconde chance de n'en corriger
 * qu'une le jour où l'on en resserre un.
 */
import { allerChercherImage } from '../../../../../../../lib/gestion/relaisImageReel';

/**
 * /api/admin/gestion/messages/[id]/image?rang=N — LE RELAIS D'IMAGES D'UN MAIL EN HTML.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'IL FAIT, ET POURQUOI IL EXISTE. Un mail en HTML porte des images chez l'expéditeur. Les charger
 * directement depuis le navigateur livrerait à cet expéditeur l'adresse IP de la personne qui lit, son navigateur
 * et l'heure exacte de l'ouverture — c'est le pixel espion. Notre serveur va donc les chercher à sa place.
 *
 * ⚠️ CE QUE LE RELAIS NE FAIT PAS, et il faut le dire : il n'empêche pas l'expéditeur de savoir que le mail a été
 * OUVERT — notre serveur appelle bien son adresse. Il l'empêche de savoir QUI, D'OÙ et AVEC QUOI.
 *
 * ═══ 🔴 IL NE PREND JAMAIS UNE ADRESSE EN PARAMÈTRE ══════════════════════════════════════════════════════════════
 *
 * Il prend un MESSAGE et un RANG (« la 3ᵉ image du mail 57185 »), puis relit l'adresse dans le HTML que NOUS avons
 * stocké, ASSAINI exactement comme à l'affichage. Une route qui accepterait une URL serait un relais ouvert :
 * n'importe qui pourrait faire appeler par notre serveur `http://localhost:9000` (le stockage), la base, ou le
 * service de métadonnées d'un hébergeur — et lire la réponse. C'est la faille SSRF, et elle ne s'ouvre pas « juste
 * pour des images ».
 *
 * 🔴 ET L'ADRESSE AINSI OBTENUE EST QUAND MÊME VÉRIFIÉE, parce qu'elle vient d'un mail — donc de quelqu'un
 * d'extérieur. Un expéditeur qui glisse `<img src="http://127.0.0.1:9000/…">` dans sa signature passerait sinon le
 * premier verrou sans difficulté. Deux verrous, deux raisons : voir `relaisImage.ts`.
 *
 * ⚠️ LES REDIRECTIONS SONT SUIVIES UNE PAR UNE, EN REVÉRIFIANT CHACUNE. Une adresse publique qui redirige vers
 * `127.0.0.1` est le contournement classique — `redirect: 'manual'` est donc obligatoire ici, pas une précaution.
 *
 * 🔒 Droit `gestion`, relu en base à chaque requête. Et la réponse ne rend QUE des octets d'image : jamais du
 * texte, jamais les en-têtes d'en face, jamais le code de retour distant — un refus d'ici est toujours notre 404.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

/** Un refus ne DIT rien de ce qui se passe en face : toujours le même 404, sans corps exploitable. */
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
    // 🔴 LE MÊME HTML QU'À L'AFFICHAGE, assaini par la même fonction : le rang désigne donc la même image.
    const html = await htmlDuMessage(messageId);
    if (html === null) return refus();
    const adresses = adressesDesImages(html);
    const url = adresses[rang];
    if (url === undefined || !estDistante(url)) return refus();

    const octets = await allerChercherImage(url);
    if (octets === null) return refus();
    return new Response(new Uint8Array(octets.corps), {
      status: 200,
      headers: {
        'Content-Type': octets.type,
        // `private` : ces images appartiennent au courrier d'un client, aucun cache partagé ne les garde. Un cache
        //   PRIVÉ court évite de rappeler le serveur d'en face à chaque défilement de la conversation.
        'Cache-Control': 'private, max-age=600',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[gestion/image] relais impossible', { messageId, rang, e });
    return refus();
  }
}
