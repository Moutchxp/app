import 'server-only';
import { exigerAdministrateur, exigerModule } from '../../../../../../../lib/admin/garde';
import { lireCleTelechargeable } from '../../../../../../../lib/sitadel/demandeRepo';
import { CACHE_PRIVE, enTetesPiecePermis, estSourcePiecePermis } from '../../../../../../../lib/permis/piecePermisServie';

/**
 * GET /admin/permis/piece/<source>/<id> — LES OCTETS D'UNE PIÈCE DE PERMIS, servis PAR L'APPLICATION.
 * (LOT PIECES-PERMIS-SERVIES-PAR-L-APPLICATION, 14/10/2026 — voir `lib/permis/piecePermisServie.ts`.)
 *
 * Remplace, pour l'écran comme pour les mails d'alerte, l'URL présignée S3 : en production MinIO n'écoute que sur
 * 127.0.0.1 et une telle URL est injoignable. Même règle que la Gestion (`api/admin/gestion/pieces/[id]`) : la clé de
 * stockage ne sort jamais, le droit est relu en base à CHAQUE ouverture, et rien n'est mis en cache.
 *
 * 🔒 LE MÊME DROIT QU'AVANT, SOURCE PAR SOURCE — aucun accès élargi, aucun retiré :
 *   · `reponse` (pièce reçue par e-mail) : n'était remise QUE par `api/admin/permis/reponses` → `exigerAdministrateur` ;
 *   · `dossier` (document du permis) : était remise aussi par `api/admin/permis/emprise` (`signer_piece`) → module
 *     `permis` (`exigerModule`), qui inclut l'administrateur.
 * Le proxy garde déjà `/admin/permis` (module `permis`) et, SANS session, redirige vers la page de connexion : c'est ce
 * qui rend un lien de mail utilisable. (Il n'existe pas de retour automatique à la pièce après connexion.)
 *
 * `inline` par défaut (visionneur PDF, `#page=N` ajouté par le client) ; `?telecharger=1` → `attachment` avec le nom
 * d'origine. Pièce inconnue et pièce jamais déposée donnent le même 404. Runtime Node (driver pg + client S3).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ source: string; id: string }> };

function erreur(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': CACHE_PRIVE } });
}

/** Même en-tête de cache sur le refus de la garde, sans toucher ni à son statut ni à son corps. */
function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', CACHE_PRIVE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const { source, id: brut } = await ctx.params;
  if (!estSourcePiecePermis(source)) return erreur('Pièce inconnue.', 404);

  const garde = source === 'reponse' ? await exigerAdministrateur(request) : await exigerModule(request, 'permis');
  if ('refus' in garde) return sansCache(garde.refus);

  if (!/^\d+$/.test(brut)) return erreur('Pièce inconnue.', 404);
  const id = Number(brut);
  if (!Number.isSafeInteger(id) || id <= 0) return erreur('Pièce inconnue.', 404);

  try {
    const piece = await lireCleTelechargeable(id, source);
    if (piece === null) return erreur('Cette pièce n’est pas disponible.', 404);
    const { recuperer } = await import('../../../../../../../lib/stockage'); // import dynamique : @aws-sdk hors du graphe statique
    const octets = await recuperer(piece.cle);
    const telecharger = new URL(request.url).searchParams.get('telecharger') === '1';
    return new Response(new Uint8Array(octets), {
      headers: enTetesPiecePermis({ nomFichier: piece.nomFichier, typeMime: piece.typeMime, telecharger }),
    });
  } catch (e) {
    console.error('[permis/piece] lecture impossible', (e as Error)?.name ?? 'Erreur');
    return erreur('Pièce indisponible : le stockage n’a pas répondu.', 503);
  }
}
