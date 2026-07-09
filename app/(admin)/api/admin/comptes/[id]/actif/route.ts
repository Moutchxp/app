import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { reactiverCompte, desactiverCompte, trouverCompteParId } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/actif — active / désactive un compte (administrateur uniquement, double barrière).
 * Body : { actif: boolean }. Règle « DERNIER ADMINISTRATEUR ACTIF non désactivable » appliquée en ÉCRITURE
 * ATOMIQUE CONDITIONNELLE dans `desactiverCompte` (anti-TOCTOU). AUCUNE suppression — désactivation seule.
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) {
    // Entier positif CANONIQUE uniquement (rejette '5e2', '0x10', '007', négatifs…).
    return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  }
  const idNum = Number(id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 422 });
  }
  const actif = (body as Record<string, unknown>)?.actif;
  if (typeof actif !== 'boolean') {
    return Response.json({ erreur: 'Champ `actif` (booléen) attendu.' }, { status: 422 });
  }

  const modifie = actif
    ? await reactiverCompte(idNum, garde.auteurId)
    : await desactiverCompte(idNum, garde.auteurId);

  if (modifie) return Response.json({ ok: true });

  // Aucune ligne modifiée : distinguer 404 / idempotent / dernier administrateur (SELECT léger, hors écriture).
  const compte = await trouverCompteParId(idNum);
  if (!compte) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  if (compte.actif === actif) return Response.json({ ok: true }); // déjà dans l'état voulu (idempotent)
  // Reste le seul cas : désactivation bloquée car dernier administrateur actif.
  return Response.json({ erreur: 'DERNIER_ADMINISTRATEUR' }, { status: 409 });
}
