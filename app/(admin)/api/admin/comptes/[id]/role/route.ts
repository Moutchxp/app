import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { trouverCompteParId, promouvoirAdministrateur } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/role — change le rôle d'un compte (M3-4 Lot D). Administrateur uniquement.
 * SEULE transition autorisée : collaborateur → administrateur (R-B), qui force les 6 permissions à true.
 * R-C : un administrateur ne peut JAMAIS être rétrogradé → 403 RETROGRADATION_INTERDITE. Aucune fonction n'écrit
 * `role='collaborateur'` sur un compte existant : la rétrogradation est structurellement impossible.
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  const idNum = Number(id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 422 });
  }
  const role = (body as Record<string, unknown>)?.role;
  if (role !== 'administrateur' && role !== 'collaborateur') {
    return Response.json({ erreur: 'Rôle attendu : administrateur | collaborateur.' }, { status: 422 });
  }

  const c = await trouverCompteParId(idNum);
  if (!c) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });

  // R-C : rétrogradation d'un administrateur INTERDITE (« un administrateur reste administrateur »).
  if (c.role === 'administrateur' && role === 'collaborateur') {
    return Response.json({ erreur: 'RETROGRADATION_INTERDITE' }, { status: 403 });
  }
  if (c.role === role) return Response.json({ ok: true }); // idempotent : déjà dans le rôle demandé

  // Reste uniquement : collaborateur → administrateur (promotion atomique, perms forcées true).
  // Un résultat `false` signifie « la cible est DÉJÀ administrateur » (promotion concurrente ; aucune suppression
  // n'est possible — R-G) : l'état voulu est atteint → succès IDEMPOTENT, pas une erreur.
  await promouvoirAdministrateur(idNum, garde.auteurId);
  return Response.json({ ok: true });
}
