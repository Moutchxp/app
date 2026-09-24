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
 * LES TROIS PORTÉES, ET RIEN DE PLUS. Chacune répond à un besoin nommé :
 *   · `gmail.modify`          — lire un message, changer ses libellés (étoile, non lu, spam), et ENVOYER ;
 *   · `gmail.settings.basic`  — lire les signatures (`sendAs`) et créer un filtre de blocage, comme le fait Gmail ;
 *   · `drive`                 — ouvrir, déposer et joindre des pièces dans le Drive partagé.
 *
 * 🔴 LOT 5-FIDÈLE — `gmail.modify` REMPLACE `gmail.send`. La boîte de l'écran doit agir sur la VRAIE boîte Gmail de
 * l'équipe : mettre une étoile, marquer non lu, signaler un spam, retrouver l'original d'un message. Aucune de ces
 * actions n'est possible avec `gmail.send`, qui ne sait qu'expédier.
 *
 * ⚠️ CE QUE `gmail.modify` NE DONNE PAS, et c'est exactement pourquoi on s'arrête là : **la suppression définitive**.
 * Google réserve celle-ci à `https://mail.google.com/` (la portée totale), que nous ne demandons PAS. Tout ce que
 * l'outil peut faire à la boîte est donc RÉVERSIBLE depuis Gmail — mettre à la corbeille se défait, un libellé se
 * retire, un filtre se supprime. Aucun geste d'ici ne peut effacer un mail pour de bon.
 */
export const PORTEES_GESTION: readonly string[] = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/drive',
];

export const ENDPOINT_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const ENDPOINT_TOKEN = 'https://oauth2.googleapis.com/token';
export const ENDPOINT_REVOCATION = 'https://oauth2.googleapis.com/revoke';
export const ENDPOINT_DRIVE_ABOUT = 'https://www.googleapis.com/drive/v3/about';
export const ENDPOINT_DRIVE_PARTAGES = 'https://www.googleapis.com/drive/v3/drives';
export const ENDPOINT_GMAIL_SENDAS = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs';
/** LOT 5-FIDÈLE — les messages de la boîte : les chercher, les lire, changer leurs libellés. */
export const ENDPOINT_GMAIL_MESSAGES = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
/** LOT 5-FIDÈLE — les filtres, pour reproduire le blocage d'un expéditeur exactement comme Gmail le fait. */
export const ENDPOINT_GMAIL_FILTRES = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/filters';

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

/**
 * LA SIGNATURE ENTIÈRE, en TEXTE. `resumerSignature` n'en donne que les premiers mots pour un contrôle ; celle-ci la
 * rend complète, en préservant les RETOURS À LA LIGNE — une signature sans ses sauts de ligne n'est plus une
 * signature, c'est une phrase. PUR.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CORRECTIF DU 24/09/2026 — LA SIGNATURE S'AÉRAIT TOUTE SEULE. Elle arrivait dans le brouillon avec une ligne vide
 * entre chaque ligne. La cause : on traduisait chaque balise de FERMETURE de bloc par un retour à la ligne. Or Gmail
 * imbrique ses blocs — <div><div>CRITERIMMO</div><div>01 23 45 67 89</div></div> : la ligne se termine par SON
 * </div> ET par celui du bloc qui la contient, donc par DEUX retours.
 *
 * LA CORRECTION tient à une distinction que le code ne faisait pas :
 *   · un <br> est un retour VOULU par la personne qui a écrit la signature → il compte, toujours ;
 *   · une balise de bloc (ouvrante OU fermante) n'est qu'une FRONTIÈRE → elle sépare, elle n'ajoute rien.
 * On découpe donc sur les frontières, on jette les morceaux vides (l'imbrication n'en produit que des vides), et on
 * rejoint par un seul retour. Les lignes vides voulues survivent : Gmail les écrit <div><br></div>, dont le morceau
 * contient précisément un retour voulu.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function signatureEnTexte(html: string | null | undefined): string {
  // Deux marqueurs qui ne peuvent pas apparaître dans du texte de signature : on distingue le retour VOULU (<br>) de
  //   la simple FRONTIÈRE de bloc, puis on les traite différemment. Ils disparaissent tous les deux à la fin.
  const RETOUR_VOULU = '\u0001';
  const FRONTIERE = '\u0002';
  const morceaux = (html ?? '')
    .replace(/<\s*br\s*\/?>/gi, RETOUR_VOULU)
    .replace(/<\s*\/?\s*(p|div|tr|li|h[1-6]|table|tbody|thead|ul|ol|blockquote|section|article)\b[^>]*>/gi, FRONTIERE)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, '\u2019').replace(/&quot;/gi, '"')
    .split(FRONTIERE)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    // 🔴 LES MORCEAUX VIDES SAUTENT. Ce sont eux, et eux seuls, que l'imbrication des blocs fabriquait — et c'est
    //   d'eux que venaient les lignes vides. Un morceau qui ne porte qu'un retour voulu n'est PAS vide : il reste.
    .filter((l) => l !== '');
  return morceaux.join('\n')
    .split(RETOUR_VOULU).join('\n')
    // Trois retours ou plus n'ont jamais de sens : deux disent déjà « on change de bloc ».
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

// ══ LOT 5-FIDÈLE — AGIR SUR LA VRAIE BOÎTE GMAIL ══════════════════════════════════════════════════════════════════
//
// 🔴 TOUT EST RÉVERSIBLE DEPUIS GMAIL, et rien ici ne demande une suppression définitive : on ne fait que POSER ou
// RETIRER des libellés (`STARRED`, `UNREAD`, `SPAM`, `INBOX`) et créer un filtre — trois gestes que l'équipe défait
// elle-même depuis Gmail, avec les commandes qu'elle connaît déjà. La portée totale `mail.google.com`, seule à
// permettre l'effacement, n'est pas demandée (voir `PORTEES_GESTION`).

/** Ce que Gmail sait d'un message. `libelles` porte l'étoile, le non-lu, le spam — c'est l'état VRAI, pas le nôtre. */
export interface MessageGmail {
  id: string;
  threadId: string;
  libelles: string[];
}

/** Les libellés système dont l'écran se sert. Écrits une fois : une faute de frappe ici serait muette côté Gmail. */
export const LIBELLE_ETOILE = 'STARRED';
export const LIBELLE_NON_LU = 'UNREAD';
export const LIBELLE_SPAM = 'SPAM';
export const LIBELLE_RECEPTION = 'INBOX';

/**
 * RETROUVE le message Gmail à partir de NOTRE `Message-ID` RFC. C'est le seul pont fiable entre notre base et la
 * boîte : l'identifiant Gmail n'existe nulle part chez nous tant qu'on ne l'a pas demandé, et le `Message-ID`, lui,
 * est écrit dans le message lui-même — il ne bouge jamais.
 *
 * `rfc822msgid:` est l'opérateur de recherche prévu pour ça. Les chevrons sont retirés : Gmail les refuse.
 * `null` = introuvable — un message capturé depuis une autre boîte, ou effacé de Gmail. Ce n'est PAS une erreur, et
 * l'écran doit pouvoir le dire tel quel.
 */
export async function chercherParMessageId(
  accessToken: string, messageIdRfc: string, deps: DepsGoogle,
): Promise<Resultat<MessageGmail | null>> {
  const nu = messageIdRfc.trim().replace(/^</, '').replace(/>$/, '');
  if (nu === '') return { ok: true, valeur: null };
  const url = `${ENDPOINT_GMAIL_MESSAGES}?q=${encodeURIComponent(`rfc822msgid:${nu}`)}&maxResults=1`;
  const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: `Recherche Gmail impossible (HTTP ${res.status}).` };
  const j = (await res.json().catch(() => ({}))) as { messages?: { id?: string; threadId?: string }[] };
  const trouve = j.messages?.[0];
  if (!trouve?.id) return { ok: true, valeur: null };
  return { ok: true, valeur: { id: trouve.id, threadId: trouve.threadId ?? trouve.id, libelles: [] } };
}

/**
 * LIT un message Gmail : son fil, et surtout ses LIBELLÉS — c'est de là que viennent l'étoile et le non-lu affichés.
 * `format=metadata` : on ne rapatrie ni le corps ni les pièces, dont nous avons déjà notre propre copie.
 */
export async function lireMessageGmail(
  accessToken: string, id: string, deps: DepsGoogle,
): Promise<Resultat<MessageGmail>> {
  const url = `${ENDPOINT_GMAIL_MESSAGES}/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-Id`;
  const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return { ok: false, motif: 'Ce message n’existe plus dans Gmail.' };
  if (!res.ok) return { ok: false, motif: `Lecture Gmail impossible (HTTP ${res.status}).` };
  const j = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; labelIds?: string[] };
  return { ok: true, valeur: { id: j.id ?? id, threadId: j.threadId ?? id, libelles: j.labelIds ?? [] } };
}

/**
 * POSE ou RETIRE des libellés. C'est ce geste, et lui seul, qui porte l'étoile, le « non lu » et le signalement de
 * spam — exactement comme le clic correspondant dans Gmail, et défaisable de la même façon.
 *
 * ⚠️ On ne passe JAMAIS `TRASH` ici : mettre à la corbeille n'est pas demandé par ce lot, et la suppression
 * définitive n'est pas dans nos portées. Un appel qui le tenterait serait refusé par Google, pas par nous — mais
 * autant ne pas l'écrire.
 */
export async function modifierLibelles(
  accessToken: string, id: string, o: { ajouter?: readonly string[]; retirer?: readonly string[] }, deps: DepsGoogle,
): Promise<Resultat<MessageGmail>> {
  const res = await deps.fetch(`${ENDPOINT_GMAIL_MESSAGES}/${encodeURIComponent(id)}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ addLabelIds: o.ajouter ?? [], removeLabelIds: o.retirer ?? [] }),
  });
  if (res.status === 404) return { ok: false, motif: 'Ce message n’existe plus dans Gmail.' };
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, motif: `Gmail a refusé la modification : ${j.error?.message ?? `HTTP ${res.status}`}` };
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; labelIds?: string[] };
  return { ok: true, valeur: { id: j.id ?? id, threadId: j.threadId ?? id, libelles: j.labelIds ?? [] } };
}

/**
 * LE MESSAGE ORIGINAL, tel que Gmail l'a reçu (`format=raw`, base64 « URL-safe »). Sert à deux entrées du menu :
 * « Afficher l'original » et « Télécharger le message » (.eml). C'est la SOURCE, jamais notre reconstitution — ce
 * qu'on veut voir quand on cherche pourquoi un mail est arrivé de travers.
 */
export async function lireOriginalGmail(
  accessToken: string, id: string, deps: DepsGoogle,
): Promise<Resultat<string>> {
  const res = await deps.fetch(`${ENDPOINT_GMAIL_MESSAGES}/${encodeURIComponent(id)}?format=raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { ok: false, motif: 'Ce message n’existe plus dans Gmail.' };
  if (!res.ok) return { ok: false, motif: `Original illisible (HTTP ${res.status}).` };
  const j = (await res.json().catch(() => ({}))) as { raw?: string };
  if (!j.raw) return { ok: false, motif: 'Gmail n’a pas rendu l’original de ce message.' };
  return { ok: true, valeur: Buffer.from(j.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') };
}

/**
 * BLOQUE un expéditeur, en créant dans Gmail le MÊME filtre que le blocage de Gmail : les futurs messages de cette
 * adresse ne passent plus par la boîte de réception, ils vont dans les indésirables.
 *
 * ⚠️ HONNÊTETÉ SUR CE POINT : l'équivalence exacte avec le bouton « Bloquer » de Gmail n'a PAS pu être vérifiée
 * contre l'API réelle (aucune connexion n'a été faite dans ce lot). Si Google refuse cette combinaison de libellés
 * dans un filtre, le refus remonte tel quel à l'écran — on ne fait jamais semblant d'avoir bloqué.
 *
 * 🔴 RÉVERSIBLE : le filtre se supprime depuis Gmail (Paramètres → Filtres et adresses bloquées), et rien n'est
 * effacé — les messages déjà reçus ne bougent pas.
 */
export async function creerFiltreBlocage(
  accessToken: string, adresse: string, deps: DepsGoogle,
): Promise<Resultat<string>> {
  const res = await deps.fetch(ENDPOINT_GMAIL_FILTRES, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      criteria: { from: adresse },
      action: { addLabelIds: [LIBELLE_SPAM], removeLabelIds: [LIBELLE_RECEPTION] },
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, motif: `Gmail a refusé le blocage : ${j.error?.message ?? `HTTP ${res.status}`}` };
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, valeur: j.id ?? '' };
}
