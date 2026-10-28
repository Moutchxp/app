import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirCommissionneCompte, MOTIF_SANS_441 } from '../../../../../../lib/admin/commissionneCompte';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/commissionne — `{ commissionne: true | false }` : « Commissionné / Non commissionné » d'un ADMINISTRATEUR
 * (LOT S, migration 441). ADMINISTRATEUR UNIQUEMENT (proxy `estAdministratif` + `exigerAdministrateur`, rôle relu EN BASE). Chaque
 * changement est journalisé (`admin_utilisateur_log`, date, avant / après, auteur) ; revenir en arrière = refaire l'autre choix. ALLOWLIST :
 * seul `commissionne` est lu. Un collaborateur : 422 (toujours commissionné). Sans la 441 : 409, rien n'est écrit.
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  try {
    const r = await definirCommissionneCompte(Number(id), b.commissionne, garde.auteurId);
    if (r.ok) return Response.json({ ok: true, change: r.change });
    return Response.json({ erreur: r.motif }, { status: r.motif === MOTIF_SANS_441 ? 409 : r.motif === 'Compte introuvable.' ? 404 : 422 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
