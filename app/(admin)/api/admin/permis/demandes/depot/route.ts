import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { listerADeposer, marquerDeposee, DepotInterditError } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes/depot (chantier S16). GET = demandes en canal 'formulaire' encore à déposer à la main sur le
 * téléservice de la commune (texte figé + URL). POST = marque une demande comme DÉPOSÉE (statut 'envoyee'). RÉSERVÉ
 * ADMINISTRATEUR (proxy fail-closed + garde). AUCUN envoi automatique. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ demandes: await listerADeposer() });
  } catch {
    return Response.json({ erreur: 'liste indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json()) as { id?: unknown };
    if (!Number.isInteger(c.id)) return Response.json({ erreur: 'id invalide' }, { status: 400 });
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    try {
      await marquerDeposee(c.id as number, auteur);
    } catch (e) {
      if (e instanceof DepotInterditError) return Response.json({ erreur: e.raison }, { status: 409 });
      throw e;
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
