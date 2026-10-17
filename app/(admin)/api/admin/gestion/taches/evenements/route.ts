import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { evenementsTacheDisponible } from '../../../../../../lib/gestion/schema';
import { evenementsProposes } from '../../../../../../lib/gestion/tacheEvenementsRepo';

/**
 * ══ 🔴 LOT GESTION-TACHES-EVENEMENTS — LES ÉVÉNEMENTS EN COURS QU'ON PEUT RATTACHER À UNE TÂCHE ══════════════════
 *
 * `GET ?bien=<clé du bien>` → les événements EN COURS (d'après leur frise), ceux du bien d'abord (`duBien`), puis les
 * autres. Sans la migration 366 : `{ etat: 'sans_schema' }`, et la fenêtre n'affiche pas le sélecteur.
 * 🔒 `exigerCompteActif(…, 'gestion')`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!(await evenementsTacheDisponible())) return Response.json({ etat: 'sans_schema' });
  const bien = (new URL(request.url).searchParams.get('bien') ?? '').trim();
  try {
    return Response.json({ etat: 'ok', evenements: await evenementsProposes(bien === '' ? null : bien) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/taches/evenements] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
