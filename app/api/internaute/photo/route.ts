import { NextResponse } from 'next/server';
import { verifierJetonRectification } from '../../../lib/internaute/jetonRectification';
import { query } from '../../../lib/db/client';
import { deposer, stockageConfigure } from '../../../lib/stockage';
import { decoderBase64, estImage, degraderPhoto, MAX_ENTREE_OCTETS } from '../../../lib/internaute/photoDepot';

// Runtime Node explicite (driver `pg` + sharp natif, jamais l'edge). Comme /api/internaute/completion.
export const runtime = 'nodejs';

/**
 * POST /api/internaute/photo — DÉPÔT de la photo du tunnel (OPTION B : appelée APRÈS la soumission de l'Écran A,
 * quand projet + internaute + jeton EXISTENT). Route PUBLIQUE, ANNEXE : la photo n'entre NI dans le verdict NI dans
 * le score → un échec ici ne doit jamais perturber le tunnel (le front est fire-and-forget). NE MODIFIE PAS la
 * création du profil (/api/internaute) : ce lot n'a rien à faire dans le code RGPD sensible.
 *
 * SÉCURITÉ (IDOR) — pattern de /api/internaute/completion : l'internauteId agi vient du `sub` du JETON SIGNÉ, JAMAIS
 * du corps. Le projetId du corps est accepté mais l'ownership est vérifié `WHERE id = projetId AND internaute_id =
 * <sub du jeton>` AVANT tout dépôt → aucun objet orphelin, un jeton d'un autre internaute ne modifie rien.
 *
 * Corps : { jeton, projetId, photo (base64/data URL) }. Le type est déduit du CONTENU (jamais de la déclaration
 * client) ; la photo est dégradée (JPEG q75, ≤ 1600 px, EXIF/GPS retirés) AVANT dépôt via `deposer()` (clé rangée
 * sous `internautes/<internauteId>/photos/…`), puis `internaute_projet.photo_cle` est renseigné.
 */
export async function POST(request: Request): Promise<Response> {
  // CONVENTION DE STATUT (namespace `internaute`, cf. /api/internaute + /api/internaute/completion) : toute entrée
  // INVALIDE → 422 (entité non traitable). Un consommateur ne doit pas apprendre deux dialectes selon la route.
  // 401 réservé au jeton invalide, 403 à l'ownership (IDOR). Le « contenu non-image » relève de la MÊME classe
  // qu'un champ mal typé (une entité qu'on ne peut pas traiter) → 422, pas 415.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erreur: 'corps JSON invalide' }, { status: 422 });
  }

  // IDOR : l'internaute vient du `sub` du jeton signé, jamais du corps. Jeton absent/invalide/expiré → 401.
  const jeton = (body as { jeton?: unknown }).jeton;
  const internauteId = typeof jeton === 'string' && jeton.length > 0 ? await verifierJetonRectification(jeton) : null;
  if (!internauteId) {
    return NextResponse.json({ ok: false, erreur: 'jeton invalide ou expiré' }, { status: 401 });
  }

  // projetId : number OU chaîne numérique (bigserial), comme completion.
  const projetIdRaw = (body as { projetId?: unknown }).projetId;
  const projetId =
    typeof projetIdRaw === 'number' && Number.isInteger(projetIdRaw)
      ? projetIdRaw
      : typeof projetIdRaw === 'string' && /^\d+$/.test(projetIdRaw)
        ? Number(projetIdRaw)
        : null;
  if (projetId === null) {
    return NextResponse.json({ ok: false, erreur: 'projetId invalide' }, { status: 422 });
  }

  // OWNERSHIP AVANT tout traitement/dépôt → zéro orphelin. Projet d'un AUTRE internaute (ou inexistant) → 403.
  const proprio = await query<{ id: number }>(
    'SELECT id FROM internaute_projet WHERE id = $1 AND internaute_id = $2',
    [projetId, internauteId],
  );
  if (proprio.rows.length === 0) {
    return NextResponse.json({ ok: false, erreur: 'projet non autorisé' }, { status: 403 });
  }

  // Photo : décodée du corps, bornée en ENTRÉE, type déduit du CONTENU (jamais la déclaration client).
  const entree = decoderBase64((body as { photo?: unknown }).photo);
  if (!entree) return NextResponse.json({ ok: false, erreur: 'photo absente ou illisible' }, { status: 422 });
  if (entree.byteLength > MAX_ENTREE_OCTETS) {
    return NextResponse.json({ ok: false, erreur: 'photo trop volumineuse' }, { status: 422 });
  }
  if (!(await estImage(entree))) {
    return NextResponse.json({ ok: false, erreur: 'contenu non-image' }, { status: 422 });
  }

  // Stockage non configuré → échec PROPRE et SILENCIEUX (jamais une exception qui remonte ; le front l'ignore).
  if (!stockageConfigure()) {
    return NextResponse.json({ ok: true, depose: false, raison: 'stockage_non_configure' });
  }

  try {
    // EXIF/GPS retirés + orientation appliquée dans la dégradation (cf. photoDepot). Master unique, pas de dérivée.
    const master = await degraderPhoto(entree);
    const { cle } = await deposer(master, 'image/jpeg', { internauteId }); // clé sous internautes/<internauteId>/photos/…
    await query('UPDATE internaute_projet SET photo_cle = $1 WHERE id = $2 AND internaute_id = $3', [
      cle,
      projetId,
      internauteId,
    ]);
    return NextResponse.json({ ok: true, depose: true });
  } catch (e) {
    // Dépôt/dégradation/UPDATE en échec → PROPRE et silencieux : la photo est annexe, le tunnel n'est jamais bloqué.
    console.error('[internaute/photo] dépôt indisponible', (e as Error)?.name);
    return NextResponse.json({ ok: true, depose: false, raison: 'depot_indisponible' });
  }
}
