/**
 * N6-B — accès Google Drive pour suivre les liens que Gmail substitue aux pièces jointes > 25 Mo. MODULE PROPRE et PUR par
 * INJECTION (un `deps` porte le `fetch` natif) → testable sans réseau. AUCUNE dépendance npm (pas de `googleapis`) : seulement
 * `fetch` natif. Aucun `import 'server-only'`, aucune base — importable par un CLI sans réveiller le piège du 09/08.
 *
 * Deux usages : (1) l'extraction PURE des identifiants de fichier depuis le corps du mail ; (2) le suivi RÉEL (rafraîchissement
 * du jeton OAuth, métadonnées, contenu) sous garde de taille/whitelist/plafonds. La fonctionnalité est active SSI les trois
 * variables d'environnement sont présentes (`lireConfigDrive`).
 */

// ── Constantes (endpoints + portée + plafonds) ────────────────────────────────
export const ENDPOINT_TOKEN = 'https://oauth2.googleapis.com/token';
export const ENDPOINT_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
/** Portée MINIMALE demandée à l'autorisation : lecture seule Drive. */
export const SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
/** Plafond du NOMBRE de fichiers Drive suivis par mail (garde 3) — au-delà, on s'arrête et l'alerte le dit. */
export const MAX_FICHIERS_DRIVE = 80;
/** Plafond du VOLUME total téléchargé par mail (garde 3) : 300 Mo — au-delà, on s'arrête et on verse ce qui a été obtenu. */
export const MAX_VOLUME_DRIVE_OCTETS = 300 * 1024 * 1024;

// ── Extraction PURE des identifiants ──────────────────────────────────────────
/** Motif STRICT : uniquement `drive.google.com/file/d/<ID>` (aucun dossier, aucune page de partage, aucune URL arbitraire). */
const RE_FILE_ID = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/g;

/**
 * Extrait les FILE_ID de liens Drive présents dans le corps texte ET/OU html. Dédoublonne en CONSERVANT l'ordre d'apparition
 * (texte d'abord, puis html). Ne suit JAMAIS une URL qui ne correspond pas au motif strict (elle est simplement ignorée).
 */
export function extraireIdsDrive(corpsTexte: string | null | undefined, corpsHtml: string | null | undefined): string[] {
  const ids: string[] = [];
  const vus = new Set<string>();
  for (const src of [corpsTexte ?? '', corpsHtml ?? '']) {
    for (const m of src.matchAll(RE_FILE_ID)) {
      const id = m[1];
      if (!vus.has(id)) { vus.add(id); ids.push(id); }
    }
  }
  return ids;
}

// ── Config (env) ──────────────────────────────────────────────────────────────
export interface ConfigDrive { clientId: string; clientSecret: string; refreshToken: string }
/** Lit les 3 variables d'environnement. `null` dès qu'UNE manque (fonctionnalité inactive — jamais une demi-config). */
export function lireConfigDrive(): ConfigDrive | null {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '').trim();
  const refreshToken = (process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? '').trim();
  if (clientId === '' || clientSecret === '' || refreshToken === '') return null;
  return { clientId, clientSecret, refreshToken };
}

// ── I/O injectable ────────────────────────────────────────────────────────────
export interface DepsDrive { fetch: typeof fetch }

export interface MetaFichierDrive { id: string; name: string; mimeType: string; size: number | null }
type ResultatMeta = { ok: true; meta: MetaFichierDrive } | { ok: false; motif: string };
type ResultatContenu = { ok: true; contenu: Buffer } | { ok: false; motif: string };

/** Rafraîchit le jeton d'accès via POST sur l'endpoint token. Jette (jeton refusé/expiré) → l'appelant en fait un motif distinct. */
export async function rafraichirJeton(config: ConfigDrive, deps: DepsDrive): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret,
    refresh_token: config.refreshToken, grant_type: 'refresh_token',
  });
  const res = await deps.fetch(ENDPOINT_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`jeton refusé (HTTP ${res.status})`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('réponse jeton sans access_token');
  return j.access_token;
}

/** Métadonnées d'un fichier : id, name, mimeType, size. 403/404 → « inaccessible » (motif distinguable, jamais opaque). */
export async function metadonnees(id: string, token: string, deps: DepsDrive): Promise<ResultatMeta> {
  const url = `${ENDPOINT_FICHIERS}/${encodeURIComponent(id)}?fields=id,name,mimeType,size`;
  const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403 || res.status === 404) return { ok: false, motif: `fichier inaccessible (HTTP ${res.status})` };
  if (!res.ok) return { ok: false, motif: `métadonnées indisponibles (HTTP ${res.status})` };
  const j = (await res.json()) as { id?: string; name?: string; mimeType?: string; size?: string };
  return { ok: true, meta: { id: j.id ?? id, name: (j.name ?? '').trim() || '(sans nom)', mimeType: j.mimeType ?? 'application/octet-stream', size: j.size != null && j.size !== '' ? Number(j.size) : null } };
}

/** Contenu binaire (alt=media). 403/404 → « inaccessible ». Renvoie un Buffer (jamais parsé/ouvert ici). */
export async function telechargerContenu(id: string, token: string, deps: DepsDrive): Promise<ResultatContenu> {
  const url = `${ENDPOINT_FICHIERS}/${encodeURIComponent(id)}?alt=media`;
  const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403 || res.status === 404) return { ok: false, motif: `fichier inaccessible (HTTP ${res.status})` };
  if (!res.ok) return { ok: false, motif: `téléchargement impossible (HTTP ${res.status})` };
  return { ok: true, contenu: Buffer.from(await res.arrayBuffer()) };
}

// ── Récupération sous GARDES ──────────────────────────────────────────────────
export interface PieceDrive { nomFichier: string; typeMime: string | null; contenu: Buffer }
export interface EchecDrive { ref: string; motif: string }
/** Résultat du suivi des liens Drive d'UN mail. `configure:false` = 3 vars absentes ; `jetonRefuse` = OAuth KO ; sinon bilan. */
export type ResultatDrive =
  | { configure: false }
  | { configure: true; jetonRefuse: true }
  | { configure: true; jetonRefuse?: false; pieces: PieceDrive[]; echecs: EchecDrive[]; plafondFichiers: boolean; plafondVolume: boolean };

export interface LimitesDrive {
  tailleMaxOctets: number;                       // garde 2 : borne de taille (piece_taille_max_mo réutilisée)
  maxFichiers: number;                           // garde 3 : plafond du nombre de fichiers
  maxVolumeOctets: number;                       // garde 3 : plafond du volume total
  mimeAutorise: (mime: string | null) => boolean; // garde 2 : whitelist MIME réutilisée (extensionEntrante)
}

const mo = (n: number): string => (n / (1024 * 1024)).toFixed(1);

/**
 * Suit les liens Drive et FABRIQUE la liste de pièces (nom, mime, contenu) — la SUITE (rapprochement, versement, alerte, fiche)
 * est le code existant, inchangé. Toutes les gardes ici, chacune avec un motif DISTINGUABLE (jamais un catch muet) :
 *   - jeton refusé/expiré → `jetonRefuse` ;
 *   - taille contrôlée sur les MÉTADONNÉES AVANT téléchargement (on ne télécharge pas 21 Mo pour les refuser ensuite) ;
 *   - fichier natif Google (application/vnd.google-apps.*) → non téléchargeable par alt=media → ignoré avec motif ;
 *   - type hors whitelist → ignoré avec motif ; 403/404 → « inaccessible » ;
 *   - plafond de NOMBRE (les ids au-delà sont ignorés) et de VOLUME (arrêt, on verse ce qui est obtenu) → drapeaux dédiés.
 * Le nom et le type mime FONT FOI depuis les métadonnées ; `nomsReplis` (nom lu dans le corps) ne sert QUE si la métadonnée échoue.
 */
export async function recupererFichiersDrive(
  ids: string[], config: ConfigDrive, deps: DepsDrive, lim: LimitesDrive, nomsReplis: Record<string, string> = {},
): Promise<ResultatDrive> {
  let token: string;
  try { token = await rafraichirJeton(config, deps); }
  catch { return { configure: true, jetonRefuse: true }; }

  const pieces: PieceDrive[] = [];
  const echecs: EchecDrive[] = [];
  let volume = 0;
  let plafondVolume = false;
  const plafondFichiers = ids.length > lim.maxFichiers;
  const aTraiter = ids.slice(0, lim.maxFichiers);

  for (const id of aTraiter) {
    const repli = nomsReplis[id];
    const m = await metadonnees(id, token, deps);
    if (!m.ok) { echecs.push({ ref: repli ?? id, motif: m.motif }); continue; }
    const { name, mimeType, size } = m.meta;

    if (mimeType.startsWith('application/vnd.google-apps.')) { echecs.push({ ref: name, motif: `fichier natif Google (${mimeType}) — non téléchargeable` }); continue; }
    if (!lim.mimeAutorise(mimeType)) { echecs.push({ ref: name, motif: `type non autorisé : ${mimeType}` }); continue; }
    if (size !== null && size > lim.tailleMaxOctets) { echecs.push({ ref: name, motif: `trop volumineux : ${mo(size)} Mo (maximum ${mo(lim.tailleMaxOctets)} Mo)` }); continue; }
    // Plafond de VOLUME : pré-contrôle sur la métadonnée (pas de téléchargement inutile). Taille inconnue → contrôle après.
    if (size !== null && volume + size > lim.maxVolumeOctets) { plafondVolume = true; break; }

    const dl = await telechargerContenu(id, token, deps);
    if (!dl.ok) { echecs.push({ ref: name, motif: dl.motif }); continue; }
    if (dl.contenu.length > lim.tailleMaxOctets) { echecs.push({ ref: name, motif: `trop volumineux : ${mo(dl.contenu.length)} Mo (maximum ${mo(lim.tailleMaxOctets)} Mo)` }); continue; }

    pieces.push({ nomFichier: name, typeMime: mimeType, contenu: dl.contenu });
    volume += dl.contenu.length;
    if (volume >= lim.maxVolumeOctets) { plafondVolume = true; break; } // plafond atteint APRÈS ce fichier → on s'arrête
  }

  return { configure: true, pieces, echecs, plafondFichiers, plafondVolume };
}
