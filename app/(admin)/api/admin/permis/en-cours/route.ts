import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerDemandesSuivi } from '../../../../../lib/veille/reponsesSuivi';

/**
 * T6-A — /api/admin/permis/en-cours : GET LECTURE SEULE de la donnée riche par demande ENVOYÉE/CLOSE (échéance + retour mairie +
 * dossiers), via la SOURCE UNIQUE `chargerDemandesSuivi` partagée avec l'écran « Réponses ». L'onglet « En cours » la consomme
 * pour le compte à rebours, la colonne « Retour mairie » et les actions du détail. Les ACTIONS elles-mêmes réutilisent la route
 * POST /reponses existante (aucune 2e implémentation). RÉSERVÉ ADMINISTRATEUR (même garde que les routes voisines). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await chargerDemandesSuivi());
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (jamais de catch muet). La réponse HTTP au client reste un 503 générique.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/en-cours] GET suivi indisponible (503)', {
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}
