import 'server-only';
import { lireJetonRdv, repondreParJeton, reponsesRdvDisponible, type LectureJeton } from '../../../lib/location/reponsesRdvRepo';
import { jetonRdvBienForme, MESSAGES_JETON_RDV } from '../../../lib/location/reponsesRdv';

/**
 * ══ 🔴🔴 LA RÉPONSE D'UN LOCATAIRE À UN RENDEZ-VOUS, PAR LE LIEN DE SON MAIL, SANS CONNEXION (Arno, 18/11/2026, migration 495) ══════════════
 * Route PUBLIQUE (hors `/api/admin` : le proxy ne s'y applique pas), sur le modèle de `/api/tache/reponse`. Le JETON est la seule autorisation :
 * 32 octets aléatoires, empreinte seule en base, propre à un locataire et à un créneau, valable jusqu'à l'heure du rendez-vous.
 *  · `GET ?j=<jeton>` — LECTURE : le rendez-vous (date, heure, adresse) et la réponse courante. N'ÉCRIT RIEN (une messagerie qui visite le lien
 *    ne répond jamais à la place du locataire).
 *  · `POST { jeton, decision: 'accepter' | 'refuser' }` — la réponse, au seul clic sur le bouton de la page ; on peut changer d'avis jusqu'à
 *    l'heure du rendez-vous. Lien faux, déplacé (caduc), expiré ou rendez-vous terminé → message clair, RIEN n'est modifié.
 * Jamais un nom de colocataire, jamais une donnée d'un autre bien : seul le rendez-vous du lien est montré.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });
const vue = (l: LectureJeton) => ({ peutRepondre: l.ok, cause: l.ok ? null : l.cause, message: l.ok ? null : l.message, rdv: l.rdv });

export async function GET(request: Request): Promise<Response> {
  const j = new URL(request.url).searchParams.get('j');
  if (!jetonRdvBienForme(j)) return json({ peutRepondre: false, cause: 'inconnu', message: MESSAGES_JETON_RDV.inconnu, rdv: null });
  if (!(await reponsesRdvDisponible())) return json({ erreur: 'Les réponses aux rendez-vous ne sont pas installées sur ce serveur.' }, 503);
  return json(vue(await lireJetonRdv(j)));
}

export async function POST(request: Request): Promise<Response> {
  if (!(await reponsesRdvDisponible())) return json({ erreur: 'Les réponses aux rendez-vous ne sont pas installées sur ce serveur.' }, 503);
  const corps = (await request.json().catch(() => ({}))) as { jeton?: unknown; decision?: unknown };
  const decision = corps.decision === 'accepter' || corps.decision === 'refuser' ? corps.decision : null;
  if (decision === null) return json({ erreur: 'Choisissez « J’accepte le rendez-vous » ou « Je refuse ».' }, 400);
  if (!jetonRdvBienForme(corps.jeton)) return json({ peutRepondre: false, cause: 'inconnu', message: MESSAGES_JETON_RDV.inconnu, rdv: null }, 409);
  const r = await repondreParJeton(corps.jeton, decision);
  if (!r.ok) return json(vue(r), 409);
  return json({ ...vue(r), etat: 'ok', deja: r.deja === true });
}
