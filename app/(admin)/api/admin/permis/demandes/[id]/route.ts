import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { lireDemande, majCorps, changerStatut, changerProfil, IdentiteIncompleteError, TransitionInterditeError } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes/[id] (chantier S7 / S7e). GET = détail (texte éditable + dossiers + destinataire figé).
 * PATCH = édite le corps/objet (brouillon), OU change le statut ('prete'|'abandonnee'), OU bascule le profil
 * ('entreprise'|'personne'). Passer 'prete' est BLOQUÉ (409 + champs) si l'identité DU PROFIL est incomplète ; basculer
 * le profil hors brouillon est BLOQUÉ (409 + raison). AUCUN ENVOI ('envoyee' non gérée ici). Runtime Node.
 */
export const runtime = 'nodejs';

async function idDe(context: { params: Promise<{ id: string }> }): Promise<number> {
  return Number((await context.params).id);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const d = await lireDemande(await idDe(context));
    if (!d) return Response.json({ erreur: 'demande introuvable' }, { status: 404 });
    return Response.json(d);
  } catch {
    return Response.json({ erreur: 'lecture impossible' }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const id = await idDe(context);
  if (!Number.isInteger(id)) return Response.json({ erreur: 'id invalide' }, { status: 400 });
  try {
    const corps = (await request.json()) as { corps?: unknown; objet?: unknown; statut?: unknown; profil?: unknown };
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    if (corps.profil === 'entreprise' || corps.profil === 'personne') {
      try {
        await changerProfil(id, corps.profil, auteur);
      } catch (e) {
        if (e instanceof TransitionInterditeError) return Response.json({ erreur: e.raison }, { status: 409 });
        throw e;
      }
    } else if (corps.statut === 'prete' || corps.statut === 'abandonnee') {
      try {
        await changerStatut(id, corps.statut, auteur);
      } catch (e) {
        if (e instanceof IdentiteIncompleteError) {
          return Response.json({ erreur: 'identité du demandeur incomplète', champs: e.champs }, { status: 409 });
        }
        throw e;
      }
    } else if (typeof corps.corps === 'string') {
      await majCorps(id, corps.corps, typeof corps.objet === 'string' ? corps.objet : null);
    } else {
      return Response.json({ erreur: 'rien à modifier' }, { status: 400 });
    }
    return Response.json(await lireDemande(id));
  } catch {
    return Response.json({ erreur: 'enregistrement impossible' }, { status: 503 });
  }
}
