import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import {
  deplacerMessage, deplacerMessageVersNouveau, evenementDuMail, remettreMessage, type NouvelEvenement,
} from '../../../../../../../lib/gestion/gestes';
import { deplacementsDeMailsDisponibles } from '../../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/messages/[id]/affectation (lot 4d-B2) — DÉPLACER UN SEUL MAIL vers une autre carte que son
 * échange, et le REMETTRE.
 *
 * POST déplace (le mail reste dans son fil, en base : seul son rattachement change). DELETE le remet dans son échange.
 * Les deux sont journalisés, et le second existe précisément pour que le premier ne soit pas une porte sans retour.
 *
 * 503 EXPLICITE tant que la migration 234 n'est pas appliquée : mieux vaut dire « pas encore disponible » que laisser
 * une requête échouer sur une colonne absente avec un message de base de données.
 *
 * 🔒 `exigerCompteActif` relit la base à chaque appel. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

function messageId(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const PAS_ENCORE = 'Le déplacement d’un mail seul n’est pas encore activé sur cette base (migration 234 à appliquer).';

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — L'ÉVÉNEMENT EFFECTIF DE CE MAIL, pour le bloc « Événement rattaché ».
 *
 * `null` se lit « aucun », et c'est une RÉPONSE : l'événement est FACULTATIF (règle du lot STATUT-HORS-GESTION),
 * il ne change jamais la capsule de statut, qui dépend du bien.
 */
export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = messageId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });
  try {
    return Response.json({ etat: 'ok', evenement: await evenementDuMail(id) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : « aucun » se lirait « pas d'événement », ce qui serait un mensonge.
    console.error('[gestion/message] lecture de l’événement impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = messageId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });

  let corps: { evenementId?: unknown; nouveau?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Demande illisible.' }, { status: 422 }); }
  const evenementId = corps.evenementId;
  /**
   * 🔴 LOT CONTACTS-ET-EVENEMENT — CE VERBE OUVRE AUSSI UNE CARTE NEUVE (`nouveau`), pour la portée « ce mail
   * seul » du bloc « Événement rattaché ». En DEUX appels — créer puis lier —, un échec du second laisserait une
   * carte vide que personne n'a demandée ; `deplacerMessageVersNouveau` fait les deux dans UNE transaction.
   */
  const nouveau = corps.nouveau && typeof corps.nouveau === 'object'
    ? (corps.nouveau as NouvelEvenement) : undefined;
  const versExistant = Number.isInteger(evenementId) && (evenementId as number) > 0;
  if (!versExistant && nouveau === undefined) {
    return Response.json(
      { erreur: 'Indiquez l’événement de destination, ou donnez un objet au nouvel événement.' }, { status: 400 });
  }

  try {
    if (!(await deplacementsDeMailsDisponibles())) return Response.json({ erreur: PAS_ENCORE }, { status: 503 });
    const auteur = await auteurDeLaRequete(request);
    const issue = versExistant
      ? await deplacerMessage(id, evenementId as number, auteur)
      : await deplacerMessageVersNouveau(id, nouveau as NouvelEvenement, auteur);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, reference: issue.reference, evenementId: issue.evenementId });
  } catch (e) {
    console.error('[gestion/message] déplacement impossible', e);
    return Response.json({ erreur: 'Déplacement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function DELETE(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = messageId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });
  try {
    if (!(await deplacementsDeMailsDisponibles())) return Response.json({ erreur: PAS_ENCORE }, { status: 503 });
    const issue = await remettreMessage(id, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/message] remise impossible', e);
    return Response.json({ erreur: 'Remise impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
