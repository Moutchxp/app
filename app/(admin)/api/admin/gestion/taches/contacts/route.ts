import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { contactsTacheDisponible, tachesDisponibles } from '../../../../../../lib/gestion/schema';
import { contactsDuBienPourTache } from '../../../../../../lib/gestion/contactsTacheRepo';

/**
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS DU BIEN, POUR LA FENÊTRE D'UNE TÂCHE ════════════════════════════════════
 *
 * `GET ?bien=<id du lot>` → les contacts de la fiche du bien, famille par famille (propriétaires, locataires en place
 * et anciens, leurs contacts, syndic & immeuble, tiers indépendants, non affectés), avec TOUTES leurs coordonnées et
 * leurs libellés. Lecture seule ; demandée à l'ouverture de la fenêtre, jamais avec les listes.
 *
 * ⚠️ SANS LA MIGRATION 347 : `{ etat: 'sans_schema' }`, et la section ne s'affiche pas.
 * 🔒 `exigerCompteActif(…, 'gestion')`. `private, no-store` : la réponse porte des coordonnées de personnes.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!(await tachesDisponibles()) || !(await contactsTacheDisponible())) return Response.json({ etat: 'sans_schema' });
  const lotId = Number((new URL(request.url).searchParams.get('bien') ?? '').trim());
  if (!Number.isInteger(lotId) || lotId <= 0) return Response.json({ erreur: 'Bien inconnu.' }, { status: 400 });
  try {
    return Response.json(
      { etat: 'ok', contacts: await contactsDuBienPourTache(lotId) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[api/admin/gestion/taches/contacts] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
