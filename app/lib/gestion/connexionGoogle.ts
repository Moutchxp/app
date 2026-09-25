/**
 * MODULE « GESTION » — LOT 5-PJ-C : LE FLUX DE CONNEXION GOOGLE D'UN COLLABORATEUR.
 *
 * Ces fonctions vivent ICI, et non dans les routes, pour deux raisons : une route Next n'accepte que ses exports
 * réservés (`GET`, `POST`, `runtime`…) — tout autre export la fait refuser — et le cœur du flux doit s'éprouver
 * sans serveur.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 TROIS PROTECTIONS, chacune pour une faille précise :
 *   ① L'ÉTAT ANTI-CSRF. Un `state` aléatoire est posé en cookie `HttpOnly` avant le départ, et comparé au retour.
 *      Sans lui, un tiers pourrait faire relier SON compte Google au compte de quelqu'un d'autre en lui faisant
 *      simplement ouvrir un lien : le sélecteur montrerait alors le Drive de l'attaquant, et les dépôts y iraient ;
 *   ② LE DOMAINE, vérifié sur le jeton d'identité rendu par Google, contre une liste EN CONFIGURATION ;
 *   ③ LE JETON EST CHIFFRÉ avant d'atteindre la base, et n'apparaît dans aucune réponse HTTP.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto';
import { relierCompte, lireDomainesAutorises } from './comptesGoogleRepo';
import { ENDPOINT_AUTH, ENDPOINT_TOKEN } from './google';
import { lireDomaines, lireIdentite, verifierIdentite, PORTEES_COLLABORATEUR } from './googleCollaborateur';

/** Le cookie qui porte l'état anti-CSRF. `HttpOnly` : le script d'une page ne doit ni le lire ni l'écrire. */
export const COOKIE_ETAT = 'svav_google_state';

/** Durée de vie de l'état : le temps de donner son consentement, pas davantage. */
export const ETAT_DUREE_S = 900;

/** Un état aléatoire, non devinable. */
export function nouvelEtatCsrf(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * L'ADRESSE DE RETOUR, DÉDUITE de la requête reçue. Elle suit donc le domaine réellement servi — `localhost:3000` en
 * développement, le vrai domaine le jour venu — sans réglage à tenir à jour.
 *
 * ⚠️ MESURÉ le 25/09/2026 : le client OAuth actuel (type « application de bureau ») accepte déjà
 * `http://localhost:3000/...` (règle du loopback : n'importe quel port, n'importe quel chemin). Une adresse HTTPS
 * sur un vrai domaine, elle, est REFUSÉE (`redirect_uri_mismatch`) tant qu'elle n'est pas déclarée dans la console
 * Google — ce sera à faire le jour de la mise en ligne, pas avant.
 */
export function uriRetour(origine: string): string {
  return `${origine.replace(/\/+$/, '')}/api/admin/gestion/google/retour`;
}

/** L'en-tête `Set-Cookie` qui pose l'état. `SameSite=Lax` : il doit survivre au retour depuis Google. */
export function cookieEtat(etat: string, securise: boolean): string {
  return `${COOKIE_ETAT}=${etat}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ETAT_DUREE_S}${securise ? '; Secure' : ''}`;
}

/** L'en-tête qui l'efface, au retour : un état qui a servi ne doit plus pouvoir resservir. */
export function cookieEtatEfface(securise: boolean): string {
  return `${COOKIE_ETAT}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securise ? '; Secure' : ''}`;
}

/** Lit un cookie dans un en-tête brut. Même lecture que `auteur.ts` — une seule façon de lire un cookie. PUR. */
export function lireCookie(entete: string | null, nom: string): string | null {
  if (!entete) return null;
  for (const part of entete.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === nom) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * L'ADRESSE DE CONSENTEMENT.
 *
 * `access_type=offline` + `prompt=consent` : sans les DEUX, Google ne rend pas de jeton durable à la seconde
 * connexion, et l'on croit à tort que le bouton a échoué. Piège déjà payé au lot 5-GOOGLE. PUR.
 */
export function urlConsentementCollaborateur(o: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(ENDPOINT_AUTH);
  u.searchParams.set('client_id', o.clientId);
  u.searchParams.set('redirect_uri', o.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', PORTEES_COLLABORATEUR.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', o.state);
  return u.toString();
}

export interface EchangeCollaborateur { refreshToken: string; idToken: string | null }
export type Issue<T> = { ok: true; valeur: T } | { ok: false; motif: string };

/**
 * ÉCHANGE le code contre un jeton, POUR UN COLLABORATEUR.
 *
 * Distinct de `echangerCode` (lot 5-GOOGLE), qui vise le compte `gestion@` : celui-ci récupère aussi l'`id_token`,
 * seule façon de savoir QUI vient de se connecter — et donc de vérifier son domaine. Sans lui, on devrait croire sur
 * parole l'adresse annoncée.
 */
export async function echangerPourCollaborateur(
  o: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Issue<EchangeCollaborateur>> {
  const body = new URLSearchParams({
    code: o.code, client_id: o.clientId, client_secret: o.clientSecret,
    redirect_uri: o.redirectUri, grant_type: 'authorization_code',
  });
  const res = await fetchImpl(ENDPOINT_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = (await res.json().catch(() => ({}))) as
    { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || j.error) {
    return { ok: false, motif: `Google a refusé la connexion : ${j.error ?? `HTTP ${res.status}`}${j.error_description ? ` — ${j.error_description}` : ''}` };
  }
  if (!j.refresh_token) {
    return {
      ok: false,
      motif: 'Google n’a pas renvoyé de jeton durable : ce compte a déjà autorisé l’application. '
        + 'Retire l’accès sur myaccount.google.com/permissions, puis recommence.',
    };
  }
  return { ok: true, valeur: { refreshToken: j.refresh_token, idToken: j.id_token ?? null } };
}

/**
 * VÉRIFIE LE DOMAINE, puis relie le compte. Le refus est LISIBLE et dit quels domaines sont acceptés : sans cette
 * phrase, on ne sait pas s'il faut changer de compte ou demander un droit.
 */
export async function verifierEtRelier(o: {
  utilisateurId: number; auteurLibelle: string; echange: EchangeCollaborateur;
}): Promise<Issue<{ email: string }>> {
  const identite = lireIdentite(o.echange.idToken);
  const verdict = verifierIdentite(identite, lireDomaines(await lireDomainesAutorises()));
  if (!verdict.ok) return { ok: false, motif: verdict.motif };
  await relierCompte({
    utilisateurId: o.utilisateurId, email: verdict.email, refreshToken: o.echange.refreshToken,
    portees: PORTEES_COLLABORATEUR, auteurLibelle: o.auteurLibelle,
  });
  return { ok: true, valeur: { email: verdict.email } };
}
