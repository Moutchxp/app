import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lirePreuvesDesabonnement, versCsvPreuveDesabo, journaliserExtraction } from '../../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes/preuve-desabonnements — DOSSIER DE PREUVE des désabonnements (accountability RGPD).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur` + fail-closed du proxy) — IDENTIQUE à l'export.
 * CONTENU : toutes les décisions BRUTES de consentement (LIGNE DE VIE : accord → retrait → ré-accord) des personnes
 * ayant ≥1 retrait ; jamais un état figé, jamais une liste noire. NOMINATIF (comme l'export) ; les effacés sortent en
 * colonnes d'identité VIDES — preuve que l'effacement fonctionne. INDÉPENDANT des filtres/statuts commerciaux.
 * ACCOUNTABILITY : journalisé (`internaute_extraction_log`, action 'export_preuve_desabo' — DISTINCTE de 'export_csv'
 * pour qu'un audit sépare un dossier de preuve d'un export marketing).
 *
 * ⚠️ DÉPENDANCE MIGRATION 043 : l'action 'export_preuve_desabo' n'est autorisée par le CHECK `internaute_extraction_log`
 * qu'après application de `db/migrations/043_extraction_log_preuve_desabo.sql`. Tant qu'elle n'est pas appliquée, le
 * `journaliserExtraction` viole le CHECK → cette route renvoie 503 (fail-closed) : aucun dossier ne sort SANS trace.
 * Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const lignes = await lirePreuvesDesabonnement();
    await journaliserExtraction(garde.auteurId, 'export_preuve_desabo', { nbLignes: lignes.length });

    // Un dossier de preuve est un INSTANTANÉ : la date d'extraction figure dans le nom du fichier (AAAA-MM-JJ).
    const jour = new Date().toISOString().slice(0, 10);
    return new Response(versCsvPreuveDesabo(lignes), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="preuve-desabonnements-${jour}.csv"`,
      },
    });
  } catch {
    return Response.json({ erreur: 'export indisponible' }, { status: 503 });
  }
}
