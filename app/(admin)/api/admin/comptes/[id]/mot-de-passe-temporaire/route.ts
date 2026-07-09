import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { genererMotDePasseTemporaire } from '../../../../../../lib/admin/motDePasseTemporaire';
import { regenererMotDePasseTemporaire, ErreurCompte } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/mot-de-passe-temporaire — régénère un mot de passe TEMPORAIRE (administrateur
 * uniquement, double barrière). Repose `doit_changer_mot_de_passe = true`. RENVOIE LE CLAIR UNE SEULE FOIS ;
 * jamais journalisé (le journal ne porte que l'action), jamais réaffichable. C'est l'issue si le clair de
 * création a été perdu (onglet fermé).
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

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  try {
    await regenererMotDePasseTemporaire(idNum, motDePasseTemporaire, garde.auteurId);
    return Response.json({ motDePasseTemporaire });
  } catch (e) {
    if (e instanceof ErreurCompte) return Response.json({ erreur: e.message }, { status: 404 });
    return Response.json({ erreur: 'Régénération impossible.' }, { status: 500 });
  }
}
