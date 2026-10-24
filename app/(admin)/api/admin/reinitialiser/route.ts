import 'server-only';
import { cookies } from 'next/headers';
import { lireLienReinitialisation, reinitialiserParLien } from '../../../../lib/admin/reinitialisationRepo';
import { MESSAGE_LIEN_INVALIDE } from '../../../../lib/admin/reinitialisation';
import { marquerConnexion, trouverCompteParId } from '../../../../lib/admin/comptes';
import { sessionPourCompte } from '../../../../lib/admin/ouvertureSession';
import { NOM_COOKIE, optionsCookie, signerJeton } from '../../../../lib/admin/session';

/**
 * « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION — LE LIEN (Arno, 24/10/2026, migration 416). PUBLIQUE (whitelist du proxy) : le
 * jeton du lien est la seule autorisation.
 *  · `GET ?j=` — LECTURE : le lien agit-il encore ? (l'identifiant seulement s'il agit). N'écrit rien.
 *  · `POST { jeton, motDePasse, confirmation }` — pose le mot de passe, consomme le lien (une seule fois), FERME toutes les
 *    autres sessions du compte, puis OUVRE celle du navigateur courant (la même session que la connexion). Lien faux, expiré,
 *    déjà utilisé, remplacé, compte désactivé : « Ce lien n'est plus valide », rien n'est modifié.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });
const jetonValable = (j: unknown): j is string => typeof j === 'string' && j.trim() !== '' && j.length <= 200;

export async function GET(request: Request): Promise<Response> {
  const j = new URL(request.url).searchParams.get('j');
  if (!jetonValable(j)) return json({ ok: false, message: MESSAGE_LIEN_INVALIDE });
  const r = await lireLienReinitialisation(j.trim()).catch(() => ({ ok: false as const }));
  return json(r.ok ? { ok: true, identifiant: r.identifiant } : { ok: false, message: MESSAGE_LIEN_INVALIDE });
}

export async function POST(request: Request): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { jeton?: unknown; motDePasse?: unknown; confirmation?: unknown };
  if (!jetonValable(b.jeton)) return json({ erreur: MESSAGE_LIEN_INVALIDE }, 409);
  const r = await reinitialiserParLien(b.jeton.trim(), typeof b.motDePasse === 'string' ? b.motDePasse : '', typeof b.confirmation === 'string' ? b.confirmation : '');
  if (!r.ok) return json({ erreur: r.message }, r.statut);
  // La session du navigateur courant : la même que la connexion (rôle et droits du compte, inchangés).
  const compte = await trouverCompteParId(r.compteId).catch(() => null);
  if (compte !== null && compte.actif) {
    await marquerConnexion(compte.id);
    const jeton = await signerJeton(await sessionPourCompte(compte));
    (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(process.env.NODE_ENV === 'production'));
    return json({ ok: true, connecte: true });
  }
  return json({ ok: true, connecte: false });
}
