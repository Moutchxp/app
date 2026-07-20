import 'server-only';
import { cookies } from 'next/headers';
import { verifierJetonRectification } from '../../../../lib/internaute/jetonRectification';
import { creerCompteInternaute } from '../../../../lib/internaute/authCompte';
import { signerSession, optionsCookieClient, NOM_COOKIE_CLIENT } from '../../../../lib/internaute/authSession';

// Runtime Node explicite (argon2 natif via poserMotDePasse + driver pg). Route PUBLIQUE : hors matcher admin.
export const runtime = 'nodejs';

/**
 * POST /api/internaute/auth/creer — CRÉATION DE COMPTE depuis le TUNNEL (fin de parcours), AVANT l'émission du
 * certificat. Body `{ jeton, motDePasse }`.
 *
 * OWNERSHIP par jeton-capacité `rectify-contact` (MÊME parade IDOR que la rectification publique) : l'id agi vient du
 * `sub` du jeton vérifié, JAMAIS du corps. Ce jeton n'est frappé qu'à une VRAIE création de dossier (`creeInternaute`,
 * cf. route d'ingestion) → un porteur de jeton possède un dossier NEUF, sans credential préexistant : aucune prise de
 * contrôle d'un compte tiers possible.
 *
 * EFFETS : valide les coordonnées pré-remplies + pose le mot de passe (≥ 12) + crée `internaute_auth`, PUIS ouvre la
 * session CLIENT (cookie `svv_client_session`). ZÉRO consentement écrit (base légale = SERVICE). Le compte existe donc
 * AVANT l'émission → il EXCLUT le dossier de l'auto-effacement post-envoi (cf. `effacerIdentiteLivraisonSiEligible`).
 * Aucun contact moteur (golden intact), aucun envoi e-mail.
 */
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

  // 1) Autorisation par jeton-capacité : l'id agi = `sub` vérifié (scope `rectify-contact`), jamais un id du corps.
  const jeton = typeof b.jeton === 'string' ? b.jeton : '';
  const internauteId = jeton ? await verifierJetonRectification(jeton) : null;
  if (!internauteId) {
    return Response.json({ ok: false, erreur: 'jeton invalide ou expiré' }, { status: 401 });
  }

  const motDePasse = typeof b.motDePasse === 'string' ? b.motDePasse : '';

  try {
    const res = await creerCompteInternaute(internauteId, motDePasse);
    if (!res.ok) {
      if (res.raison === 'mot_de_passe_invalide') {
        return Response.json({ ok: false, erreurs: res.erreurs }, { status: 422 });
      }
      if (res.raison === 'coordonnees_incompletes') {
        return Response.json({ ok: false, erreur: 'coordonnées incomplètes (e-mail requis)' }, { status: 422 });
      }
      return Response.json({ ok: false, erreur: 'dossier introuvable ou effacé' }, { status: 404 });
    }

    // 2) Session CLIENT ouverte (cookie) : le compte existe désormais AVANT l'émission du certificat.
    const jetonSession = await signerSession(internauteId);
    (await cookies()).set(NOM_COOKIE_CLIENT, jetonSession, optionsCookieClient(process.env.NODE_ENV === 'production'));
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[internaute] création de compte échouée', (e as Error)?.name ?? 'Erreur');
    return Response.json({ ok: false, erreur: 'création de compte indisponible' }, { status: 503 });
  }
}
