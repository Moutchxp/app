import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireRecents, type ModeVerification } from '../../../../../lib/internaute/verification';

/**
 * GET /api/admin/internautes/recents?mode=f1|tous — PANNEAU DE VÉRIFICATION (contrôle technique, module Internaute).
 *
 * Renvoie les 10 derniers internautes pour VÉRIFIER l'ingestion du tunnel — CONSULTATION SEULE (aucun export ici).
 * `mode=f1` (défaut) : consentants F1 actif (comme l'extraction). `mode=tous` : toute la base, effacés inclus (PII
 * déjà NULL) — contrôle technique, PAS de l'exploitation commerciale. RÉSERVÉ RÔLE ADMINISTRATEUR
 * (`exigerAdministrateur` + fail-closed proxy). Aucun pont M2, moteur jamais rappelé (golden intact). Runtime Node.
 *
 * NB accountability : la navigation de cette liste n'est PAS journalisée (bruit) ; l'OUVERTURE d'un dossier passe par
 * `GET /[id]` (LOT 3) qui journalise déjà `acces_profil`.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const brut = new URL(request.url).searchParams.get('mode');
    const mode: ModeVerification = brut === 'tous' ? 'tous' : 'f1';

    return Response.json({ mode, lignes: await lireRecents(mode) });
  } catch {
    return Response.json({ erreur: 'vérification indisponible' }, { status: 503 });
  }
}
