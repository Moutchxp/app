import 'server-only';
import { activerParLien, lireLien } from '../../../../lib/admin/invitationRepo';

/**
 * Activation d'un compte par le lien de son mail d'invitation (lot GESTION-INVITATION-ADMIN, 16/10/2026). PUBLIQUE
 * (whitelist du proxy : la personne n'a pas encore de mot de passe). Le jeton est la seule autorisation.
 *  · `GET ?j=` — LECTURE : le lien agit-il encore ? (prénom et identifiant seulement s'il agit). N'écrit rien.
 *  · `POST { jeton, motDePasse, confirmation }` — pose le mot de passe choisi et consomme le lien (une seule fois).
 *    Lien faux, expiré, déjà utilisé, remplacé, compte désactivé : message clair, rien n'est modifié.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });
const jetonValable = (j: unknown): j is string => typeof j === 'string' && j.trim() !== '' && j.length <= 200;
const LIEN_FAUX = 'Ce lien d’activation n’est pas valable. Vérifiez que vous l’avez copié en entier.';

export async function GET(request: Request): Promise<Response> {
  const j = new URL(request.url).searchParams.get('j');
  if (!jetonValable(j)) return json({ ok: false, message: LIEN_FAUX });
  const r = await lireLien(j.trim());
  return json(r.verdict.ok ? { ok: true, prenom: r.prenom, identifiant: r.identifiant } : { ok: false, cause: r.verdict.cause, message: r.verdict.message });
}

export async function POST(request: Request): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown; motDePasse?: unknown; confirmation?: unknown };
  if (!jetonValable(b.jeton)) return json({ erreur: LIEN_FAUX }, 409);
  const r = await activerParLien(b.jeton.trim(), typeof b.motDePasse === 'string' ? b.motDePasse : '', typeof b.confirmation === 'string' ? b.confirmation : '');
  return r.ok ? json({ ok: true, identifiant: r.identifiant }) : json({ erreur: r.message }, r.statut);
}
