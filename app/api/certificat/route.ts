import { NextResponse, after } from 'next/server';
import { verifierJetonEmission } from '../../lib/internaute/jetonRectification';
import { emettreCertificat } from '../../lib/db/certificatEmission';
import { publierEnvoiCertificat } from '../../lib/email/publierEnvoiCertificat';

// Runtime Node explicite (driver `pg` + pipeline LiDAR/raster, jamais l'edge). `after()` l'exige aussi.
export const runtime = 'nodejs';

/**
 * ENVOI DU MAIL APRÈS LA RÉPONSE (T5-bis) — même modèle que l'instrumentation de `/api/analyse`.
 *
 * L'internaute attendait l'aller-retour SMTP alors que son certificat et ses documents étaient déjà faits :
 * **2,83 à 3,74 s** mesurés sur 8 émissions réelles (écart `genere_le` → `envoye_le`). Son écran dit déjà
 * « sera envoyé » (futur) — `app/page.tsx:1152` le commente explicitement — donc rien ne ment à l'écran.
 *
 * GARANTIES : ne peut JAMAIS retarder la réponse (tout est différé) ; ne peut JAMAIS la faire échouer
 * (`publierEnvoiCertificat` est best-effort et ne throw pas ; `after()` est lui-même enveloppé) ; la
 * TRAÇABILITÉ est INCHANGÉE — statut `'envoye'`, `envoye_le` et `derniere_erreur` sont écrits par la même
 * fonction, simplement après la réponse. Un échec n'est jamais avalé sans trace : soit `publierEnvoiCertificat`
 * l'inscrit en base et le journalise, soit le filet ci-dessous le journalise.
 */
function envoyerApresReponse(certificatId: number): void {
  try {
    after(async () => {
      try {
        await publierEnvoiCertificat(certificatId);
      } catch (e) {
        // Ne devrait pas arriver (fonction best-effort) : on trace le NOM de l'erreur, jamais le destinataire.
        console.error('[certificat] envoi post-réponse abandonné', (e as Error)?.name ?? 'Erreur');
      }
    });
  } catch (e) {
    // `after()` indisponible (hors contexte de requête) → le mail reste à (r)envoyer, l'acheminement le dira.
    console.error('[certificat] after() indisponible — envoi non programmé', (e as Error)?.name ?? 'Erreur');
  }
}

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
 * OWNERSHIP (IDOR) : par JETON D'ÉMISSION à capacité ÉTROITE (scope `emit-certificate`, `sub` = projetId). La porte
 * est : `sub du jeton === projetId demandé` → le porteur ne peut émettre QUE le projet scellé dans son jeton, jamais
 * celui d'un autre. Un jeton de RECTIFICATION est REJETÉ ici (scope différent, cf. verifierJetonEmission). Plus
 * simple et plus étroit que l'ancienne vérification base (internauteId + le projet lui appartient), désormais retirée.
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

  // Jeton d'ÉMISSION → projetId scellé (sub). Absent / invalide / expiré / MAUVAIS SCOPE (rectification) → 401.
  const jeton = (body as { jeton?: unknown }).jeton;
  const projetIdDuJeton = typeof jeton === 'string' && jeton.length > 0 ? await verifierJetonEmission(jeton) : null;
  if (projetIdDuJeton === null) {
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

  // OWNERSHIP : le jeton n'autorise QUE son propre projet. Toute divergence → 403 (jamais le projet d'un autre).
  if (projetId !== projetIdDuJeton) {
    return NextResponse.json({ ok: false, erreur: 'projet non autorisé' }, { status: 403 });
  }

  const r = await emettreCertificat(projetId);
  switch (r.statut) {
    case 'projet_absent':
      return NextResponse.json({ ok: false, erreur: 'projet non autorisé' }, { status: 403 });
    case 'refus_mode_inconnu':
      return NextResponse.json({ ok: false, erreur: 'mode d’origine inconnu', raison: 'mode_inconnu' }, { status: 422 });
    case 'refus_indetermine':
      return NextResponse.json({ ok: false, erreur: 'verdict indéterminé', raison: 'indetermine' }, { status: 422 });
    case 'refus_vis_a_vis':
      // Hors périmètre : Sans Vis-à-Vis® ne certifie que l'absence de vis-à-vis (décision produit, pas une erreur).
      return NextResponse.json({ ok: false, erreur: 'vis-à-vis détecté', raison: 'vis_a_vis' }, { status: 422 });
    case 'existant':
      // Mail jamais parti sur un certificat déjà émis → on le programme aussi (la garde « jamais un 2e mail »
      // a été appliquée en amont : un acheminement déjà 'envoye' ne remonte aucun envoi).
      if (r.envoiADeclencher !== undefined) envoyerApresReponse(r.envoiADeclencher);
      // `reference` = clé PUBLIQUE (non secrète) → peut sortir du serveur. Le jeton, lui, ne sort jamais.
      // Corps construit champ par champ : `envoiADeclencher` (interne) n'y entre jamais.
      return NextResponse.json({ ok: true, numero: r.numero, reference: r.reference, verdict: r.verdict, deja: true });
    case 'emis':
      if (r.envoiADeclencher !== undefined) envoyerApresReponse(r.envoiADeclencher);
      return NextResponse.json({ ok: true, numero: r.numero, reference: r.reference, verdict: r.verdict, deja: false });
  }
}
