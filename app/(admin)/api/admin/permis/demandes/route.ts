import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerDemandes, creerDemandes } from '../../../../../lib/sitadel/demandeRepo';

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
