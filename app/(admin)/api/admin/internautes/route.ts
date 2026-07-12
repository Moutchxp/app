import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireFiltres } from '../../../../lib/internaute/extraction';
import { lireProfilsFiltres } from '../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes — LISTE FILTRÉE paginée des profils recontactables (module Internaute, LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif en base). La route n'est
 * PAS déclarée dans `proxy.ts` → le défaut FAIL-CLOSED du proxy la réserve déjà à l'administrateur ; ce garde est
 * la seconde barrière (défense en profondeur, comme /api/admin/audit).
 *
 * INVARIANT : le repository JOINT `internaute_consentement_actif` (F1 actif) + exclut les opposés → seuls les
 * profils consentant au recontact remontent. Lecture SEULE (colonnes déjà persistées au LOT 2 ; moteur jamais
 * rappelé → golden intact). Aucun pont M2. Seul GET (aucune méthode mutante). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const url = new URL(request.url);
    const filtres = lireFiltres(url.searchParams);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const taille = Math.min(100, Math.max(1, Number(url.searchParams.get('taille')) || 25));

    const { total, lignes } = await lireProfilsFiltres(filtres, page, taille);
    return Response.json({ total, page, taille, lignes });
  } catch {
    return Response.json({ erreur: 'internautes indisponible' }, { status: 503 });
  }
}
