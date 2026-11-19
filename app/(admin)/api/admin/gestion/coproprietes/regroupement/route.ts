import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { degrouper, ignorerProposition, propositionsDeLaListe, regrouper, regroupementDisponible, regroupementsEnCours } from '../../../../../../lib/gestion/regroupementCoproprietesRepo';

/**
 * /api/admin/gestion/coproprietes/regroupement — LES COPROPRIÉTÉS EN DOUBLE PAR VARIANTES D'ADRESSE (Arno, 19/11/2026, migration 504). Au droit
 * « Gestion », comme la liste.
 *   GET : les propositions (« Ces N fiches semblent être la même copropriété »), les regroupements en cours (« Dégrouper »), et si la 504 est là —
 *         LECTURE SEULE ;
 *   POST `{ action: 'regrouper', principale, cles }` / `{ action: 'degrouper', id }` / `{ action: 'ignorer', cles }` : sur un clic confirmé,
 *         refus avant toute écriture. JAMAIS de fusion automatique.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    const [propositions, regroupements, disponible] = await Promise.all([propositionsDeLaListe(), regroupementsEnCours(), regroupementDisponible()]);
    return Response.json({ etat: 'ok', data: { propositions, regroupements, disponible } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/regroupement] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try { corps = await request.json() as Record<string, unknown>; } catch { return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES }); }
  try {
    const auteur = await auteurDeLaRequete(request);
    if (corps.action === 'regrouper') {
      const r = await regrouper(corps, auteur);
      return Response.json(r.ok ? { etat: 'ok', data: { message: r.message, id: r.id } } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
    }
    if (corps.action === 'degrouper') {
      const r = await degrouper(corps, auteur);
      return Response.json(r.ok ? { etat: 'ok', data: { message: r.message } } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
    }
    if (corps.action === 'ignorer') {
      const r = await ignorerProposition(corps, auteur);
      return Response.json(r.ok ? { etat: 'ok', data: {} } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
    }
    return Response.json({ etat: 'refus', motif: 'Action inconnue.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/regroupement] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’est enregistré.' }, { status: 503, headers: ENTETES });
  }
}
