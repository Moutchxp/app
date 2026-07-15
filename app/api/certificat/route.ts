import { NextResponse } from 'next/server';
import { verifierJetonRectification } from '../../lib/internaute/jetonRectification';
import { emettreCertificat } from '../../lib/db/certificatEmission';

// Runtime Node explicite (driver `pg` + pipeline LiDAR/raster, jamais l'edge). Comme /api/internaute/*.
export const runtime = 'nodejs';

/**
 * POST /api/certificat — ÉMISSION du certificat d'un projet (Lot 4). Route SÉPARÉE, JAMAIS dans
 * /api/internaute/completion (code RGPD) : l'émission re-dérive le résultat côté serveur et n'a rien à faire dans
 * le chemin de consentement. Le certificat est délivré INDÉPENDAMMENT du consentement (non-couplage) ; ce qui
 * garde la porte ici, c'est l'OWNERSHIP du projet, pas un consentement.
 *
 * CONVENTION DE STATUT — /api/certificat est un NOUVEAU namespace mais le CONSOMMATEUR est le MÊME internaute avec
 * le MÊME jeton que /api/internaute/*. On s'aligne donc sur la convention déjà en vigueur là-bas (un consommateur
 * ne doit pas apprendre deux dialectes) : 401 jeton invalide/expiré · 403 ownership (IDOR) · 422 entrée invalide
 * OU état du projet interdisant l'émission (mode inconnu, verdict indéterminé) — entité non traitable en l'état.
 *
 * IDOR : l'internauteId agi vient du `sub` du JETON SIGNÉ, JAMAIS du corps. Le projetId du corps est accepté mais
 * l'ownership est vérifiée en base (WHERE id = projetId AND internaute_id = <sub>) → aucun projet d'autrui émis.
 *
 * IDEMPOTENCE : un projet a UN certificat à vie (034). Un second appel (double-clic, retry) RENVOIE l'existant
 * (200, `deja: true`), jamais une erreur ni un second document.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erreur: 'corps JSON invalide' }, { status: 422 });
  }

  // Jeton → internauteId (sub). Absent/invalide/expiré → 401.
  const jeton = (body as { jeton?: unknown }).jeton;
  const internauteId = typeof jeton === 'string' && jeton.length > 0 ? await verifierJetonRectification(jeton) : null;
  if (!internauteId) {
    return NextResponse.json({ ok: false, erreur: 'jeton invalide ou expiré' }, { status: 401 });
  }

  // projetId : number OU chaîne numérique (bigserial), comme /api/internaute/photo.
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

  const r = await emettreCertificat(internauteId, projetId);
  switch (r.statut) {
    case 'projet_absent':
      return NextResponse.json({ ok: false, erreur: 'projet non autorisé' }, { status: 403 });
    case 'refus_mode_inconnu':
      return NextResponse.json({ ok: false, erreur: 'mode d’origine inconnu', raison: 'mode_inconnu' }, { status: 422 });
    case 'refus_indetermine':
      return NextResponse.json({ ok: false, erreur: 'verdict indéterminé', raison: 'indetermine' }, { status: 422 });
    case 'existant':
      return NextResponse.json({ ok: true, numero: r.numero, verdict: r.verdict, deja: true });
    case 'emis':
      return NextResponse.json({ ok: true, numero: r.numero, verdict: r.verdict, deja: false });
  }
}
