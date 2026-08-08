import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';

/**
 * /api/admin/permis/reponses (chantier R5a) — GET agrégé, LECTURE SEULE, pour l'écran « Réponses » : état de la relève
 * (releve_run), suivi des demandes envoyées (échéances), file « à rattacher » et relances préparées. AUCUNE écriture.
 * RÉSERVÉ ADMINISTRATEUR (même garde que les routes voisines). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await chargerSuiviReponses());
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (jamais de catch muet) : sans elle, un bug (colonne absente, 42703…) reste
    // invisible des deux côtés. La réponse HTTP au client reste un 503 générique.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/reponses] GET suivi indisponible (503)', {
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}
