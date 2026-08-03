import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { profilValide, validerIdsLot } from '../../../../../lib/sitadel/demande';
import { listerDemandes, creerDemandes, changerStatutLot, changerProfilLot, IdentiteIncompleteError, TransitionInterditeError } from '../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes (chantier S7 / S7e). GET = liste des demandes (+ alertes d'identité ciblées par profil).
 * POST = CRÉE les demandes à partir des lots proposés, pour un PROFIL (défaut config_veille.profil_demandeur_defaut).
 * PATCH = ACTION GROUPÉE tout-ou-rien : transition de statut ('prete'|'abandonnee') OU bascule de profil
 * ('entreprise'|'personne'). AUCUN ENVOI. RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
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
    const corps = (await request.json().catch(() => ({}))) as { profil?: unknown };
    const profil = corps.profil === undefined ? undefined : profilValide(corps.profil);
    const annee = new Date().getFullYear();
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    const res = await creerDemandes(await chargerConfigVeille(), annee, auteur, profil);
    return Response.json(res);
  } catch {
    return Response.json({ erreur: 'création impossible' }, { status: 503 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const corps = (await request.json()) as { ids?: unknown; statut?: unknown; profil?: unknown };
    // Erreur EXPLICITE si des id étaient fournis mais tous invalides (ex. bigint sérialisé en chaîne) — jamais un succès à 0.
    const v = validerIdsLot(corps.ids);
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });
    const ids = v.ids;
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);

    // Bascule de profil (action groupée « Basculer la sélection en… »).
    if (corps.profil === 'entreprise' || corps.profil === 'personne') {
      try {
        await changerProfilLot(ids, corps.profil, auteur);
      } catch (e) {
        if (e instanceof TransitionInterditeError) return Response.json({ erreur: e.raison }, { status: 409 });
        throw e;
      }
      return Response.json({ ok: true, traites: ids.length });
    }

    // Transition de statut.
    if (corps.statut !== 'prete' && corps.statut !== 'abandonnee') {
      return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    }
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
