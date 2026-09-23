import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { affecter, detacher, listerEvenementsOuverts, preremplir, type NouvelEvenement } from '../../../../../../../lib/gestion/gestes';

/**
 * /api/admin/gestion/fils/[id]/affectation (lot 4b) — RATTACHER un échange à un événement, ou l'en DÉTACHER.
 *
 * Les deux verbes sont SYMÉTRIQUES et c'est voulu : ce qui se fait d'un clic doit se défaire d'un clic. POST rattache
 * (à un événement existant, ou à un nouveau qu'il crée), DELETE détache — l'échange revient alors dans la file. Aucune
 * suppression dans les deux cas : l'affectation défaite reste en base, inactive et datée.
 *
 * 🔒 GARDE D'ÉCRITURE : `exigerCompteActif` relit l'état RÉEL du compte EN BASE à chaque appel — un droit retiré coupe
 * l'accès au prochain clic, sans attendre l'expiration du jeton (8 h). Le proxy a déjà refusé le préfixe en amont.
 * GET sert le sélecteur (événements ouverts + pré-remplissage) : même garde, car il lit des données de gestion.
 *
 * Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

/** Identifiant d'échange lu dans l'URL. Refus PROPRE si ce n'est pas un entier positif — jamais un NaN jusqu'à la base. */
function filId(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Le sélecteur de l'écran : les événements ouverts, et ce qu'on sait déjà de l'échange pour pré-remplir une carte. */
export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = filId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    const [evenements, propositions] = await Promise.all([listerEvenementsOuverts(), preremplir(id)]);
    return Response.json({ evenements, propositions });
  } catch (e) {
    console.error('[gestion/affectation] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = filId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });

  let corps: { evenementId?: unknown; nouveau?: unknown; motif?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  const evenementId = typeof corps.evenementId === 'number' && Number.isInteger(corps.evenementId) && corps.evenementId > 0
    ? corps.evenementId : undefined;
  const nouveau = corps.nouveau && typeof corps.nouveau === 'object' ? (corps.nouveau as NouvelEvenement) : undefined;

  try {
    const issue = await affecter(id, { evenementId, nouveau }, await auteurDeLaRequete(request), corps.motif as string | undefined);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, evenementId: issue.evenementId, reference: issue.reference });
  } catch (e) {
    console.error('[gestion/affectation] rattachement impossible', e);
    return Response.json({ erreur: 'Rattachement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function DELETE(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = filId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    const issue = await detacher(id, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/affectation] détachement impossible', e);
    return Response.json({ erreur: 'Détachement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
