import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireFiltres, lireAxe } from '../../../../../lib/internaute/extraction';
import { lireProfilsExport, versCsv, journaliserExtraction } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/export — EXPORT CSV du résultat filtré (usage INTERNE SVAV, module Internaute LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur` + défaut fail-closed du proxy).
 * INVARIANT : même JOIN d'AXE que la liste (`lireProfilsExport(filtres, axe)`, défaut F1) → n'exporte QUE les
 * consentants ACTIFS de l'axe, jamais un OR entre finalités. MINIMISATION : colonnes strictement utiles au recontact
 * (`COLONNES_EXPORT`). ACCOUNTABILITY : chaque export est journalisé (`internaute_extraction_log`, action 'export_csv'
 * + filtres + AXE + volume). Aucun pont M2. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const params = new URL(request.url).searchParams;
    const filtres = lireFiltres(params);
    const axe = lireAxe(params); // population bornée à cet axe (défaut F1) ; validé, jamais arbitraire
    const lignes = await lireProfilsExport(filtres, axe);
    await journaliserExtraction(garde.auteurId, 'export_csv', { filtres, nbLignes: lignes.length, axe });

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
