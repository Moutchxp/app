import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { evenementsEnCoursDesBiens } from '../../../../../../lib/gestion/historiqueBienRepo';

/**
 * /api/admin/gestion/evenements/des-biens?biens=27,315 — 🔴 LOT COMPOSEUR-FENETRE-COMPLETE : les événements EN COURS
 * des biens cochés dans la fenêtre « Bien(s) rattaché(s) à ce mail » du composeur (mail pas encore envoyé). LECTURE
 * SEULE. Même forme que `lus.duBien` de `/messages/<id>/affectation`, lue par le même bloc d'écran.
 *
 * 🔒 `exigerCompteActif` relit la base à chaque appel. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const biens = (new URL(request.url).searchParams.get('biens') ?? '')
    .split(',').map((c) => c.trim()).filter((c) => c !== '' && c.length <= 200).slice(0, 20);
  try {
    const duBien = biens.length === 0 ? [] : await evenementsEnCoursDesBiens(biens);
    return Response.json({ etat: 'ok', duBien }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/evenements/des-biens] lecture impossible', e);
    return Response.json({ etat: 'erreur', erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
