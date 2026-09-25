/**
 * MODULE « GESTION » — LOT 5-PJ-B : PARCOURIR LE DRIVE EXISTANT, ET Y DÉPOSER UNE COPIE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA RÈGLE MÉTIER, POSÉE PAR ARNO LE 25/09 : « NE PAS RÉINVENTER LE MONDE ». Le Drive contient DÉJÀ un dossier par
 * propriétaire, construit à la main depuis des années. Ce module ne crée AUCUNE arborescence, ne renomme rien, ne
 * déplace rien, ne supprime rien, ne touche à aucun partage. Il sait faire exactement trois choses :
 *   ① LISTER les dossiers d'un dossier (pour naviguer) ;
 *   ② CHERCHER un dossier par son nom (pour ne pas naviguer quand on sait où l'on va) ;
 *   ③ DÉPOSER un fichier dans un dossier choisi par un humain.
 *
 * 🔴 CE QU'IL N'Y A PAS ICI, ET QU'ON NE DOIT PAS Y AJOUTER SANS DEMANDE EXPLICITE : `files.delete`, `files.update`
 * (renommage, déplacement de parent), `permissions.*`. Ce qui n'est pas écrit ne peut pas être appelé par erreur —
 * c'est la même protection que pour `clientEntetes.ts`, qui n'expose aucune écriture IMAP.
 *
 * ⚠️ MESURÉ le 25/09/2026 : le compte `gestion@criterimmo.fr` voit ~15 000 dossiers répartis sur trois Drive partagés
 * (GESTION LOCATIVE 5 760, SANSVISAVIS 6 041, Direction 3 123) et son Mon Drive (334), avec une profondeur allant
 * jusqu'à 13 niveaux. D'où deux conséquences de conception : on ne liste JAMAIS tout (navigation paresseuse, niveau
 * par niveau), et la recherche par nom est indispensable — personne ne descend treize niveaux à la main.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Sur le patron de `google.ts` : aucune dépendance npm, `fetch` INJECTÉ → tout s'éprouve sans réseau.
 */
import type { DepsGoogle, Resultat } from './google';

const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
const API_TELEVERSEMENT = 'https://www.googleapis.com/upload/drive/v3/files';

/** Le type MIME d'un dossier Drive. Écrit une fois : une faute de frappe ici rendrait toute navigation vide. */
export const MIME_DOSSIER = 'application/vnd.google-apps.folder';

/** Les paramètres que TOUTE requête doit porter pour voir les Drive partagés. Oubliés, les dossiers d'équipe sont invisibles. */
const PARTAGES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } as const;

export interface DossierDrive {
  id: string;
  nom: string;
  /** Identifiant du Drive partagé, ou `null` pour « Mon Drive ». Sert à savoir d'où vient un dossier dans une recherche. */
  driveId: string | null;
}

/** Une étape du fil d'Ariane, de la racine vers le dossier courant. */
export interface EtapeAriane { id: string; nom: string }

/**
 * ÉCHAPPE une valeur destinée à une requête Drive (`q=`). Les apostrophes et les antislashs y sont des délimiteurs :
 * un dossier nommé « L'Orne » couperait la requête en deux et la ferait échouer — ou, pire, la ferait porter sur
 * autre chose que ce qu'on croit. PUR.
 */
export function echapperQ(valeur: string): string {
  return valeur.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Lit une liste de dossiers depuis une réponse de l'API. PUR. */
function versDossiers(j: unknown): DossierDrive[] {
  const files = (j as { files?: { id?: string; name?: string; driveId?: string }[] }).files ?? [];
  return files
    .filter((f) => typeof f.id === 'string' && f.id !== '')
    .map((f) => ({ id: f.id as string, nom: (f.name ?? '(sans nom)').trim() || '(sans nom)', driveId: f.driveId ?? null }));
}

/**
 * LES DOSSIERS D'UN DOSSIER. `parentId` vaut `'root'` pour la racine de Mon Drive, ou l'identifiant d'un Drive
 * partagé pour sa racine — l'API traite les deux comme un parent ordinaire.
 *
 * On ne demande QUE des dossiers (`mimeType = dossier`) : ce sélecteur sert à choisir une destination, et faire
 * défiler les milliers de fichiers d'un dossier de gestion pour en choisir un autre n'aiderait personne.
 * `trashed = false` : proposer un dossier à la corbeille serait proposer de perdre le document.
 */
export async function listerDossiers(
  accessToken: string, o: { parentId: string; driveId?: string | null; pageSize?: number }, deps: DepsGoogle,
): Promise<Resultat<DossierDrive[]>> {
  const p = new URLSearchParams({
    q: `'${echapperQ(o.parentId)}' in parents and mimeType = '${MIME_DOSSIER}' and trashed = false`,
    fields: 'files(id,name,driveId)',
    pageSize: String(o.pageSize ?? 200),
    orderBy: 'name',
    ...PARTAGES,
  });
  // `corpora=drive` + `driveId` : sans ce couple, l'API cherche dans Mon Drive et rend une liste VIDE pour un
  //   dossier d'équipe — une panne silencieuse, la pire sorte.
  if (o.driveId) { p.set('driveId', o.driveId); p.set('corpora', 'drive'); }
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture du dossier') };
  return { ok: true, valeur: versDossiers(await res.json().catch(() => ({}))) };
}

/**
 * CHERCHE un dossier PAR SON NOM, tous Drive confondus. Indispensable : avec une arborescence de treize niveaux,
 * naviguer à la main jusqu'au dossier d'un propriétaire prend plus de temps que de classer le mail.
 *
 * `name contains` est la seule correspondance que Drive propose : ni accent-insensible, ni floue. On le dit à
 * l'écran plutôt que de laisser croire à une recherche qui n'existe pas.
 */
export async function chercherDossiers(
  accessToken: string, texte: string, deps: DepsGoogle, pageSize = 50,
): Promise<Resultat<DossierDrive[]>> {
  const terme = texte.trim();
  if (terme === '') return { ok: true, valeur: [] };
  const p = new URLSearchParams({
    q: `name contains '${echapperQ(terme)}' and mimeType = '${MIME_DOSSIER}' and trashed = false`,
    fields: 'files(id,name,driveId)',
    pageSize: String(pageSize),
    orderBy: 'name',
    corpora: 'allDrives',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la recherche de dossiers') };
  return { ok: true, valeur: versDossiers(await res.json().catch(() => ({}))) };
}

/** Un dossier, avec ce qu'il faut pour remonter : son parent et son Drive. */
export interface DossierDetail { id: string; nom: string; parents: string[]; driveId: string | null }

export async function lireDossier(accessToken: string, id: string, deps: DepsGoogle): Promise<Resultat<DossierDetail>> {
  const p = new URLSearchParams({ fields: 'id,name,parents,driveId', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { ok: false, motif: 'Ce dossier n’existe plus dans le Drive.' };
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture du dossier') };
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; parents?: string[]; driveId?: string };
  return {
    ok: true,
    valeur: { id: j.id ?? id, nom: (j.name ?? '').trim() || '(sans nom)', parents: j.parents ?? [], driveId: j.driveId ?? null },
  };
}

/** Profondeur maximale remontée pour un fil d'Ariane. Treize niveaux mesurés ; seize laisse de la marge sans boucler. */
export const ARIANE_MAX = 16;

/**
 * LE FIL D'ARIANE d'un dossier, de la racine vers lui. Sans lui, on ne sait pas OÙ l'on est en train de déposer —
 * et deux dossiers « Documents » à deux endroits différents sont la règle, pas l'exception, dans un Drive construit
 * à la main.
 *
 * Borné par `ARIANE_MAX` : une arborescence mal formée (un cycle, que l'API n'interdit pas formellement) ne doit pas
 * faire tourner la requête indéfiniment.
 */
export async function filAriane(accessToken: string, dossierId: string, deps: DepsGoogle): Promise<Resultat<EtapeAriane[]>> {
  const etapes: EtapeAriane[] = [];
  const vus = new Set<string>();
  let courant: string | null = dossierId;
  for (let i = 0; i < ARIANE_MAX && courant !== null; i += 1) {
    if (vus.has(courant)) break; // cycle : on s'arrête là où l'on repasse, plutôt que de tourner
    vus.add(courant);
    const d: Resultat<DossierDetail> = await lireDossier(accessToken, courant, deps);
    if (!d.ok) return i === 0 ? d : { ok: true, valeur: etapes.reverse() };
    etapes.push({ id: d.valeur.id, nom: d.valeur.nom });
    courant = d.valeur.parents[0] ?? null;
  }
  return { ok: true, valeur: etapes.reverse() };
}

/** Ce qu'on sait d'un fichier déposé. `webViewLink` est le SEUL lien qu'on montre — jamais une URL de stockage. */
export interface FichierDepose { id: string; nom: string; webViewLink: string | null }

/** Taille d'un morceau d'envoi reprenable. Multiple de 256 Kio, comme l'exige l'API ; 8 Mio est le compromis usuel. */
export const MORCEAU_OCTETS = 8 * 1024 * 1024;

/**
 * DÉPOSE une copie d'une pièce dans un dossier du Drive, en ENVOI REPRENABLE.
 *
 * 🔴 POURQUOI REPRENABLE ET NON « SIMPLE ». Un envoi simple tient dans une requête : sur une pièce de 25 Mo et une
 * connexion de bureau ordinaire, une coupure à 90 % fait tout recommencer, et rien ne dit à l'utilisateur ce qui
 * s'est passé. L'envoi reprenable ouvre une session, pousse le fichier par morceaux, et chaque morceau accepté est
 * acquis. C'est aussi ce que fait le bouton Drive de Gmail.
 *
 * 🔴 LE NOM D'ORIGINE EST CONSERVÉ, tel quel. C'est le nom que l'équipe reconnaîtra dans le Drive ; le renommer
 * « proprement » ferait perdre le lien avec le mail dont il vient.
 *
 * ⚠️ `supportsAllDrives` : sans ce paramètre, un dépôt dans un Drive partagé est refusé (404 sur le parent).
 */
export async function deposerFichier(
  accessToken: string,
  o: { nom: string; typeMime: string | null; octets: Uint8Array; dossierId: string },
  deps: DepsGoogle,
): Promise<Resultat<FichierDepose>> {
  const type = (o.typeMime ?? '').trim() || 'application/octet-stream';
  const p = new URLSearchParams({ uploadType: 'resumable', fields: 'id,name,webViewLink', ...PARTAGES });

  // ── ① Ouvrir la session. Les métadonnées (nom, parent) partent ici, et NULLE PART ailleurs. ──
  const ouverture = await deps.fetch(`${API_TELEVERSEMENT}?${p}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(o.octets.byteLength),
    },
    body: JSON.stringify({ name: o.nom, parents: [o.dossierId] }),
  });
  if (!ouverture.ok) return { ok: false, motif: motifHttp(ouverture.status, 'l’ouverture du dépôt dans le Drive') };
  const session = ouverture.headers.get('location') ?? ouverture.headers.get('Location');
  if (!session) return { ok: false, motif: 'Google n’a pas ouvert de session de dépôt.' };

  // ── ② Pousser le contenu, morceau par morceau. ──
  const total = o.octets.byteLength;
  if (total === 0) {
    // Un fichier vide n'a pas de morceau : on clôt la session avec un corps vide, sinon elle resterait ouverte.
    const res = await deps.fetch(session, { method: 'PUT', headers: { 'Content-Range': 'bytes */0' }, body: corps(new Uint8Array(0)) });
    return res.ok ? { ok: true, valeur: versFichier(await res.json().catch(() => ({}))) }
      : { ok: false, motif: motifHttp(res.status, 'le dépôt dans le Drive') };
  }

  let debut = 0;
  for (let garde = 0; debut < total && garde < 10_000; garde += 1) {
    const fin = Math.min(debut + MORCEAU_OCTETS, total);
    const res = await deps.fetch(session, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${debut}-${fin - 1}/${total}`, 'Content-Length': String(fin - debut) },
      body: corps(o.octets.subarray(debut, fin)),
    });
    // 308 = « morceau reçu, continue ». L'API dit jusqu'où elle a reçu dans `Range` — on REPART DE LÀ, et non de ce
    //   qu'on croyait avoir envoyé : c'est toute la valeur de l'envoi reprenable.
    if (res.status === 308) {
      const recu = res.headers.get('range') ?? res.headers.get('Range');
      const borne = recu ? Number(recu.split('-')[1]) : NaN;
      debut = Number.isFinite(borne) ? borne + 1 : fin;
      continue;
    }
    if (res.ok) return { ok: true, valeur: versFichier(await res.json().catch(() => ({}))) };
    return { ok: false, motif: motifHttp(res.status, 'le dépôt dans le Drive') };
  }
  return { ok: false, motif: 'Le dépôt n’a pas abouti après de nombreux morceaux : on s’arrête plutôt que d’insister.' };
}

/**
 * Le corps binaire d'une requête. `Uint8Array` est un `BodyInit` parfaitement valable à l'exécution, mais les types
 * DOM de TypeScript ne l'acceptent que via son tampon : on le convertit explicitement plutôt que de forcer le type,
 * pour que la conversion soit VISIBLE et qu'aucun `as never` ne masque un jour une vraie erreur. PUR.
 */
function corps(vue: Uint8Array): ArrayBuffer {
  return vue.buffer.slice(vue.byteOffset, vue.byteOffset + vue.byteLength) as ArrayBuffer;
}

function versFichier(j: unknown): FichierDepose {
  const f = j as { id?: string; name?: string; webViewLink?: string };
  return { id: f.id ?? '', nom: (f.name ?? '').trim(), webViewLink: f.webViewLink ?? null };
}

/**
 * Un motif LISIBLE par un non-développeur. « HTTP 403 » n'apprend rien et n'indique aucune conduite à tenir ; « le
 * compte n'a pas le droit d'écrire dans ce dossier » se règle en deux clics dans le Drive. PUR.
 */
export function motifHttp(status: number, quoi: string): string {
  if (status === 401) return `La connexion Google a expiré (${quoi}) — il faut refaire l’autorisation dans les réglages.`;
  if (status === 403) return `Google a refusé ${quoi} : le compte de gestion n’a pas le droit d’écrire dans ce dossier.`;
  if (status === 404) return `Le dossier visé n’existe plus dans le Drive (${quoi}).`;
  if (status === 429 || status >= 500) return `Le Drive n’a pas répondu (${quoi}) — à réessayer dans un moment.`;
  return `Google a refusé ${quoi} (code ${status}).`;
}
