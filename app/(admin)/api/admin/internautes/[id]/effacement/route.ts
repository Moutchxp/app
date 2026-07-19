import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { effacerInternaute } from '../../../../../../lib/internaute/cycleVie';

/**
 * POST /api/admin/internautes/[id]/effacement — DROIT À L'EFFACEMENT (module Internaute, LOT 4).
 *
 * RÈGLE (Commit 4) : anonymise l'identité (A), CONSERVE le projet (C) ET le certificat (PDF vérifiable par jeton),
 * CONSERVE la preuve de consentement (B). NE SUPPRIME PLUS le projet → RÉPARE le 503 qui frappait tout porteur de
 * certificat (FK `certificat.projet_id` NO ACTION). RÉSERVÉ RÔLE ADMINISTRATEUR (`exigerAdministrateur` + fail-closed
 * proxy). Transactionnel + journalisé (`internaute_cycle_vie_log`). Après effacement, le profil disparaît des extractions
 * (filtre `efface_a IS NULL`).
 * Aucun pont M2, moteur jamais rappelé (golden intact). Runtime Node.
 */
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const { id } = await ctx.params;
    if (!UUID.test(id)) return Response.json({ erreur: 'introuvable' }, { status: 404 });

    const { efface } = await effacerInternaute(id, garde.auteurId);
    if (!efface) return Response.json({ erreur: 'introuvable' }, { status: 404 });
    return Response.json({ ok: true, efface: true });
  } catch {
    return Response.json({ erreur: 'effacement indisponible' }, { status: 503 });
  }
}
