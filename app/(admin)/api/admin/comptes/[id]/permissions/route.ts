import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { trouverCompteParId, modifierPermissions } from '../../../../../../lib/admin/comptes';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/comptes/[id]/permissions — modifie les 6 permissions d'un COLLABORATEUR (M3-4 Lot D).
 * Administrateur uniquement (double barrière). L'écriture est atomique/conditionnelle (`WHERE role='collaborateur'`
 * dans `modifierPermissions`) : un administrateur (perms implicites) est refusé (409). Journal `changement_permissions`.
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
  const pb = ((body as Record<string, unknown>)?.perms ?? {}) as Record<string, unknown>;
  const perms = {
    pilotage: pb.pilotage === true,
    cartes_annee: pb.cartes_annee === true,
    statistiques: pb.statistiques === true,
    internautes: pb.internautes === true,
    curation: pb.curation === true,
    banc_test: pb.banc_test === true,
    permis: pb.permis === true, // RATT-EDIT (lot A2) — module « Permis de construire »
    gestion: pb.gestion === true, // GESTION (lot 2) — module « Gestion »
  };

  /**
   * 🔴 LOT 5-DROITS — LA RÉPONSE SUR L'ENVOI EST OBLIGATOIRE DÈS QUE LA TUILE GESTION EST COCHÉE (décision b d'Arno), et
   * ce refus vit ICI, côté SERVEUR, pas seulement dans l'écran. Un écran qui oblige est un confort ; une route qui refuse
   * est une garantie — et c'est la seule qui tienne face à un appel direct ou à un formulaire rejoué.
   *
   * On n'accepte QUE `true` ou `false`. Ni `undefined`, ni `null`, ni une chaîne : « à décider » n'est pas une réponse
   * qu'on enregistre volontairement, c'est l'état de ceux à qui on n'a jamais posé la question.
   */
  const envoiBrut = (body as Record<string, unknown>)?.gestion_envoi;
  const envoi = envoiBrut === true ? true : envoiBrut === false ? false : null;
  if (perms.gestion && envoi === null) {
    return Response.json({
      erreur: 'Pour donner l’accès à la tuile Gestion, il faut répondre à la question « Peut envoyer des mails au nom de gestion@criterimmo.fr » : oui ou non.',
      champ: 'gestion_envoi',
    }, { status: 422 });
  }

  // La VALIDATION est faite AVANT toute écriture — jamais après (piège `withTransaction`, qui COMMITE au retour normal).
  const ok = await modifierPermissions(idNum, perms, (body as Record<string, unknown>)?.permis_modif === true, garde.auteurId, envoi); // RATT-EDIT lot A3 — sous-droit lu au niveau racine (forcé false si perms.permis off, côté repo)
  if (ok) return Response.json({ ok: true });

  // 0 ligne : compte absent, ou administrateur (permissions implicites, non éditables).
  const c = await trouverCompteParId(idNum);
  if (!c) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });
  return Response.json({ erreur: 'PERMS_ADMIN_IMPLICITES' }, { status: 409 });
}
