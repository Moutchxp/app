import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerArchives } from '../../../../../lib/sitadel/demandeRepo';

/**
 * A1a — /api/admin/permis/archives (GET) : liste des permis RENSEIGNÉS par les mairies (dossiers dont `satisfait_le` n'est
 * pas nul) + leurs pièces (MÉTADONNÉES seules ; la clé de stockage ne sort jamais — le téléchargement passe par l'action
 * `url_piece` de la route Réponses, seul endroit qui signe). RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). LECTURE
 * SEULE. AUCUNE écriture. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ archives: await listerArchives(await chargerConfigVeille()) });
  } catch (e) {
    // Jamais de catch muet : trace COMPLÈTE côté serveur (name/message/stack + champs pg), 503 générique au client.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/archives] GET indisponible (503)', {
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'archives indisponibles' }, { status: 503 });
  }
}
