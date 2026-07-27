import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerDemandes, creerDemandes, changerStatutLot, IdentiteIncompleteError } from '../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes (chantier S7). GET = liste des demandes (+ champs d'identité manquants pour l'UI).
 * POST = CRÉE les demandes à partir des lots proposés (écriture, transaction par lot, destinataire figé). AUCUN ENVOI.
 * RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await listerDemandes());
  } catch {
    return Response.json({ erreur: 'liste indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const annee = new Date().getFullYear();
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    const res = await creerDemandes(await chargerConfigVeille(), annee, auteur);
    return Response.json(res);
  } catch {
    return Response.json({ erreur: 'création impossible' }, { status: 503 });
  }
}

/**
 * PATCH — ACTION GROUPÉE : transition de statut ('prete' | 'abandonnee') sur une liste d'ids, EN TOUT-OU-RIEN. Si
 * l'identité du demandeur est incomplète (pour 'prete'), 409 + champs, AUCUNE demande touchée. AUCUN ENVOI.
 */
export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const corps = (await request.json()) as { ids?: unknown; statut?: unknown };
    const ids = Array.isArray(corps.ids) ? corps.ids.filter((x): x is number => Number.isInteger(x)) : [];
    if (ids.length === 0 || (corps.statut !== 'prete' && corps.statut !== 'abandonnee')) {
      return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    }
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    try {
      await changerStatutLot(ids, corps.statut, auteur);
    } catch (e) {
      if (e instanceof IdentiteIncompleteError) return Response.json({ erreur: 'identité du demandeur incomplète', champs: e.champs }, { status: 409 });
      throw e;
    }
    return Response.json({ ok: true, traites: ids.length });
  } catch {
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
