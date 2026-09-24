/**
 * LOT 5-GOOGLE — LA CONNEXION GOOGLE DE `gestion@criterimmo.fr` : envoi, signatures, Drive.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS. Il PRÉPARE la connexion : il sait construire une page de consentement,
 * échanger un code contre un jeton, rafraîchir ce jeton, et POSER TROIS QUESTIONS EN LECTURE (quel compte ? quelle
 * signature ? quels Drive partagés ?). Il n'envoie aucun mail, n'écrit aucun fichier Drive, ne modifie aucun réglage —
 * l'envoi viendra avec son propre lot, et il devra être écrit, éprouvé et relu pour lui-même.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * SUR LE PATRON DE `app/lib/permis/drive.ts`, éprouvé depuis le chantier N6-B : aucune dépendance npm (pas de
 * `googleapis`), seulement le `fetch` natif, INJECTÉ par un `deps` → tout est éprouvable sans réseau. Aucune importation
 * de `node:fs` ici : ce fichier doit rester chargeable de partout (le rangement du jeton vit dans `googleJeton.ts`,
 * qui, lui, touche au disque).
 *
 * 🔴 LE JETON DE gestion@ EST DISTINCT DU JETON DRIVE EXISTANT. Ils ne se rencontrent jamais : variables différentes,
 * rangement différent, portées différentes. `GOOGLE_DRIVE_REFRESH_TOKEN` (lecture seule Drive, chantier N6-B) n'est ni
 * lu, ni écrit, ni révoqué par quoi que ce soit d'ici.
 *
 * 🔴 UN JETON NE S'AFFICHE ET NE SE JOURNALISE JAMAIS. Aucune fonction de ce fichier ne rend un jeton en clair dans un
 * message destiné à l'écran : `masquerJeton` est là pour ça, et un test vérifie qu'aucun CLI n'imprime la valeur.
 */

/** Le compte, et lui seul. Autoriser un autre compte donnerait une application qui écrit au nom de quelqu'un d'autre. */
export const COMPTE_GESTION = 'gestion@criterimmo.fr';

/**
 * LES TROIS PORTÉES, ET RIEN DE PLUS. Chacune répond à un besoin nommé, et aucune ne donne la lecture du courrier :
 *   · `gmail.send`            — envoyer au nom de gestion@ (réponse, transfert, nouveau message) ;
 *   · `gmail.settings.basic`  — LIRE les signatures configurées dans Gmail (`sendAs`), pour les reprendre à l'identique ;
 *   · `drive`                 — ouvrir, déposer et joindre des pièces dans le Drive partagé.
 *
 * ⚠️ `gmail.readonly` n'y est PAS, et c'est délibéré : le courrier est déjà relevé en IMAP, en lecture stricte. Ajouter
 * la lecture Gmail donnerait un accès total à la boîte pour un besoin qui n'existe pas.
 */
export const PORTEES_GESTION: readonly string[] = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/drive',
];

export const ENDPOINT_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const ENDPOINT_TOKEN = 'https://oauth2.googleapis.com/token';
export const ENDPOINT_REVOCATION = 'https://oauth2.googleapis.com/revoke';
export const ENDPOINT_DRIVE_ABOUT = 'https://www.googleapis.com/drive/v3/about';
export const ENDPOINT_DRIVE_PARTAGES = 'https://www.googleapis.com/drive/v3/drives';
export const ENDPOINT_GMAIL_SENDAS = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs';

// ── Identifiants du client OAuth ──────────────────────────────────────────────────────────────────────────────────
export interface IdentifiantsGoogle { clientId: string; clientSecret: string; source: 'gestion' | 'drive' }

/**
 * Lit l'identifiant et le secret du client OAuth.
 *
 * DEUX SOURCES, dans cet ordre : les variables DÉDIÉES `GOOGLE_GESTION_CLIENT_*` si elles existent, sinon celles du
 * client Drive déjà en place. Le repli est délibéré : un client OAuth « application de bureau » peut porter plusieurs
 * autorisations indépendantes, et demander à Arno d'en créer un second pour rien serait une étape de plus à rater.
 * Qui veut deux clients séparés renseigne les variables dédiées — et `source` dit laquelle a servi, pour que l'écran
 * puisse le nommer.
 *
 * ⚠️ Rend `null` dès qu'une moitié manque : une demi-configuration produirait une page de consentement qui échoue
 * après le clic, c'est-à-dire au pire moment.
 */
export function lireIdentifiants(env: Record<string, string | undefined> = process.env): IdentifiantsGoogle | null {
  const gestionId = (env.GOOGLE_GESTION_CLIENT_ID ?? '').trim();
  const gestionSecret = (env.GOOGLE_GESTION_CLIENT_SECRET ?? '').trim();
  if (gestionId !== '' && gestionSecret !== '') return { clientId: gestionId, clientSecret: gestionSecret, source: 'gestion' };
  const driveId = (env.GOOGLE_DRIVE_CLIENT_ID ?? '').trim();
  const driveSecret = (env.GOOGLE_DRIVE_CLIENT_SECRET ?? '').trim();
  if (driveId !== '' && driveSecret !== '') return { clientId: driveId, clientSecret: driveSecret, source: 'drive' };
  return null;
}

// ── Fonctions PURES ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'adresse de la page de consentement. `access_type=offline` + `prompt=consent` : sans les deux, Google ne rend PAS
 * de jeton de rafraîchissement à la seconde autorisation, et l'on croit à tort que le script a échoué. `login_hint`
 * présélectionne gestion@ dans le sélecteur de compte — il ne remplace pas la vérification, qui se fait après coup. PUR.
 */
export function urlConsentement(o: { clientId: string; redirectUri: string; state: string; compte?: string }): string {
  const u = new URL(ENDPOINT_AUTH);
  u.searchParams.set('client_id', o.clientId);
  u.searchParams.set('redirect_uri', o.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', PORTEES_GESTION.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', o.state);
  u.searchParams.set('login_hint', o.compte ?? COMPTE_GESTION);
  return u.toString();
}

/** Est-ce bien le compte attendu ? Insensible à la casse et aux espaces : Google rend parfois l'adresse telle qu'écrite. PUR. */
export function estCompteAttendu(email: string | null | undefined, attendu = COMPTE_GESTION): boolean {
  return (email ?? '').trim().toLowerCase() === attendu.trim().toLowerCase();
}

/**
 * Ce qu'on DIT d'un jeton sans jamais le dire. Un jeton lu à l'écran finit dans un historique de terminal, une capture
 * d'écran ou un copier-coller ; sa longueur suffit à confirmer qu'il est là. PUR.
 */
export function masquerJeton(jeton: string | null | undefined): string {
  const j = (jeton ?? '').trim();
  return j === '' ? 'absent' : `présent (${j.length} caractères, non affiché)`;
}

/**
 * LES PREMIERS MOTS D'UNE SIGNATURE, en texte. La signature Gmail est du HTML : on retire les balises, on rend les
 * entités les plus courantes, on écrase les blancs, puis on coupe sur un MOT entier. Sert à confirmer qu'on lit bien
 * la bonne signature — jamais à la reproduire (le lot d'envoi reprendra le HTML tel quel). PUR.
 */
export function resumerSignature(html: string | null | undefined, max = 80): string {
  const brut = (html ?? '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, '’').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (brut === '') return '';
  if (brut.length <= max) return brut;
  const coupe = brut.slice(0, max);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > max / 2 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

// ── Entrées/sorties, toutes injectées ─────────────────────────────────────────────────────────────────────────────
export interface DepsGoogle { fetch: typeof fetch }

export interface JetonsObtenus { refreshToken: string; accessToken: string }

/** Un refus dit POURQUOI : « jeton refusé » et « compte inattendu » ne se réparent pas de la même façon. */
export type Resultat<T> = { ok: true; valeur: T } | { ok: false; motif: string };

/**
 * Échange le code de consentement contre un jeton de rafraîchissement.
 *
 * ⚠️ Une réponse SANS `refresh_token` n'est pas une panne mystérieuse : c'est Google qui refuse d'en redonner un parce
 * que l'application a déjà été autorisée par ce compte. Le motif le dit, avec la sortie (révoquer l'accès puis
 * recommencer) — sans quoi on cherche le bug dans le script pendant une heure.
 */
export async function echangerCode(
  o: { identifiants: IdentifiantsGoogle; code: string; redirectUri: string }, deps: DepsGoogle,
): Promise<Resultat<JetonsObtenus>> {
  const body = new URLSearchParams({
    code: o.code, client_id: o.identifiants.clientId, client_secret: o.identifiants.clientSecret,
    redirect_uri: o.redirectUri, grant_type: 'authorization_code',
  });
  const res = await deps.fetch(ENDPOINT_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = (await res.json().catch(() => ({}))) as
    { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!res.ok || j.error) {
    return { ok: false, motif: `Google a refusé l’échange du code : ${j.error ?? `HTTP ${res.status}`}${j.error_description ? ` — ${j.error_description}` : ''}` };
  }
  if (!j.access_token) return { ok: false, motif: 'Réponse de Google sans jeton d’accès.' };
  if (!j.refresh_token) {
    return {
      ok: false,
      motif: 'Google n’a pas renvoyé de jeton de rafraîchissement : ce compte a déjà autorisé cette application. '
        + 'Va sur myaccount.google.com/permissions, retire l’accès de l’application, puis relance la commande.',
    };
  }
  return { ok: true, valeur: { refreshToken: j.refresh_token, accessToken: j.access_token } };
}

/** Rafraîchit un jeton d'accès. Même forme que `permis/drive.ts` — un seul geste, un seul aller-retour. */
export async function rafraichirJeton(
  o: { identifiants: IdentifiantsGoogle; refreshToken: string }, deps: DepsGoogle,
): Promise<Resultat<string>> {
  const body = new URLSearchParams({
    client_id: o.identifiants.clientId, client_secret: o.identifiants.clientSecret,
    refresh_token: o.refreshToken, grant_type: 'refresh_token',
  });
  const res = await deps.fetch(ENDPOINT_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || j.error || !j.access_token) {
    return { ok: false, motif: `Jeton refusé par Google (${j.error ?? `HTTP ${res.status}`}). Il faut refaire l’autorisation.` };
  }
  return { ok: true, valeur: j.access_token };
}

export interface CompteGoogle { email: string; nom: string | null }

/**
 * QUI EST CONNECTÉ ? Demandé à Drive (`about`), en lecture, parce que c'est la seule des trois portées qui rend
 * l'adresse du compte sans exiger la lecture du courrier. C'est CE contrôle qui empêche d'enregistrer un jeton pour
 * une adresse personnelle au lieu de la boîte de gestion.
 */
export async function lireCompte(accessToken: string, deps: DepsGoogle): Promise<Resultat<CompteGoogle>> {
  const res = await deps.fetch(`${ENDPOINT_DRIVE_ABOUT}?fields=user(emailAddress,displayName)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, motif: `Compte illisible (HTTP ${res.status}) — la portée Drive est-elle bien accordée ?` };
  const j = (await res.json().catch(() => ({}))) as { user?: { emailAddress?: string; displayName?: string } };
  const email = (j.user?.emailAddress ?? '').trim();
  if (email === '') return { ok: false, motif: 'Google n’a pas rendu l’adresse du compte.' };
  return { ok: true, valeur: { email, nom: (j.user?.displayName ?? '').trim() || null } };
}

export interface SignatureGmail { adresse: string; parDefaut: boolean; signature: string | null }

/** Les signatures configurées dans Gmail (`sendAs`). LECTURE SEULE — portée `gmail.settings.basic`. */
export async function lireSignatures(accessToken: string, deps: DepsGoogle): Promise<Resultat<SignatureGmail[]>> {
  const res = await deps.fetch(ENDPOINT_GMAIL_SENDAS, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    return { ok: false, motif: `Signatures illisibles (HTTP ${res.status}) — la portée « paramètres Gmail » est-elle bien accordée ?` };
  }
  const j = (await res.json().catch(() => ({}))) as
    { sendAs?: { sendAsEmail?: string; isDefault?: boolean; signature?: string }[] };
  return {
    ok: true,
    valeur: (j.sendAs ?? []).map((s) => ({
      adresse: (s.sendAsEmail ?? '').trim(),
      parDefaut: s.isDefault === true,
      signature: s.signature && s.signature.trim() !== '' ? s.signature : null,
    })),
  };
}

/**
 * Les Drive PARTAGÉS visibles, NOMS SEULEMENT. On ne liste aucun fichier : savoir que le Drive « Gestion locative »
 * est atteignable suffit à confirmer l'accès, et lister son contenu ferait défiler des noms de locataires pour rien.
 */
export async function listerDrivesPartages(accessToken: string, deps: DepsGoogle): Promise<Resultat<string[]>> {
  const res = await deps.fetch(`${ENDPOINT_DRIVE_PARTAGES}?pageSize=100&fields=drives(name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, motif: `Drive partagés illisibles (HTTP ${res.status}).` };
  const j = (await res.json().catch(() => ({}))) as { drives?: { name?: string }[] };
  return { ok: true, valeur: (j.drives ?? []).map((d) => (d.name ?? '').trim()).filter((n) => n !== '') };
}
