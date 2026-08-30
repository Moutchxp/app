import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerReponseLibre, depsReellesReponse } from '../../../../../lib/permis/demanderPiecesRepo';

/**
 * FIL-B — /api/admin/permis/repondre : RÉPONSE LIBRE à UN message reçu choisi, DANS SON FIL. POST {reponseId, objet, corps} → envoi
 * MANUEL verbatim (validation vide/HTML/no-reply/multi-dossiers dans l'orchestrateur). RÉSERVÉ ADMINISTRATEUR. Aucun envoi auto. Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const body = (await request.json().catch(() => ({}))) as { reponseId?: unknown; objet?: unknown; corps?: unknown };
  const reponseId = Number(body.reponseId);
  if (!Number.isInteger(reponseId) || reponseId <= 0) return Response.json({ erreur: 'reponseId invalide' }, { status: 400 });
  const objet = typeof body.objet === 'string' ? body.objet : '';
  const corps = typeof body.corps === 'string' ? body.corps : '';
  try {
    const r = await executerReponseLibre(depsReellesReponse(), { reponseId, objet, corps, auteur: 'admin:decision' });
    return r.ok ? Response.json(r) : Response.json({ erreur: r.motif ?? 'réponse impossible' }, { status: 422 });
  } catch (e) {
    console.error('[permis/repondre] POST échec', e);
    return Response.json({ erreur: 'réponse impossible' }, { status: 503 });
  }
}
