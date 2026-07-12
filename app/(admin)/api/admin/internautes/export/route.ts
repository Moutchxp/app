import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireFiltres } from '../../../../../lib/internaute/extraction';
import { lireProfilsExport, versCsv, journaliserExtraction } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/export — EXPORT CSV du résultat filtré (usage INTERNE SVAV, module Internaute LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur` + défaut fail-closed du proxy).
 * INVARIANT : même JOIN F1 actif que la liste (`lireProfilsExport`) → n'exporte QUE les consentants au recontact.
 * MINIMISATION : colonnes strictement utiles au recontact (`COLONNES_EXPORT`). ACCOUNTABILITY : chaque export est
 * journalisé (`internaute_extraction_log`, action 'export_csv' + filtres + volume). Aucun pont M2. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const filtres = lireFiltres(new URL(request.url).searchParams);
    const lignes = await lireProfilsExport(filtres);
    await journaliserExtraction(garde.auteurId, 'export_csv', { filtres, nbLignes: lignes.length });

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
