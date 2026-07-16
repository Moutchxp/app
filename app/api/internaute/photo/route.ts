import { NextResponse } from 'next/server';
import { verifierJetonEmission } from '../../../lib/internaute/jetonRectification';
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
 * OWNERSHIP (IDOR) — par JETON D'ÉMISSION (scope `emit-certificate`, `sub` = projetId), LE MÊME que /api/certificat.
 * On dérive l'internauteId du projet (`internaute_projet.internaute_id`, NOT NULL) EXACTEMENT comme `emettreCertificat`.
 * Ce jeton est délivré pour TOUT projet (e-mail neuf OU connu) → la photo est déposée dans les DEUX cas. Le jeton de
 * RECTIFICATION (null en CAS 2, et trop large) n'est PLUS consulté ici : il retrouve son seul rôle (rectification de
 * contact). Déposer une photo annexe est STRICTEMENT moins puissant qu'émettre le certificat que ce même jeton autorise
 * déjà, et sur une capacité PLUS étroite (par-projet). L'expiration 30 min couvre le dépôt : il suit IMMÉDIATEMENT la
 * soumission de l'Écran A (fire-and-forget dans la même réponse), jamais une action utilisateur différée.
 *
 * CONVENTION DE STATUT (namespace `internaute`, alignée sur /api/certificat — même consommateur, même jeton) : toute
 * entrée INVALIDE → 422 · 401 jeton invalide/expiré/MAUVAIS SCOPE (rectification) · 403 ownership (projetId du corps ≠
 * `sub`, ou projet absent). Un consommateur ne doit pas apprendre deux dialectes.
 *
 * Corps : { jeton, projetId, photo (base64/data URL) }. Le type est déduit du CONTENU (jamais de la déclaration
 * client) ; la photo est dégradée (JPEG q75, ≤ 1600 px, EXIF/GPS retirés) AVANT dépôt via `deposer()` (clé rangée
 * sous `internautes/<internauteId>/photos/…`), puis `internaute_projet.photo_cle` est renseigné.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erreur: 'corps JSON invalide' }, { status: 422 });
  }

  // Jeton d'ÉMISSION → projetId scellé (sub). Absent / invalide / expiré / MAUVAIS SCOPE (rectification) → 401.
  const jeton = (body as { jeton?: unknown }).jeton;
  const projetIdDuJeton = typeof jeton === 'string' && jeton.length > 0 ? await verifierJetonEmission(jeton) : null;
  if (projetIdDuJeton === null) {
    return NextResponse.json({ ok: false, erreur: 'jeton invalide ou expiré' }, { status: 401 });
  }

  // projetId : number OU chaîne numérique (bigserial), comme /api/certificat et completion.
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

  // OWNERSHIP : le jeton n'autorise QUE son propre projet. Toute divergence corps ≠ sub → 403 (jamais celui d'un autre).
  if (projetId !== projetIdDuJeton) {
    return NextResponse.json({ ok: false, erreur: 'projet non autorisé' }, { status: 403 });
  }

  // internauteId DÉRIVÉ du projet (NOT NULL) → scope de dépôt (photos/…). Projet absent → 403 (aucun objet orphelin).
  const proj = await query<{ internaute_id: string }>('SELECT internaute_id FROM internaute_projet WHERE id = $1', [projetId]);
  const internauteId = proj.rows[0]?.internaute_id;
  if (!internauteId) {
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
    // Ownership déjà prouvée par le jeton (sub = projetId) → l'UPDATE se borne à l'id du projet.
    await query('UPDATE internaute_projet SET photo_cle = $1 WHERE id = $2', [cle, projetId]);
    return NextResponse.json({ ok: true, depose: true });
  } catch (e) {
    // Dépôt/dégradation/UPDATE en échec → PROPRE et silencieux : la photo est annexe, le tunnel n'est jamais bloqué.
    console.error('[internaute/photo] dépôt indisponible', (e as Error)?.name);
    return NextResponse.json({ ok: true, depose: false, raison: 'depot_indisponible' });
  }
}
