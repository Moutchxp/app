import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirStatutCompte } from '../../../../../../lib/admin/statutCompte';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/statut — `{ statut: 'associe' | 'salarie' | 'independant' | 'observateur' }` : le statut de la personne
 * (LOT P, migration 439). ADMINISTRATEUR UNIQUEMENT (proxy `estAdministratif` + `exigerAdministrateur`, rôle relu EN BASE). Chaque
 * changement est journalisé (`admin_utilisateur_log`, date, avant / après, auteur) ; revenir en arrière = choisir l'ancien statut. ALLOWLIST :
 * seul `statut` est lu. Sans la 439 : 409, rien n'est écrit.
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
    const r = await definirStatutCompte(Number(id), b.statut, garde.auteurId);
    if (r.ok) return Response.json({ ok: true, change: r.change });
    return Response.json({ erreur: r.motif }, { status: r.motif.includes('migration 439') ? 409 : r.motif === 'Compte introuvable.' ? 404 : 422 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
