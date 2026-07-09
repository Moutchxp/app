import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { trouverCompteParId, permsDuCompte } from '../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/comptes/[id] — détail d'un compte, état RÉEL en base (M3-4 Lot D). Administrateur uniquement
 * (double barrière : proxy `estAdministratif` + `exigerAdministrateur`). Renvoie prénom, nom, identifiant, rôle,
 * actif, dernière connexion, drapeau de première connexion et les 6 permissions EFFECTIVES. JAMAIS le hash.
 */
export async function GET(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });

  const c = await trouverCompteParId(Number(id));
  if (!c) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });

  return Response.json({
    compte: {
      id: c.id,
      identifiant: c.identifiant,
      prenom: c.prenom,
      nom: c.nom,
      role: c.role,
      actif: c.actif,
      derniere_connexion_a: c.derniere_connexion_a,
      doit_changer_mot_de_passe: c.doit_changer_mot_de_passe,
      perms: permsDuCompte(c),
    },
  });
}
