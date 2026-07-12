import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { validerRectification } from '../../../../../../lib/internaute/rectification';
import { rectifierInternaute, ErreurEmailDuplique } from '../../../../../../lib/internaute/cycleVie';

/**
 * PATCH /api/admin/internautes/[id]/rectification — DROIT DE RECTIFICATION (identité / bloc A). Module Internaute LOT 4.
 *
 * Corrige prénom/nom/email/téléphone (patch partiel). NE touche NI les preuves de consentement (B) NI le moteur.
 * RÉSERVÉ RÔLE ADMINISTRATEUR + transactionnel + journalisé (sans PII : on trace les champs modifiés, pas leurs
 * valeurs). Refuse un profil déjà effacé (404). Conflit d'unicité d'email → 409. Aucun pont M2. Runtime Node.
 */
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const v = validerRectification(body);
    if (!v.ok) return Response.json({ erreurs: v.erreurs }, { status: 422 });

    try {
      const { rectifie } = await rectifierInternaute(id, v.champs, garde.auteurId);
      if (!rectifie) return Response.json({ erreur: 'introuvable ou effacé' }, { status: 404 });
      return Response.json({ ok: true, rectifie: true });
    } catch (e) {
      if (e instanceof ErreurEmailDuplique) return Response.json({ erreur: 'email déjà utilisé' }, { status: 409 });
      throw e;
    }
  } catch {
    return Response.json({ erreur: 'rectification indisponible' }, { status: 503 });
  }
}
