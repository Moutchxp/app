import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireFiltres, lireStatuts, lireModeConsentement } from '../../../../../lib/internaute/extraction';
import { compterProfils } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/compte — COMPTEUR LIVE des profils extractibles (module Internaute).
 *
 * Renvoie `{ total }` = nombre d'internautes correspondant à l'INTERSECTION des statuts cochés ∩ filtres secondaires,
 * soit EXACTEMENT ce que l'export CSV sortirait (mêmes builders `clauseStatuts` + `construireFiltres` que la liste /
 * l'export ; `q` de recherche non transmis → ignoré, comme l'export). Sert à afficher un compteur en direct pendant
 * l'édition des filtres, sans lancer d'export.
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif). Route absente de `proxy.ts`
 * → défaut fail-closed du proxy ; ce garde est la 2ᵉ barrière (comme /api/admin/internautes).
 *
 * INVARIANT FAIL-CLOSED : `compterProfils` court-circuite à `0` SANS requête si la sélection de statuts est vide
 * (jamais de comptage de toute la base sans contrainte de finalité), doublé du `WHERE false` de `clauseStatuts([])`.
 * Lecture SEULE (COUNT non mutant ; moteur jamais rappelé → golden intact). Aucun pont M2. Seul GET. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const url = new URL(request.url);
    const filtres = lireFiltres(url.searchParams); // `q` éventuel ignoré côté compteur (aligné export) : le front ne l'envoie pas
    const statuts = lireStatuts(url.searchParams); // statuts cochés ; vide → compterProfils renvoie 0 (fail-closed)
    const modeConsentement = lireModeConsentement(url.searchParams); // MÊME mode que l'export → compteur d'accord avec l'export

    const total = await compterProfils(filtres, statuts, modeConsentement);
    return Response.json({ total });
  } catch {
    return Response.json({ erreur: 'compteur indisponible' }, { status: 503 });
  }
}
