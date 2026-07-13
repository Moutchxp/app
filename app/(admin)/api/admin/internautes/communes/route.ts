import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCommunesPresentes } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/communes — RÉFÉRENCEMENT géo du sélecteur d'extraction (module Internaute).
 *
 * Renvoie la liste DYNAMIQUE des communes réellement présentes chez les consentants F1 : `[{ insee, nom, dept,
 * deptNom }]`, requêtée À CHAUD (aucune liste en dur). Sert à peupler le sélecteur département→commune du haut de
 * page. RÉSERVÉ RÔLE ADMINISTRATEUR (`exigerAdministrateur` + défaut fail-closed du proxy sur `/api/admin/internautes/*`
 * → aucune déclaration à ajouter dans proxy.ts). Lecture SEULE (DISTINCT sur le set F1 + jointure `adresse_ban` pour
 * le nom, via le pool applicatif — AUCUN import `app/lib/analytics/*`, cloisonnement M2 intact). Aucun pont M2. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    return Response.json({ communes: await lireCommunesPresentes() });
  } catch {
    return Response.json({ erreur: 'référencement communes indisponible' }, { status: 503 });
  }
}
