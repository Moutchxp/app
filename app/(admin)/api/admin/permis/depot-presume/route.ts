import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { signalerDepotPresume, type BoutonCopie } from '../../../../../lib/veille/depotPresume';

/**
 * /api/admin/permis/depot-presume (LOT A) — le clic « copier » d'une demande téléservice CONSTATE un dépôt présumé (trace +
 * verrou d'unicité par commune). N'écrit JAMAIS demande.statut ni envoye_le → aucune échéance CRPA ne court. BEST-EFFORT : le
 * front n'attend PAS cette route (la copie clipboard a déjà réussi côté client) ; un échec ici n'empêche jamais le copier-coller.
 * Doublon de verrou (autre demande de la commune en vol) → 200 avec issue 'verrou_commune' (fait métier, pas une erreur).
 * Inattendu → 503 journalisé (jamais de catch muet). RÉSERVÉ ADMINISTRATEUR. Runtime Node (pg).
 */
export const runtime = 'nodejs';

const BOUTONS = new Set(['texte', 'ref']);

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json().catch(() => ({}))) as { demandeId?: unknown; bouton?: unknown };
    if (!Number.isInteger(c.demandeId)) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
    if (typeof c.bouton !== 'string' || !BOUTONS.has(c.bouton)) return Response.json({ erreur: 'bouton invalide' }, { status: 400 });
    const issue = await signalerDepotPresume(c.demandeId as number, c.bouton as BoutonCopie);
    return Response.json({ issue });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; code?: unknown; constraint?: unknown };
    console.error('[permis/depot-presume] POST impossible (503)', { name: err?.name, message: err?.message, code: err?.code, constraint: err?.constraint });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
