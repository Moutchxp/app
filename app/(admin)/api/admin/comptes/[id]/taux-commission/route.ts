import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirTauxCommissionCompte, MOTIF_SANS_462 } from '../../../../../../lib/admin/tauxCommissionCompte';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/taux-commission — `{ taux: 0…100 | '' | null }` : le taux de commission du collaborateur, dans son profil
 * (Mon espace, Arno 07/11/2026, migration 462) ; vide : non renseigné (50 % par défaut). ADMINISTRATEUR UNIQUEMENT (proxy `estAdministratif` +
 * `exigerAdministrateur`, rôle relu EN BASE). Chaque changement est journalisé (`admin_utilisateur_log`, date, avant / après, auteur).
 * ALLOWLIST : seul `taux` est lu. Hors bornes : 422. Sans la 462 : 409, rien n'est écrit.
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
    const r = await definirTauxCommissionCompte(Number(id), b.taux, garde.auteurId);
    if (r.ok) return Response.json({ ok: true, change: r.change });
    return Response.json({ erreur: r.motif }, { status: r.motif === MOTIF_SANS_462 ? 409 : r.motif === 'Compte introuvable.' ? 404 : 422 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
