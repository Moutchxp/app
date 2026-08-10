import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { ajouterReferenceExterne, ReferenceDejaEnregistreeError } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes/reference (chantier P1). POST = enregistre une RÉFÉRENCE interne de la MAIRIE sur une demande,
 * y compris APRÈS COUP (demande déjà déposée : l'accusé de réception arrive parfois plus tard — cas réel de la demande 119).
 * N'écrit JAMAIS demande.statut. Doublon (unique demande_id, reference) → 409 métier nommé ; inattendu → 503 journalisé.
 * RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

const SOURCES = new Set(['accuse_reception', 'saisie_manuelle', 'autre']);

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let demandeCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { demandeId?: unknown; reference?: unknown; dossierId?: unknown; source?: unknown };
    demandeCtx = c.demandeId;
    if (!Number.isInteger(c.demandeId)) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
    const reference = typeof c.reference === 'string' ? c.reference.trim() : '';
    if (reference === '') return Response.json({ erreur: 'référence vide' }, { status: 400 }); // ici la référence est REQUISE (ajout explicite)
    const dossierId = Number.isInteger(c.dossierId) ? (c.dossierId as number) : null;
    const source = typeof c.source === 'string' && SOURCES.has(c.source) ? c.source : 'saisie_manuelle';
    try {
      await ajouterReferenceExterne(c.demandeId as number, reference, { dossierId, source });
    } catch (e) {
      if (e instanceof ReferenceDejaEnregistreeError) return Response.json({ erreur: e.message }, { status: 409 });
      throw e;
    }
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes/reference] POST ajout impossible (503)', {
      demandeId: demandeCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
