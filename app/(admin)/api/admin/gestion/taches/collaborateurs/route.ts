import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { tachesDisponibles } from '../../../../../../lib/gestion/schema';
import { listerCollaborateurs } from '../../../../../../lib/gestion/tachesRepo';

/**
 * ══ 🔴 LOT TACHES-1 — À QUI CONFIER UNE TÂCHE ════════════════════════════════════════════════════════════════════
 *
 * Décision d'Arno : « confiée par défaut au collaborateur connecté, ou à un collègue choisi parmi les comptes ayant
 * l'accès Gestion. Pas de droit “Tâches” séparé. » D'où la liste : comptes ACTIFS, avec l'accès Gestion (ou
 * administrateurs, qui ont tous les accès). Les noms seulement — aucune adresse ne sort d'ici.
 *
 * 🔒 `exigerCompteActif(…, 'gestion')`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ etat: 'sans_schema' });
  const auteur = await auteurDeLaRequete(request);
  return Response.json(
    { etat: 'ok', collaborateurs: await listerCollaborateurs(), moi: auteur.id === null ? null : Number(auteur.id) },
    { headers: { 'Cache-Control': 'private, no-store' } });
}
