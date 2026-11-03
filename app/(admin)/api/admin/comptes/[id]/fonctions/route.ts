import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { definirFonctions, estFonction, lireFonctions } from '../../../../../../lib/admin/fonctionsCompte';
import { fonctionsComptesDisponible } from '../../../../../../lib/admin/schemaDroits';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 🔴 « Les coûts », lot 2 (Arno, 03/11/2026, décision C9, migration 451) — les FONCTIONS d'un profil (vente / location / gestion, plusieurs).
 *   GET  : les fonctions du compte ; POST `{ fonctions: [...] }` : les pose (journalisé, avant / après, auteur).
 * ADMINISTRATEUR UNIQUEMENT (proxy + `exigerAdministrateur`, relu en base). Aucun droit n'en découle. ALLOWLIST : seul `fonctions` est lu.
 */
export async function GET(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  try { return Response.json(await lireFonctions(Number(id))); } catch { return Response.json({ erreur: 'Lecture impossible.' }, { status: 500 }); }
}

export async function POST(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }
  const fonctions = (body as Record<string, unknown> | null)?.fonctions;
  if (!Array.isArray(fonctions) || !fonctions.every(estFonction)) return Response.json({ erreur: 'Fonctions attendues : vente, location, gestion.' }, { status: 422 });
  if (!(await fonctionsComptesDisponible())) return Response.json({ erreur: 'Mise à jour de la base à appliquer (migration 451).' }, { status: 409 });
  try {
    const auteur = await auteurDeLaRequete(request);
    const r = await definirFonctions(Number(id), fonctions, garde.auteurId, auteur.libelle);
    return r.ok ? Response.json({ ok: true, change: r.change }) : Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
