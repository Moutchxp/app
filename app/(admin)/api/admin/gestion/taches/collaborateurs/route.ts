import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { invitesTacheDisponible, tachesDisponibles } from '../../../../../../lib/gestion/schema';
import { listerCollaborateurs } from '../../../../../../lib/gestion/tachesRepo';

/**
 * ══ 🔴 LOT TACHES-1 — À QUI CONFIER UNE TÂCHE ════════════════════════════════════════════════════════════════════
 *
 * 🔴 RÈGLE D'ARNO DU 13/10/2026 (remplace celle du lot 1) : tout compte ACTIF de l'application dont l'adresse est
 * dans NOTRE Workspace, MÊME sans l'accès Gestion (`peutRecevoirUneTache`). Moi en tête. Chaque personne porte
 * `accesGestion`, pour la mention « (sans accès Gestion — verra la tâche dans son agenda) ». Les noms seulement —
 * aucune adresse ne sort d'ici. ⚠️ CONSULTER cette liste exige toujours l'accès Gestion (garde ci-dessous).
 *
 * 🔴 LOT GESTION-INVITATIONS-TACHES — `invites` : la migration 365 est-elle là (plusieurs invités par tâche) ? Sans elle,
 * la fenêtre ne propose pas « Inviter aussi ».
 * 🔒 `exigerCompteActif(…, 'gestion')`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ etat: 'sans_schema' });
  const auteur = await auteurDeLaRequete(request);
  const moi = auteur.id === null ? null : Number(auteur.id);
  return Response.json(
    { etat: 'ok', collaborateurs: await listerCollaborateurs(moi), moi, invites: await invitesTacheDisponible() },
    { headers: { 'Cache-Control': 'private, no-store' } });
}
