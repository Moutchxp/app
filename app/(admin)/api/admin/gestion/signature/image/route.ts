import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { allerChercherImage } from '../../../../../../lib/gestion/relaisImageReel';
import { adresseImageSignature } from '../../../../../../lib/gestion/signatureImagesReel';

/**
 * /api/admin/gestion/signature/image?rang=N — LES IMAGES DE LA SIGNATURE GMAIL, EN LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI L'ÉDITEUR PASSE PAR NOUS. Mesuré le 29/09/2026 : les images de la signature de gestion@
 * (`lh3/lh5.googleusercontent.com`) se chargent parfaitement DEPUIS NOTRE SERVEUR — 200, image/png, 1 933 / 835 /
 * 1 600 octets — mais restent VIDES quand la page les demande elle-même. Un logo cassé dans l'éditeur, c'est un
 * logo dont on doute jusqu'à l'envoi.
 *
 * ═══ 🔴 ELLE NE PREND JAMAIS UNE ADRESSE EN PARAMÈTRE ═══════════════════════════════════════════════════════════
 *
 * Elle prend un RANG (« la 2ᵉ image de la signature »), et relit l'adresse dans la signature que GOOGLE nous rend,
 * assainie par la même fonction qu'à l'affichage. Une route qui accepterait une URL serait un relais ouvert :
 * n'importe qui pourrait faire appeler par notre serveur `http://127.0.0.1:9000`, la base, ou le service de
 * métadonnées d'un hébergeur — et en lire la réponse. C'est la faille SSRF, et elle ne s'ouvre pas pour un logo.
 *
 * 🔴 ET L'ADRESSE AINSI OBTENUE EST QUAND MÊME VÉRIFIÉE (`allerChercherImage`). Elle vient d'un réglage Gmail,
 * donc d'un formulaire : ce n'est pas parce que c'est le nôtre qu'il mérite moins de verrous. Deux verrous, deux
 * raisons — exactement comme pour les images d'un mail reçu.
 *
 * 🔒 Droit `gestion`, relu en base à chaque requête. La réponse ne rend QUE des octets d'image : jamais du texte,
 * jamais les en-têtes d'en face, jamais le code de retour distant — un refus d'ici est toujours notre 404.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

/** Un refus ne DIT rien de ce qui se passe en face : toujours le même 404, sans corps exploitable. */
function refus(): Response {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerCompteActif(request, 'gestion');
  if (garde) return garde;

  const rang = Number(new URL(request.url).searchParams.get('rang'));
  if (!Number.isInteger(rang) || rang < 0 || rang > 50) return refus();

  try {
    const url = await adresseImageSignature(rang);
    if (url === null) return refus();
    const octets = await allerChercherImage(url);
    if (octets === null) return refus();
    return new Response(new Uint8Array(octets.corps), {
      status: 200,
      headers: {
        'Content-Type': octets.type,
        // La signature ne change pas dans la journée, et l'éditeur la redemande à chaque ouverture de fenêtre.
        //   `private` : elle n'a rien à faire dans un cache partagé.
        'Cache-Control': 'private, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[gestion/signature/image] lecture impossible', { rang, e });
    return refus();
  }
}
