import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirSocieteCompte } from '../../../../../../lib/admin/societeCompte';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { aujourdhuiParis } from '../../../../../../lib/location/suivi/suivi';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/societe — `{ societe: 'criterimmo' | 'macj', depuis?: 'AAAA-MM-JJ' }` : la société du collaborateur à
 * compter de `depuis` (aujourd'hui par défaut) — TRANSACTION, LOT D (migration 434). ADMINISTRATEUR UNIQUEMENT (double barrière : proxy
 * `estAdministratif` + `exigerAdministrateur`, qui relit le rôle EN BASE). Un changement AJOUTE une période datée et signée : le passé ne
 * change pas. ALLOWLIST : seuls `societe` et `depuis` sont lus. Sans la 434 : 409, rien n'est écrit.
 */
export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const depuis = typeof b.depuis === 'string' && b.depuis !== '' ? b.depuis : aujourdhuiParis();
  try {
    const r = await definirSocieteCompte(Number(id), b.societe, depuis, await auteurDeLaRequete(request));
    if (r.ok) return Response.json({ ok: true, change: r.change });
    return Response.json({ erreur: r.motif }, { status: /migration 43[48]/.test(r.motif) ? 409 : r.motif === 'Compte introuvable.' ? 404 : 422 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
