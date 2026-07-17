import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { retirerConsentement } from '../../../../../../lib/internaute/cycleVie';
import { TEXTES_CONSENTEMENT, type CleFinalite } from '../../../../../../lib/internaute/textesConsentement';

/**
 * PATCH /api/admin/internautes/[id]/consentement — RETRAIT d'un consentement (bloc B). Voie HORS TUNNEL.
 *
 * RÈGLE PRODUIT (non négociable) : l'admin PEUT retirer, ne PEUT JAMAIS ré-accorder (accorder = acte de l'internaute,
 * via le tunnel). Cette route N'EXPOSE QUE le retrait — aucune valeur d'entrée ne permet d'accorder. RÉSERVÉ RÔLE
 * ADMINISTRATEUR + transactionnel + journalisé (accountability : qui, quand, quelle finalité, à la demande de qui ;
 * JAMAIS de PII). Idempotent : retirer une finalité déjà inactive → 200 (l'état voulu est déjà atteint). Profil effacé
 * → 404. Modèle : `[id]/rectification/route.ts`. Runtime Node.
 */
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Liste FERMÉE des finalités, LUE du catalogue (jamais réinventée).
const FINALITES = new Set<string>(TEXTES_CONSENTEMENT.map((t) => t.finalite));
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const { id } = await ctx.params;
    if (!UUID.test(id)) return Response.json({ erreur: 'introuvable' }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ erreur: 'corps JSON invalide' }, { status: 422 });
    }
    const b = body as { finalite?: unknown; aLaDemandeDe?: unknown; motif?: unknown };

    // `finalite` : obligatoire, dans la liste fermée.
    if (typeof b.finalite !== 'string' || !FINALITES.has(b.finalite)) {
      return Response.json({ erreur: 'finalite invalide' }, { status: 422 });
    }
    // `aLaDemandeDe` : obligatoire, enum fermé (contexte RGPD).
    if (b.aLaDemandeDe !== 'internaute' && b.aLaDemandeDe !== 'admin') {
      return Response.json({ erreur: 'aLaDemandeDe invalide' }, { status: 422 });
    }
    // `motif` : optionnel, chaîne courte (métadonnée admin ; JAMAIS de PII — responsabilité de l'appelant).
    if (b.motif != null && (typeof b.motif !== 'string' || b.motif.length > 500)) {
      return Response.json({ erreur: 'motif invalide' }, { status: 422 });
    }

    const { retire, raison } = await retirerConsentement(
      id,
      b.finalite as CleFinalite,
      garde.auteurId,
      { aLaDemandeDe: b.aLaDemandeDe, motif: typeof b.motif === 'string' ? b.motif : undefined },
    );
    if (raison === 'introuvable') return Response.json({ erreur: 'introuvable ou effacé' }, { status: 404 });
    if (raison === 'deja_inactif') return Response.json({ ok: true, retire: false, deja: true }); // idempotent : succès, pas une erreur
    return Response.json({ ok: true, retire });
  } catch {
    return Response.json({ erreur: 'retrait indisponible' }, { status: 503 });
  }
}
