import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireFiltres, lireStatuts } from '../../../../lib/internaute/extraction';
import { lireProfilsFiltres, lireBornesDates } from '../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes — LISTE FILTRÉE paginée des profils (module Internaute, LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif en base). La route n'est
 * PAS déclarée dans `proxy.ts` → le défaut FAIL-CLOSED du proxy la réserve déjà à l'administrateur ; ce garde est
 * la seconde barrière (défense en profondeur, comme /api/admin/audit).
 *
 * INVARIANT : le repository contraint par l'INTERSECTION des statuts cochés (param `statuts`, validé/normalisé par
 * `lireStatuts`) — un `EXISTS(finalité active)` par statut, tous en AND (jamais un OR). Sélection VIDE → le repo
 * renvoie 0 résultat SANS requête (fail-closed : jamais toute la base). Lecture SEULE (colonnes déjà persistées ;
 * moteur jamais rappelé → golden intact). Aucun pont M2. Seul GET (aucune méthode mutante). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const url = new URL(request.url);
    const filtres = lireFiltres(url.searchParams);
    const statuts = lireStatuts(url.searchParams); // intersection des statuts cochés ; vide → repo fail-closed (0 résultat)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const taille = Math.min(100, Math.max(1, Number(url.searchParams.get('taille')) || 25));

    const { total, lignes } = await lireProfilsFiltres(filtres, page, taille, statuts);
    const bornes = await lireBornesDates(); // étendue temporelle de la base (bouton « depuis toujours »)
    return Response.json({ total, page, taille, lignes, bornes });
  } catch {
    return Response.json({ erreur: 'internautes indisponible' }, { status: 503 });
  }
}
