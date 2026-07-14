import { NextResponse } from 'next/server';
import { validerCorpsIngestion, auMoinsUnConsentement } from '../../../lib/internaute/ingestion';
import { ingererProfil, ErreurAucunConsentement } from '../../../lib/internaute/socle';
import { completerParcours, ErreurEmailDuplique } from '../../../lib/internaute/cycleVie';
import { verifierJetonRectification } from '../../../lib/internaute/jetonRectification';
import type { CleFinalite } from '../../../lib/internaute/textesConsentement';

// Runtime Node explicite (driver `pg`, jamais l'edge). Comme /api/internaute.
export const runtime = 'nodejs';

/** Finalités RÉELLEMENT présentées à l'Écran B (réconciliées ici). F1 (Écran A) n'y figure jamais → jamais retiré ici. */
const SCOPE_ECRAN_B: readonly CleFinalite[] = ['email_marketing'];

/**
 * POST /api/internaute/completion — VALIDATION DE L'ÉCRAN B (module Internaute). Route PUBLIQUE (fin de tunnel).
 *
 * UPSERT à l'Écran B (les coordonnées de B FONT FOI) :
 *  - JETON présent (profil créé à l'Écran A) → `completerParcours` : parcours→'complet', MAJ email/tél, réconciliation
 *    F2 append-only (coché→'accorde', décoché→'retire') ;
 *  - JETON absent (rien coché en A, pas de profil) + AU MOINS UN consentement coché en B → `ingererProfil(..., 'complet')`
 *    CRÉE le profil (le trou RGPD F2-seul reste FERMÉ : F2 coché en B a un profil où s'attacher) ;
 *  - JETON absent + AUCUN consentement en B → aucun profil (non-couplage : le certificat est délivré quand même).
 *
 * SÉCURITÉ (IDOR) : l'id agi vient du `sub` du jeton signé, JAMAIS du corps. Le jeton n'est frappé qu'à une VRAIE
 * création (route d'ingestion) → on ne complète que le sien. Un jeton FOURNI mais invalide/expiré → 401 (jamais un
 * doublon silencieux). Aucun contact moteur (golden intact). Aucun envoi email (LOT 6 absent).
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
  const corps = validation.corps;

  // Autorisation par jeton-capacité (facultatif : absent = pas de profil créé en A).
  const jetonFourni = typeof (body as { jeton?: unknown }).jeton === 'string' && (body as { jeton: string }).jeton.length > 0;
  const internauteId = jetonFourni ? await verifierJetonRectification((body as { jeton: string }).jeton) : null;
  if (jetonFourni && !internauteId) {
    return NextResponse.json({ ok: false, erreur: 'jeton de complétion invalide ou expiré' }, { status: 401 });
  }

  // `projetId` (facultatif) = l'analyse de l'Écran A à marquer « certificat envoyé ». Accepté en number OU chaîne
  // numérique (bigserial). L'IDOR est fermé DANS `completerParcours` (marque uniquement un projet de CET internaute).
  const projetIdRaw = (body as { projetId?: unknown }).projetId;
  const projetId =
    typeof projetIdRaw === 'number' && Number.isInteger(projetIdRaw)
      ? projetIdRaw
      : typeof projetIdRaw === 'string' && /^\d+$/.test(projetIdRaw)
        ? Number(projetIdRaw)
        : null;

  try {
    if (internauteId) {
      // CAS 1 — profil existant (créé à l'Écran A) : compléter (coords de B font foi + parcours + réconciliation F2).
      const coords = { email: corps.identite.email, telephone: corps.identite.telephone };
      const { complete } = await completerParcours(internauteId, coords, corps.consentements, SCOPE_ECRAN_B, projetId, null);
      if (!complete) return NextResponse.json({ ok: false, cree: false, erreur: 'dossier introuvable ou effacé' }, { status: 404 });
      return NextResponse.json({ ok: true, cree: false, complete: true });
    }
    // CAS 2 — aucun profil créé en A : si au moins un consentement est coché en B, CRÉER (statut 'complet').
    if (auMoinsUnConsentement(corps.consentements)) {
      // Email neuf → profil CRÉÉ 'complet' + projet né avec `certificat_envoye=true` (l'Écran B a été validé). Email DÉJÀ
      // existant → réutilisé SANS preuve de propriété (pas de jeton) : on N'ÉCRASE PAS ses coordonnées/statut (IDOR-safe)
      // → réponse HONNÊTE `cree:false, complete:false`. Le projet appendé reste marqué (création directe = certificat validé).
      const { creeInternaute } = await ingererProfil(corps, 'complet', true);
      return NextResponse.json({ ok: true, cree: creeInternaute, complete: creeInternaute });
    }
    // CAS 3 — aucun consentement : non-couplage. Certificat délivré, aucun profil.
    return NextResponse.json({ ok: true, cree: false, complete: false });
  } catch (e) {
    if (e instanceof ErreurEmailDuplique) {
      return NextResponse.json({ ok: false, erreur: 'email déjà utilisé' }, { status: 409 });
    }
    if (e instanceof ErreurAucunConsentement) {
      return NextResponse.json({ ok: false, cree: false, erreur: 'au moins un consentement requis pour créer un profil' }, { status: 422 });
    }
    console.error('[internaute] complétion échouée', e);
    return NextResponse.json({ ok: false, erreur: 'complétion indisponible' }, { status: 503 });
  }
}
