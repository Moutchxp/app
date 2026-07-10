import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { modifierIdentite, ErreurCompte } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/identite — modifie le PRÉNOM et le NOM d'un compte (M3-4 Lot F2, F-2).
 * Administrateur uniquement (double barrière : proxy `estAdministratif` + `exigerAdministrateur` qui relit le rôle
 * EN BASE). Applicable à n'importe quel compte, y compris un autre administrateur.
 *
 * ⚠️ IDENTIFIANT IMMUABLE (F-1) : ALLOWLIST STRICTE — on ne lit QUE `prenom` et `nom` du corps ; tout autre champ
 * (dont `identifiant`) est IGNORÉ silencieusement. `modifierIdentite` ne SET jamais `identifiant`. Aucun chemin,
 * ici comme ailleurs, n'écrit l'adresse e-mail.
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
  const b = (body ?? {}) as Record<string, unknown>;
  // ALLOWLIST : seuls prenom et nom sont lus. `identifiant` et tout autre champ éventuel ne sont jamais consultés.
  const prenom = typeof b.prenom === 'string' ? b.prenom.trim() : '';
  const nom = typeof b.nom === 'string' ? b.nom.trim() : '';
  if (prenom.length === 0 || nom.length === 0) {
    return Response.json({ erreur: 'Prénom et nom sont obligatoires.' }, { status: 422 });
  }

  try {
    const ok = await modifierIdentite(idNum, prenom, nom, garde.auteurId);
    if (ok) return Response.json({ ok: true });
    return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  } catch (e) {
    if (e instanceof ErreurCompte) return Response.json({ erreur: e.message }, { status: 422 });
    return Response.json({ erreur: 'Modification impossible.' }, { status: 500 });
  }
}
