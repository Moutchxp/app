import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { trouverCompteParId, modifierPermissions } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/permissions — modifie les 6 permissions d'un COLLABORATEUR (M3-4 Lot D).
 * Administrateur uniquement (double barrière). L'écriture est atomique/conditionnelle (`WHERE role='collaborateur'`
 * dans `modifierPermissions`) : un administrateur (perms implicites) est refusé (409). Journal `changement_permissions`.
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
  const pb = ((body as Record<string, unknown>)?.perms ?? {}) as Record<string, unknown>;
  const perms = {
    pilotage: pb.pilotage === true,
    cartes_annee: pb.cartes_annee === true,
    statistiques: pb.statistiques === true,
    internautes: pb.internautes === true,
    curation: pb.curation === true,
    banc_test: pb.banc_test === true,
  };

  const ok = await modifierPermissions(idNum, perms, garde.auteurId);
  if (ok) return Response.json({ ok: true });

  // 0 ligne : compte absent, ou administrateur (permissions implicites, non éditables).
  const c = await trouverCompteParId(idNum);
  if (!c) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  return Response.json({ erreur: 'PERMS_ADMIN_IMPLICITES' }, { status: 409 });
}
