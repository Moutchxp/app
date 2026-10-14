/**
 * ══ VÉRIFICATION DES COMPTES D'ENVOI SANS RIEN ENVOYER (lot PRÉPARATIFS DE BASCULE, 14/10/2026) ═════════════════════════
 *
 * Pour chaque compte qui écrit vers l'extérieur, une vérification qui PROUVE l'accès sans aucun effet :
 *   · SMTP (compte par défaut `SMTP_*`, profil « personne » `SMTP_PERSONNE_*` — les seuls comptes SMTP de l'inventaire,
 *     `docs/BASCULE_CHECKLIST.md`) : `transporter.verify()` de nodemailer = connexion, EHLO, STARTTLS / TLS, AUTH, puis
 *     QUIT. VÉRIFIÉ dans nodemailer 9.0.5 (`lib/smtp-transport/index.js`, `verify`) : ni MAIL FROM, ni RCPT, ni DATA.
 *     Le transport est celui de la production (`obtenirTransporteur`), pour vérifier les MÊMES réglages ;
 *   · API Gmail de gestion@ : jeton rafraîchi, puis `GET users/me/profile` (l'adresse de la boîte) — lecture seule ;
 *   · Agenda par délégation : jeton `calendar.events` au nom d'une adresse, puis `GET …/events?maxResults=1` (le
 *     prochain événement : sa date seulement, jamais son titre) — lecture seule.
 *   · Drive par délégation (complément du lot DRIVE, 14/10/2026) : jeton `drive` au nom de gestion@, puis les
 *     MÉTADONNÉES (id, nom) de la racine de l'application — « Base de données locative », identifiant lu en base
 *     (`gestion_drive_arbre`, sorte « racine ») — et le NOMBRE de ses enfants directs (identifiants seulement).
 *     Aucune lecture de contenu, aucune écriture, aucun autre dossier.
 *
 * 🔴 « Documents clients scannés » (GESTION LOCATIVE › 1 actifs / 2 vendus / 3 perdus) : tout dossier portant l'un de
 * ces noms est REFUSÉ par garde-fou codé, avant tout appel (`estNomProtege`) et à la lecture des métadonnées.
 *
 * 🔒 GARDE-FOUS PAR CONSTRUCTION, éprouvés par les tests :
 *   · le transport SMTP n'est manipulé que par `verify()` et `close()` — `sendMail` n'est jamais appelé ;
 *   · tout appel HTTP passe par `fetchLectureSeule` : seuls la demande de jeton (POST au point d'échange OAuth) et les
 *     deux lectures (GET) ci-dessus sont permis ; toute autre adresse ou méthode est refusée AVANT de partir.
 */
import type { CompteSmtp } from '../email';

export const ENDPOINT_JETON_GOOGLE = 'https://oauth2.googleapis.com/token';
export const ENDPOINT_GMAIL_PROFIL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
export const PREFIXE_AGENDA = 'https://www.googleapis.com/calendar/v3/calendars/';

export interface ResultatVerification {
  quoi: string;
  ok: boolean;
  detail: string;
}

/** Les comptes SMTP de l'inventaire : infixe des variables d'environnement → nom lisible. */
export const COMPTES_SMTP: readonly { nom: string; infixe: string }[] = [
  { nom: 'SMTP compte par défaut (SMTP_*) — alertes, certificats, réinitialisations, profil « entreprise »', infixe: '' },
  { nom: 'SMTP profil « personne » (SMTP_PERSONNE_*)', infixe: 'PERSONNE_' },
];

/** Le strict nécessaire d'un transport pour le vérifier : rien qui permette d'envoyer. */
export interface TransportVerifiable {
  verify(): Promise<unknown>;
  close(): void;
}

/** Le motif d'une erreur, sans jamais y recopier un secret. PUR. */
export function motifErreur(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const morceaux = [err?.code, err?.responseCode ? `SMTP ${err.responseCode}` : undefined, err?.message]
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return morceaux.join(' — ') || String(e);
}

/**
 * Vérifie un compte SMTP : connexion + authentification, puis fermeture. `transport` ne sert QU'À `verify()` et
 * `close()` (le type `TransportVerifiable` ne permet rien d'autre).
 */
export async function verifierCompteSmtp(nom: string, compte: CompteSmtp | null, creer: (c: CompteSmtp) => TransportVerifiable): Promise<ResultatVerification> {
  if (compte === null) return { quoi: nom, ok: false, detail: 'non configuré (variable manquante ou mal formée)' };
  const qui = `${compte.host}:${compte.port} (${compte.port === 465 ? 'TLS' : 'STARTTLS'}), utilisateur ${compte.user}`;
  const t = creer(compte);
  try {
    await t.verify();
    return { quoi: nom, ok: true, detail: `${qui} — connexion et authentification acceptées` };
  } catch (e) {
    return { quoi: nom, ok: false, detail: `${qui} — ${motifErreur(e)}` };
  } finally {
    try { t.close(); } catch { /* déjà fermé */ }
  }
}

/**
 * Le seul `fetch` des vérifications Google : POST vers le point d'échange de jeton, GET du profil Gmail, GET de la
 * liste d'événements d'UN agenda. Toute autre requête est refusée sans partir.
 */
export function fetchLectureSeule(fetchReel: typeof fetch): typeof fetch {
  return (async (entree: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = (init?.method ?? 'GET').toUpperCase();
    const permis =
      (methode === 'POST' && url === ENDPOINT_JETON_GOOGLE)
      || (methode === 'GET' && url === ENDPOINT_GMAIL_PROFIL)
      || (methode === 'GET' && url.startsWith(PREFIXE_AGENDA) && /^[^/]+\/events\?/.test(url.slice(PREFIXE_AGENDA.length)));
    if (!permis) throw new Error(`requête refusée par la vérification en lecture seule : ${methode} ${url.split('?')[0]}`);
    return fetchReel(entree, init);
  }) as typeof fetch;
}

/** API Gmail de gestion@ : un jeton rafraîchi, puis l'adresse de la boîte (lecture seule). */
export async function verifierGmail(deps: {
  fetch: typeof fetch;
  /** Rend un jeton d'accès (rafraîchi) ou le motif de l'échec. */
  jetonAcces: (f: typeof fetch) => Promise<{ ok: true; valeur: string } | { ok: false; motif: string }>;
  compteAttendu: string;
}): Promise<ResultatVerification> {
  const quoi = 'API Gmail de gestion@ (lecture du profil)';
  try {
    const f = fetchLectureSeule(deps.fetch);
    const j = await deps.jetonAcces(f);
    if (!j.ok) return { quoi, ok: false, detail: j.motif };
    const r = await f(ENDPOINT_GMAIL_PROFIL, { headers: { Authorization: `Bearer ${j.valeur}` } });
    if (!r.ok) return { quoi, ok: false, detail: `profil illisible (HTTP ${r.status})` };
    const p = (await r.json().catch(() => ({}))) as { emailAddress?: string };
    const adresse = (p.emailAddress ?? '').trim().toLowerCase();
    if (adresse !== deps.compteAttendu.toLowerCase()) return { quoi, ok: false, detail: `le jeton ouvre « ${adresse || '?'} », pas ${deps.compteAttendu}` };
    return { quoi, ok: true, detail: `boîte ${adresse} accessible` };
  } catch (e) {
    return { quoi, ok: false, detail: motifErreur(e) };
  }
}

/** Agenda par délégation : un jeton au nom de `adresse`, puis le prochain événement (sa date seulement). */
export async function verifierAgenda(adresse: string, deps: {
  fetch: typeof fetch;
  jetonAgenda: (adresse: string, f: typeof fetch) => Promise<{ ok: true; jeton: string } | { ok: false; motif: string }>;
  maintenant: () => Date;
}): Promise<ResultatVerification> {
  const quoi = `Agenda Google par délégation (${adresse}, lecture d'un événement)`;
  try {
    const f = fetchLectureSeule(deps.fetch);
    const j = await deps.jetonAgenda(adresse, f);
    if (!j.ok) return { quoi, ok: false, detail: j.motif };
    const q = new URLSearchParams({
      maxResults: '1', singleEvents: 'true', orderBy: 'startTime', timeMin: deps.maintenant().toISOString(), fields: 'items(start)',
    });
    const r = await f(`${PREFIXE_AGENDA}${encodeURIComponent(adresse)}/events?${q.toString()}`, { headers: { Authorization: `Bearer ${j.jeton}` } });
    if (!r.ok) return { quoi, ok: false, detail: `agenda illisible (HTTP ${r.status})` };
    const corps = (await r.json().catch(() => ({}))) as { items?: { start?: { dateTime?: string; date?: string } }[] };
    const prochain = corps.items?.[0]?.start;
    return { quoi, ok: true, detail: prochain ? `accessible — prochain événement le ${prochain.dateTime ?? prochain.date}` : 'accessible — aucun événement à venir' };
  } catch (e) {
    return { quoi, ok: false, detail: motifErreur(e) };
  }
}

// ── Drive (lecture seule stricte) ─────────────────────────────────────────────────────────────────────────────────────

export const ENDPOINT_DRIVE_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
/** Le nom de la racine de l'application (même valeur que `RACINE_NOM`, `gestion/driveGardeFou.ts`). */
export const NOM_RACINE_APPLICATION = 'Base de données locative';
/** L'archive interdite et ses sous-dossiers (mêmes valeurs que `PRODUCTION_INTERDITE` et `SOUS_DOSSIERS_PRODUCTION`). */
export const NOMS_PROTEGES: readonly string[] = ['Documents clients scannés', '1 actifs', '2 vendus', '3 perdus'];
const CHAMPS_RACINE = 'id,name,mimeType';
const CHAMPS_ENFANTS = 'nextPageToken,files(id)';
const PAGES_MAX = 50;

/** Comparaison sans accents, sans casse, espaces réduits. PUR. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ce nom est-il celui de l'archive interdite ou de l'un de ses sous-dossiers ? PUR. */
export function estNomProtege(nom: string | null | undefined): boolean {
  const n = normaliser(nom ?? '');
  return NOMS_PROTEGES.some((p) => normaliser(p) === n);
}

/** La requête de liste autorisée : les enfants directs de la racine, non mis à la corbeille. PUR. */
export function requeteEnfants(racineId: string): string {
  return `'${racineId}' in parents and trashed = false`;
}

/**
 * Le seul `fetch` de la vérification Drive. Permis : POST du jeton ; GET des métadonnées de LA racine (champs id, nom,
 * type ; jamais `alt=media`) ; GET de la liste de SES enfants directs (identifiants seulement). Tout le reste —
 * téléversement, copie, modification, corbeille, suppression, partage, contenu, tout autre dossier — est refusé
 * AVANT de partir.
 */
export function fetchDriveLectureSeule(fetchReel: typeof fetch, racineId: string): typeof fetch {
  return (async (entree: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const brut = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = (init?.method ?? 'GET').toUpperCase();
    const refuser = (pourquoi: string): never => { throw new Error(`requête Drive refusée (lecture seule) : ${methode} ${brut.split('?')[0]} — ${pourquoi}`); };
    if (methode === 'POST' && brut === ENDPOINT_JETON_GOOGLE) return fetchReel(entree, init);
    if (methode !== 'GET') refuser('seules les lectures sont permises');
    const u = new URL(brut);
    if (u.searchParams.has('alt')) refuser('aucune lecture de contenu');
    if (u.origin + u.pathname === `${ENDPOINT_DRIVE_FICHIERS}/${encodeURIComponent(racineId)}`) {
      if (u.searchParams.get('fields') !== CHAMPS_RACINE) refuser('champs non permis');
      return fetchReel(entree, init);
    }
    if (u.origin + u.pathname === ENDPOINT_DRIVE_FICHIERS) {
      if (u.searchParams.get('q') !== requeteEnfants(racineId)) refuser('seuls les enfants directs de la racine');
      if (u.searchParams.get('fields') !== CHAMPS_ENFANTS) refuser('identifiants seulement');
      return fetchReel(entree, init);
    }
    return refuser('adresse non permise');
  }) as typeof fetch;
}

/** Drive par délégation : métadonnées de la racine de l'application et nombre de ses enfants directs. */
export async function verifierDrive(deps: {
  fetch: typeof fetch;
  /** La racine enregistrée en base (`gestion_drive_arbre`, sorte « racine »), ou null. */
  lireRacine: () => Promise<{ id: string; nom: string } | null>;
  jetonDrive: (sujet: string, f: typeof fetch) => Promise<{ ok: true; jeton: string } | { ok: false; motif: string }>;
  sujet: string;
}): Promise<ResultatVerification> {
  const quoi = `Drive par délégation (${deps.sujet}, racine de l'application : métadonnées et enfants directs)`;
  try {
    const racine = await deps.lireRacine();
    if (racine === null || racine.id.trim() === '') return { quoi, ok: false, detail: 'aucune racine « Base de données locative » enregistrée en base' };
    if (estNomProtege(racine.nom)) return { quoi, ok: false, detail: `REFUSÉ : « ${racine.nom} » est un dossier protégé — aucun accès` };
    const f = fetchDriveLectureSeule(deps.fetch, racine.id);
    const j = await deps.jetonDrive(deps.sujet, f);
    if (!j.ok) return { quoi, ok: false, detail: j.motif };
    const entete = { headers: { Authorization: `Bearer ${j.jeton}` } };
    const qm = new URLSearchParams({ fields: CHAMPS_RACINE, supportsAllDrives: 'true' });
    const rm = await f(`${ENDPOINT_DRIVE_FICHIERS}/${encodeURIComponent(racine.id)}?${qm.toString()}`, entete);
    if (!rm.ok) return { quoi, ok: false, detail: `racine illisible (HTTP ${rm.status})` };
    const meta = (await rm.json().catch(() => ({}))) as { id?: string; name?: string };
    if (estNomProtege(meta.name)) return { quoi, ok: false, detail: `REFUSÉ : l'identifiant enregistré désigne « ${meta.name} », dossier protégé — arrêt` };
    if (meta.name !== NOM_RACINE_APPLICATION) return { quoi, ok: false, detail: `l'identifiant enregistré désigne « ${meta.name ?? '?'} », pas « ${NOM_RACINE_APPLICATION} »` };
    let enfants = 0;
    let page: string | undefined;
    for (let i = 0; i < PAGES_MAX; i += 1) {
      const ql = new URLSearchParams({
        q: requeteEnfants(racine.id), fields: CHAMPS_ENFANTS, pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
        ...(page ? { pageToken: page } : {}),
      });
      const rl = await f(`${ENDPOINT_DRIVE_FICHIERS}?${ql.toString()}`, entete);
      if (!rl.ok) return { quoi, ok: false, detail: `enfants illisibles (HTTP ${rl.status})` };
      const l = (await rl.json().catch(() => ({}))) as { files?: unknown[]; nextPageToken?: string };
      enfants += (l.files ?? []).length;
      page = l.nextPageToken;
      if (!page) break;
    }
    return { quoi, ok: true, detail: `racine « ${meta.name} » (${meta.id ?? racine.id}) accessible — ${enfants} enfant(s) direct(s)` };
  } catch (e) {
    return { quoi, ok: false, detail: motifErreur(e) };
  }
}
