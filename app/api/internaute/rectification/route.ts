import 'server-only';
import { verifierJetonRectification } from '../../../lib/internaute/jetonRectification';
import { validerRectification } from '../../../lib/internaute/rectification';
import { rectifierInternaute, ErreurEmailDuplique } from '../../../lib/internaute/cycleVie';

/**
 * PATCH /api/internaute/rectification — RECTIFICATION PUBLIQUE des coordonnées, fin de tunnel (module Internaute).
 *
 * Permet à un internaute ANONYME de corriger email/téléphone sur le dossier qu'il VIENT de créer. Route PUBLIQUE
 * (hors `/api/admin/` → proxy.ts inchangé, jamais la route admin réservée au rôle administrateur).
 *
 * SÉCURITÉ (parade IDOR, non négociable) :
 *  - l'id du dossier est extrait du JETON-CAPACITÉ signé (scope `rectify-contact`), JAMAIS du corps de requête ;
 *  - seuls email/téléphone (bloc A) sont rectifiables : tout autre champ du corps est IGNORÉ (on ne construit le
 *    patch qu'à partir de email/telephone) ;
 *  - le jeton n'est frappé qu'à une VRAIE création de dossier (cf. route d'ingestion) → on ne peut corriger que le
 *    sien, jamais le dossier d'un tiers.
 * Aucune preuve de consentement (B) ni le moteur ne sont touchés. Aucun envoi email. Runtime Node.
 */
export const runtime = 'nodejs';

export async function PATCH(request: Request): Promise<Response> {
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

  // 1) Autorisation par jeton-capacité : l'id agi vient du `sub` vérifié, jamais du client.
  const jeton = typeof b.jeton === 'string' ? b.jeton : '';
  const internauteId = jeton ? await verifierJetonRectification(jeton) : null;
  if (!internauteId) {
    return Response.json({ ok: false, erreur: 'jeton de rectification invalide ou expiré' }, { status: 401 });
  }

  // 2) Périmètre STRICT : on ne retient QUE email/téléphone du corps (prénom/nom/id éventuels sont écartés).
  const patch: Record<string, unknown> = {};
  if ('email' in b) patch.email = b.email;
  if ('telephone' in b) patch.telephone = b.telephone;
  const v = validerRectification(patch);
  if (!v.ok) return Response.json({ ok: false, erreurs: v.erreurs }, { status: 422 });

  // 3) Application (bloc A uniquement). `auteurId = null` : geste de l'internaute lui-même (pas un admin).
  try {
    const { rectifie } = await rectifierInternaute(internauteId, v.champs, null);
    if (!rectifie) return Response.json({ ok: false, erreur: 'dossier introuvable ou effacé' }, { status: 404 });
    return Response.json({ ok: true, rectifie: true });
  } catch (e) {
    if (e instanceof ErreurEmailDuplique) {
      return Response.json({ ok: false, erreur: 'email déjà utilisé' }, { status: 409 });
    }
    console.error('[internaute] rectification publique échouée', e);
    return Response.json({ ok: false, erreur: 'rectification indisponible' }, { status: 503 });
  }
}
