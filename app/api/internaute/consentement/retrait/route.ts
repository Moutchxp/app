import 'server-only';
import { verifierJetonRetrait } from '../../../../lib/internaute/jetonRectification';
import { retirerConsentement } from '../../../../lib/internaute/cycleVie';

/**
 * POST /api/internaute/consentement/retrait — RETRAIT du consentement e-mail (voie DÉSABONNEMENT, hors tunnel).
 * Route PUBLIQUE (hors `/api/admin/`), geste de l'INTERNAUTE lui-même — calquée sur `api/internaute/rectification`.
 *
 * SÉCURITÉ :
 *  - l'id de l'internaute est extrait du JETON-CAPACITÉ de retrait (scope `withdraw-consent`), JAMAIS du corps ;
 *  - la finalité est FORCÉE EN DUR côté serveur (`email_marketing`) — jamais lue du corps : ce lien ne peut retirer
 *    QUE F2, il ne touche ni F1 ni F3, et ne peut RIEN accorder (`retirerConsentement` n'insère que 'retire').
 * `auteurId = null` (pas un admin) ; `canal = 'email'` (on ne ment pas sur la provenance de la preuve).
 * Le GET d'atterrissage (`/desabonner`) n'écrit rien ; SEUL ce POST explicite retire. Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, erreur: 'corps JSON invalide' }, { status: 422 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ ok: false, erreur: 'corps invalide' }, { status: 422 });
  }
  const b = body as Record<string, unknown>;

  // 1) Autorisation par jeton-capacité de RETRAIT : l'id agi vient du `sub` vérifié, jamais du corps. Jeton dans le CORPS.
  const jeton = typeof b.jeton === 'string' ? b.jeton : '';
  const internauteId = jeton ? await verifierJetonRetrait(jeton) : null;
  if (!internauteId) {
    return Response.json({ ok: false, erreur: 'jeton de désabonnement invalide' }, { status: 401 });
  }

  // 2) Retrait de F2 UNIQUEMENT (finalité en dur). Codes calqués sur la route admin : 200 succès / 200 idempotent / 404 / 503.
  try {
    const { retire, raison } = await retirerConsentement(
      internauteId,
      'email_marketing',
      null, // geste de l'internaute lui-même (pas un admin)
      { aLaDemandeDe: 'internaute' }, // motif omis → journalisé null (jamais de PII)
      'email', // provenance de la décision
    );
    if (raison === 'introuvable') return Response.json({ ok: false, erreur: 'dossier introuvable ou effacé' }, { status: 404 });
    if (raison === 'deja_inactif') return Response.json({ ok: true, retire: false, deja: true }); // idempotent : succès, pas une erreur
    return Response.json({ ok: true, retire });
  } catch (e) {
    console.error('[internaute] retrait consentement e-mail échoué', (e as Error)?.name ?? 'Erreur');
    return Response.json({ ok: false, erreur: 'retrait indisponible' }, { status: 503 });
  }
}
