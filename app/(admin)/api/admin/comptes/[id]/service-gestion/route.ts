import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { definirServiceGestion } from '../../../../../../lib/admin/serviceGestion';
import { serviceGestionDisponible } from '../../../../../../lib/admin/schemaDroits';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/service-gestion — `{ valeur: true | false }` : coche ou décoche « Appartient au service
 * gestion » (LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE, migration 341). ADMINISTRATEUR UNIQUEMENT (double barrière :
 * proxy `estAdministratif` + `exigerAdministrateur`, qui relit le rôle EN BASE). Historisé (date, auteur, avant/après)
 * dans `admin_utilisateur_log`. Applicable à tout compte, administrateur compris.
 * 🔒 AUCUN DROIT n'en découle : ni la tuile Gestion, ni l'envoi. ALLOWLIST : seul `valeur` est lu.
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
  if (!(await serviceGestionDisponible())) {
    return Response.json({ erreur: 'Mise à jour de la base à appliquer (migration 341).' }, { status: 409 });
  }
  try {
    const ok = await definirServiceGestion(Number(id), valeur, garde.auteurId);
    if (ok) return Response.json({ ok: true });
    return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  } catch {
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
