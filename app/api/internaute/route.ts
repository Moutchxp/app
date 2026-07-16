import { NextResponse } from 'next/server';
import { validerCorpsIngestion, auMoinsUnConsentement } from '../../lib/internaute/ingestion';
import { ingererProfil, ErreurAucunConsentement } from '../../lib/internaute/socle';
import { signerJetonRectification, signerJetonEmission } from '../../lib/internaute/jetonRectification';

// Runtime Node explicite (comme /api/analyse) : le driver `pg` (socle.ts) exige Node, jamais l'edge runtime.
export const runtime = 'nodejs';

/**
 * POST /api/internaute — INGESTION nominative (module Internaute, LOT 2). Route PUBLIQUE (fin de tunnel).
 *
 * Reçoit identité + consentements acceptés + projet (données moteur capturées en LECTURE SEULE). Persiste en UNE
 * transaction (A identité → B preuves de consentement append-only → C projet). INVARIANT : rien n'est persisté sans
 * AU MOINS UN consentement (parmi F1/F2/F3) — porte structurelle. AUCUNE donnée nominative n'est émise vers M2 ; le
 * moteur n'est ni rappelé ni modifié (golden intact). En cas d'échec, ROLLBACK complet ; la réponse permet au front
 * de rester NON bloquant (le certificat/le flux produit reste affiché).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erreur: 'corps JSON invalide' }, { status: 422 });
  }

  const validation = validerCorpsIngestion(body);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, erreurs: validation.erreurs }, { status: 422 });
  }

  // Défense en profondeur : le front ne poste que si au moins un consentement est coché, mais la route l'exige aussi.
  if (!auMoinsUnConsentement(validation.corps.consentements)) {
    return NextResponse.json(
      { ok: false, cree: false, erreur: 'au moins un consentement requis pour créer un profil' },
      { status: 422 },
    );
  }

  try {
    const { internauteId, projetId, creeInternaute } = await ingererProfil(validation.corps);
    // Jeton-capacité de rectification publique : frappé UNIQUEMENT si un NOUVEAU dossier a été inséré dans cette
    // requête (creeInternaute). Email pré-existant (get-or-create réutilise) → PAS de jeton → l'internaute ne peut
    // corriger QUE le dossier qu'il vient de créer, jamais celui d'un tiers (fermeture collision email / IDOR).
    let jetonRectification: string | null = null;
    if (creeInternaute) {
      try {
        jetonRectification = await signerJetonRectification(internauteId);
      } catch (e) {
        // Secret manquant / signature impossible : on NE bloque pas l'ingestion (déjà persistée) ; la correction
        // publique sera simplement indisponible (écran en lecture seule). Le certificat reste dû.
        console.error('[internaute] jeton de rectification indisponible', e);
      }
    }
    // Jeton d'ÉMISSION : capacité ÉTROITE bornée à CE projet (sub = projetId), signée TOUJOURS (e-mail neuf OU connu)
    // → ferme le CAS 2 (e-mail connu, jeton de rectification null) sans rouvrir l'IDOR de rectification (scope distinct).
    let jetonEmission: string | null = null;
    try {
      jetonEmission = await signerJetonEmission(projetId);
    } catch (e) {
      // Secret manquant → émission indisponible pour ce parcours (le certificat reste re-émettable) ; ne bloque pas l'ingestion.
      console.error('[internaute] jeton d’émission indisponible', e);
    }
    // `projetId` = id du projet créé à l'Écran A, exposé pour que la complétion de l'Écran B marque CETTE analyse
    // (`certificat_envoye`). Jamais dans l'URL ; l'IDOR est fermé côté complétion (WHERE id ET internaute_id du jeton).
    return NextResponse.json({ ok: true, cree: true, internauteId, projetId, jetonRectification, jetonEmission });
  } catch (e) {
    if (e instanceof ErreurAucunConsentement) {
      return NextResponse.json({ ok: false, cree: false, erreur: e.message }, { status: 422 });
    }
    console.error('[internaute] ingestion échouée', e);
    return NextResponse.json({ ok: false, cree: false, erreur: 'ingestion indisponible' }, { status: 503 });
  }
}
