import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { estEmailValide } from '../../../../lib/admin/email';
import { genererMotDePasseTemporaire } from '../../../../lib/admin/motDePasseTemporaire';
import { creerCompteAdministration, listerComptes, ErreurCompte } from '../../../../lib/admin/comptes';
import type { RoleAdmin } from '../../../../lib/admin/session';

/**
 * Tuile Administratif (M3-4 Lot C). Namespace PLURIEL `/api/admin/comptes` (disjoint du self-service singulier
 * `/api/admin/compte/mot-de-passe`). DOUBLE BARRIÈRE : proxy.ts garde déjà par le rôle du JWS, ET chaque handler
 * revérifie le rôle EN BASE (`exigerAdministrateur`) — un jeton de 8 h peut porter un rôle rétrogradé.
 */

/** GET — liste des comptes (jamais le hash). Administrateur uniquement. */
export async function GET(request: Request) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const comptes = await listerComptes();
    return Response.json({ comptes });
  } catch {
    return Response.json({ erreur: 'Liste indisponible.' }, { status: 503 });
  }
}

/**
 * POST — création d'un compte. Administrateur uniquement. Génère un mot de passe TEMPORAIRE (CSPRNG), le hache,
 * crée le compte avec `doit_changer_mot_de_passe = true`, et RENVOIE LE CLAIR UNE SEULE FOIS dans la réponse.
 * Le clair n'est jamais journalisé (le journal ne porte que identifiant/rôle) ni renvoyé ailleurs.
 */
export async function POST(request: Request) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 422 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const identifiant = typeof b.identifiant === 'string' ? b.identifiant.trim() : '';
  const prenom = typeof b.prenom === 'string' ? b.prenom.trim() : '';
  const nom = typeof b.nom === 'string' ? b.nom.trim() : '';
  const role: RoleAdmin | null = b.role === 'administrateur' || b.role === 'collaborateur' ? b.role : null;
  const pb = (b.perms ?? {}) as Record<string, unknown>;

  if (!estEmailValide(identifiant)) {
    return Response.json({ erreur: 'Identifiant : adresse e-mail invalide.' }, { status: 422 });
  }
  if (prenom.length === 0 || nom.length === 0) {
    return Response.json({ erreur: 'Prénom et nom sont obligatoires.' }, { status: 422 });
  }
  if (role === null) {
    return Response.json({ erreur: 'Rôle attendu : administrateur | collaborateur.' }, { status: 422 });
  }

  const perms = {
    pilotage: pb.pilotage === true,
    cartes_annee: pb.cartes_annee === true,
    statistiques: pb.statistiques === true,
    internautes: pb.internautes === true,
    curation: pb.curation === true,
    banc_test: pb.banc_test === true,
  };

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  try {
    const compte = await creerCompteAdministration({
      identifiant, prenom, nom, role, perms, motDePasseClair: motDePasseTemporaire, auteurId: garde.auteurId,
    });
    // Le CLAIR n'est renvoyé QU'ICI, une seule fois. Aucun réaffichage possible → l'admin doit le transmettre.
    return Response.json({ compte, motDePasseTemporaire }, { status: 201 });
  } catch (e) {
    // ErreurCompte = message métier (identifiant pris, etc.) ; jamais le mot de passe dans l'erreur.
    if (e instanceof ErreurCompte) return Response.json({ erreur: e.message }, { status: 409 });
    return Response.json({ erreur: 'Création impossible.' }, { status: 500 });
  }
}
