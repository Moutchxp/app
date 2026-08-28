import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { debloquerDepotPresumeSansAccuse } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * Lot C — /api/admin/permis/demandes/debloquer : ISSUE DE SECOURS du verrou de commune téléservice (« pas d'accusé attendu »).
 * POST { demandeId } → résout la présomption VIVANTE en 'sans_accuse' (geste HUMAIN explicite, journalisé), sans écrire de
 * référence ni toucher demande.statut. Idempotent : { leve:false } si aucune présomption vivante (déjà résolue). RÉSERVÉ
 * ADMINISTRATEUR (proxy fail-closed + garde). Aucun envoi, aucune relève. Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let demandeCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { demandeId?: unknown };
    demandeCtx = c.demandeId;
    if (!Number.isInteger(c.demandeId)) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
    const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
    const leve = await debloquerDepotPresumeSansAccuse(c.demandeId as number, auteur);
    return Response.json({ ok: true, leve });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; code?: unknown; detail?: unknown; constraint?: unknown };
    console.error('[permis/demandes/debloquer] POST impossible (503)', {
      demandeId: demandeCtx, name: err?.name, message: err?.message, code: err?.code, detail: err?.detail, constraint: err?.constraint,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
