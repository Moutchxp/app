import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirDroitCouts } from '../../../../../../lib/admin/droitCouts';
import { droitsD37Disponibles } from '../../../../../../lib/admin/schemaDroits';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/couts — `{ valeur: true | false }` : coche ou décoche « Les coûts » (onglet de Mon espace, D37, migration 454).
 * ADMINISTRATEUR UNIQUEMENT (proxy + `exigerAdministrateur`, relu en base). Journalisé dans `admin_utilisateur_log`. ALLOWLIST : seul `valeur`
 * est lu. Vaut pour tout compte, administrateur compris (la seule case qui le permet : décision d'Arno, option A).
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }
  const valeur = (body as Record<string, unknown> | null)?.valeur;
  if (typeof valeur !== 'boolean') return Response.json({ erreur: 'Réponse attendue : oui ou non.' }, { status: 422 });
  if (!(await droitsD37Disponibles())) {
    return Response.json({ erreur: 'Mise à jour de la base à appliquer (migration 454).' }, { status: 409 });
  }
  try {
    const ok = await definirDroitCouts(Number(id), valeur, garde.auteurId);
    if (ok) return Response.json({ ok: true });
    return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
