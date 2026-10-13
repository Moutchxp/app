import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { tachesDisponibles } from '../../../../../lib/gestion/schema';
import { verifierSaisie, lireSaisie } from '../../../../../lib/gestion/taches';
import { creerTache, listerTaches } from '../../../../../lib/gestion/tachesRepo';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES : LIRE, CRÉER ════════════════════════════════════════════════════════════════
 *
 * `GET  ?bien=<id du lot>` → les tâches de ce bien ; sans `bien` → celles de TOUS les biens (récapitulatif
 *                            général). Rend aussi `moi` (l'identifiant du compte connecté) pour le filtre
 *                            « Les miennes » et le choix par défaut « confiée à moi ».
 * `POST { lotId, objet, jour, heure?, note?, confieeA, evenementId?, rappels }` → crée la tâche.
 *
 * ⚠️ SANS LA MIGRATION 346 : `{ etat: 'sans_schema' }`, et l'écran n'affiche rien — ni bouton, ni récapitulatif.
 * 🔒 `exigerCompteActif(…, 'gestion')`. Aucun appel Google. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ etat: 'sans_schema' });
  const brut = (new URL(request.url).searchParams.get('bien') ?? '').trim();
  const lotId = brut === '' ? null : Number(brut);
  if (lotId !== null && (!Number.isInteger(lotId) || lotId <= 0)) {
    return Response.json({ erreur: 'Bien inconnu.' }, { status: 400 });
  }
  const auteur = await auteurDeLaRequete(request);
  const { taches, tronque } = await listerTaches(lotId);
  return Response.json(
    { etat: 'ok', taches, tronque, moi: auteur.id === null ? null : Number(auteur.id) },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) {
    return Response.json({ erreur: 'Les tâches ne sont pas encore installées (migration 346).' }, { status: 503 });
  }
  const corps = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lotId = Number(corps.lotId);
  if (!Number.isInteger(lotId) || lotId <= 0) return Response.json({ erreur: 'Bien inconnu.' }, { status: 400 });
  const saisie = lireSaisie(corps);
  const refusSaisie = verifierSaisie(saisie);
  if (refusSaisie !== null) return Response.json({ erreur: refusSaisie.message, champ: refusSaisie.champ }, { status: 400 });
  const issue = await creerTache(lotId, saisie, await auteurDeLaRequete(request));
  if (!issue.ok) return Response.json({ erreur: issue.motif, champ: issue.champ ?? null }, { status: issue.statut });
  return Response.json({ etat: 'ok', id: issue.id, message: 'Tâche créée.' });
}
