import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { coffreConfigure } from '../../../../../lib/gestion/coffre';
import { delierCompte } from '../../../../../lib/gestion/comptesGoogleRepo';
import { cookieEtat, nouvelEtatCsrf, uriRetour, urlConsentementCollaborateur } from '../../../../../lib/gestion/connexionGoogle';
import { messageEtat } from '../../../../../lib/gestion/googleCollaborateur';
import { lireIdentifiants } from '../../../../../lib/gestion/google';
import { etatGoogleDuCollaborateur } from '../../../../../lib/gestion/jetonCollaborateur';
import { comptesGoogleDisponibles } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/google (lot 5-PJ-C) — RELIER, DÉLIER, ET DIRE OÙ L'ON EN EST.
 *
 * 🔴 CHAQUE COLLABORATEUR RELIE SON PROPRE COMPTE. C'est ce qui fait que le sélecteur respecte SES droits Google :
 * nous ne décidons rien, Google applique les siens. Aucune liste de droits n'est recopiée dans notre base.
 *
 * 🔒 Le jeton est chiffré avant d'atteindre la base, et n'apparaît dans aucune réponse. Le compte `gestion@` n'est
 * ni lu ni écrit ici : il continue d'envoyer les mails, comme avant.
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}
function sansCache(r: Response): Response {
  const e = new Headers(r.headers);
  e.set('Cache-Control', SANS_CACHE);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: e });
}

/** GET — où en est la connexion Google de cette personne ? Aucune écriture, aucun appel à Google. */
export async function GET(request: Request): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);
  const etat = await etatGoogleDuCollaborateur(request);
  return json({ etat: etat.etat, message: messageEtat(etat), email: 'email' in etat ? etat.email : null });
}

/**
 * POST — DÉMARRER la connexion (`{ action: 'connecter' }`) ou DÉLIER (`{ action: 'deconnecter' }`).
 *
 * On ne redirige pas nous-mêmes : on rend l'ADRESSE de consentement, et c'est la page qui y envoie. Une redirection
 * rendue à un `fetch` serait suivie en arrière-plan, et la personne ne verrait jamais l'écran de Google.
 */
export async function POST(request: Request): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const corps = (await request.json().catch(() => ({}))) as { action?: string };
  const auteur = await auteurDeLaRequete(request);

  if (!await comptesGoogleDisponibles()) {
    return json({ etat: 'sans_schema', message: messageEtat({ etat: 'sans_schema' }) }, 409);
  }
  if (!coffreConfigure()) {
    return json({ etat: 'coffre_absent', message: messageEtat({ etat: 'coffre_absent' }) }, 409);
  }

  if (corps.action === 'deconnecter') {
    const fait = auteur.id !== null && await delierCompte(auteur.id, auteur.libelle);
    return json({ etat: fait ? 'delie' : 'jamais', message: fait ? 'Compte Google délié.' : 'Aucun compte à délier.' });
  }

  const identifiants = lireIdentifiants();
  if (identifiants === null) return json({ etat: 'erreur', message: 'Aucun identifiant de client OAuth configuré.' }, 409);
  if (auteur.id === null) {
    return json({
      etat: 'jamais',
      message: 'Relier un compte Google demande d’être connecté nominativement (l’accès de secours ne le permet pas).',
    }, 409);
  }

  const origine = new URL(request.url).origin;
  const etat = nouvelEtatCsrf();
  const reponse = json({
    etat: 'ok',
    url: urlConsentementCollaborateur({ clientId: identifiants.clientId, redirectUri: uriRetour(origine), state: etat }),
  });
  reponse.headers.append('Set-Cookie', cookieEtat(etat, origine.startsWith('https:')));
  return reponse;
}
