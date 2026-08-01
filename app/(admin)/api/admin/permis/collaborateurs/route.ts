import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCollaborateurs, creerCollaborateur, changerActivationCollaborateur } from '../../../../../lib/sitadel/demandeRepo';
import { problemesCollaborateur, resumeEligibilite } from '../../../../../lib/sitadel/collaborateur';

/**
 * /api/admin/permis/collaborateurs (chantier S8a) — gestion des signataires. GET = liste (compteurs) + bilan
 * d'éligibilité. POST = crée (validation server-side identique à l'écran ; refus ⇒ rien écrit). PATCH = (dé)active
 * (jamais de suppression). RÉSERVÉ ADMINISTRATEUR. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

async function etat() {
  const collaborateurs = await lireCollaborateurs();
  return { collaborateurs, eligibilite: resumeEligibilite(collaborateurs) };
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await etat());
  } catch {
    return Response.json({ erreur: 'collaborateurs indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 }); }
  const b = (typeof body === 'object' && body !== null ? body : {}) as { nom?: unknown; prenom?: unknown; fonction?: unknown; email?: unknown };
  const champs = {
    nom: typeof b.nom === 'string' ? b.nom : '',
    prenom: typeof b.prenom === 'string' ? b.prenom : '',
    fonction: typeof b.fonction === 'string' ? b.fonction : '',
    email: typeof b.email === 'string' ? b.email : '',
  };
  const problemes = problemesCollaborateur(champs);
  if (problemes.length > 0) return Response.json({ erreurs: problemes.map((message) => ({ message })) }, { status: 422 });
  try {
    const cree = await creerCollaborateur(champs);
    if (cree === null) return Response.json({ erreurs: [{ colonne: 'email', message: 'e-mail : déjà utilisé par un autre collaborateur' }] }, { status: 422 });
    return Response.json({ ok: true, ...(await etat()) });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const b = (await request.json()) as { id?: unknown; actif?: unknown };
    const id = Number(b.id);
    if (!Number.isInteger(id) || typeof b.actif !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    await changerActivationCollaborateur(id, b.actif);
    return Response.json({ ok: true, ...(await etat()) });
  } catch {
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
