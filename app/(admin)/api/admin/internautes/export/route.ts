import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireFiltres, lireStatuts, lireModeConsentement } from '../../../../../lib/internaute/extraction';
import { lireProfilsExport, versCsv, journaliserExtraction } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/export — EXPORT CSV du résultat filtré (usage INTERNE SVAV, module Internaute LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur` + défaut fail-closed du proxy).
 * INVARIANT : même contrainte que la liste (`lireProfilsExport(filtres, statuts)`) → n'exporte QUE l'INTERSECTION des
 * statuts cochés (chacun un `EXISTS` en AND, jamais un OR) ; sélection VIDE → export vide (fail-closed, jamais toute
 * la base). MINIMISATION : colonnes strictement utiles (`COLONNES_EXPORT`). ACCOUNTABILITY : chaque export est
 * journalisé (`internaute_extraction_log`, action 'export_csv' + filtres + STATUTS + volume). Aucun pont M2. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const params = new URL(request.url).searchParams;
    const filtres = lireFiltres(params);
    const statuts = lireStatuts(params); // statuts cochés ; vide → export vide (fail-closed)
    const modeConsentement = lireModeConsentement(params); // combinaison des statuts : 'et' (défaut) | 'ou'
    const lignes = await lireProfilsExport(filtres, statuts, modeConsentement);
    await journaliserExtraction(garde.auteurId, 'export_csv', { filtres, nbLignes: lignes.length, statuts: `${statuts.join(',')} (${modeConsentement})` });

    return new Response(versCsv(lignes), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="internautes.csv"',
      },
    });
  } catch {
    return Response.json({ erreur: 'export indisponible' }, { status: 503 });
  }
}
