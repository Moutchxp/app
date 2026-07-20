import 'server-only';
import { exigerInternaute } from '../../../../../../lib/internaute/authGarde';
import { resoudrePdfCertificat } from '../../../../../../lib/internaute/espace';
import { urlSignee } from '../../../../../../lib/stockage';

// Runtime Node (driver pg + client S3). Route AUTHENTIFIÉE (garde internaute).
export const runtime = 'nodejs';

/** Durée COURTE de l'URL signée de re-téléchargement (secondes) : le clic suit immédiatement. */
const DUREE_URL_S = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/internaute/espace/certificats/[id]/telecharger — RE-TÉLÉCHARGEMENT d'un certificat PDF.
 *
 * SÉCURITÉ (anti-IDOR) : `exigerInternaute` d'abord ; la PROPRIÉTÉ est vérifiée AVANT toute signature — `resoudrePdfCertificat`
 * ne renvoie une clé QUE si le certificat appartient à un projet de l'internaute de SESSION (jointure `internaute_projet.internaute_id`).
 * Sinon `404` (indistinguable d'un id inexistant). La clé de stockage est LUE en base (jamais construite depuis l'URL/entrée).
 * On réutilise le mécanisme d'URL signée existant (`urlSignee`, bucket privé) avec une durée COURTE, puis on redirige (302).
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const garde = await exigerInternaute(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ erreur: 'introuvable' }, { status: 404 });
  const certificatId = Number(id);

  let resolution;
  try {
    resolution = await resoudrePdfCertificat(garde.internauteId, certificatId);
  } catch (e) {
    console.error('[espace] résolution certificat indisponible', (e as Error)?.name ?? 'Erreur');
    return Response.json({ erreur: 'indisponible' }, { status: 503 });
  }

  if (resolution.statut === 'introuvable') {
    return Response.json({ erreur: 'introuvable' }, { status: 404 }); // pas à lui / inexistant → aucune fuite
  }
  if (resolution.statut === 'pdf_absent') {
    return Response.json({ erreur: 'PDF pas encore disponible' }, { status: 409 }); // propriétaire, mais PDF non généré
  }

  try {
    const url = await urlSignee(resolution.cle, DUREE_URL_S);
    return new Response(null, { status: 302, headers: { Location: url } });
  } catch (e) {
    console.error('[espace] URL signée indisponible', (e as Error)?.name ?? 'Erreur');
    return Response.json({ erreur: 'téléchargement indisponible' }, { status: 503 });
  }
}
