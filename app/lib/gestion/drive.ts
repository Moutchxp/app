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
const ENDPOINT_DRIVES = 'https://www.googleapis.com/drive/v3/drives';

/** Le type MIME d'un dossier Drive. Écrit une fois : une faute de frappe ici rendrait toute navigation vide. */
export const MIME_DOSSIER = 'application/vnd.google-apps.folder';

/**
 * LOT 5-PJ-C — le type MIME d'un RACCOURCI.
 *
 * 🔴 LE DÉFAUT QU'IL RÉPARE, constaté par Arno le 25/09/2026 : le sélecteur filtrait sur `mimeType = dossier`, et un
 * raccourci n'est PAS un dossier — son type est `shortcut`. Les raccourcis vers un Drive partagé, qui sont
 * justement la façon dont on range un accès dans son Drive, étaient donc tout simplement invisibles. Rien
 * n'échouait : ils n'existaient pas, ce qui est pire, parce qu'on ne cherche pas ce qu'on ne voit pas manquer.
 */
export const MIME_RACCOURCI = 'application/vnd.google-apps.shortcut';

/** Ce qu'on demande pour voir DOSSIERS ET RACCOURCIS, et savoir où mènent les seconds. */
const CHAMPS_DOSSIERS = 'files(id,name,driveId,mimeType,shortcutDetails(targetId,targetMimeType))';

/** Dossiers ET raccourcis, jamais la corbeille. Le tri du bon grain se fait ensuite, sur le type de la CIBLE. */
const FILTRE_DOSSIERS_ET_RACCOURCIS = `(mimeType = '${MIME_DOSSIER}' or mimeType = '${MIME_RACCOURCI}') and trashed = false`;

/** Les paramètres que TOUTE requête doit porter pour voir les Drive partagés. Oubliés, les dossiers d'équipe sont invisibles. */
const PARTAGES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } as const;

export interface DossierDrive {
  /**
   * L'identifiant où l'on ENTRE et où l'on DÉPOSE. Pour un raccourci, c'est celui de sa CIBLE — jamais celui du
   * raccourci lui-même : déposer « dans un raccourci » ne veut rien dire, et Google le refuserait.
   */
  id: string;
  nom: string;
  /** Identifiant du Drive partagé, ou `null` pour « Mon Drive ». Sert à savoir d'où vient un dossier dans une recherche. */
  driveId: string | null;
  /** Vrai quand l'entrée est un RACCOURCI : l'écran le dit par une icône ET par le mot « raccourci ». */
  raccourci?: boolean;
}

/**
 * Une étape du fil d'Ariane, de la racine vers le dossier courant.
 *
 * LOT 5-PJ-D — `driveId` n'est renseigné que sur la RACINE d'un Drive partagé, et sert à une seule chose : lui rendre
 * son vrai nom. Mesuré le 25/09/2026 : `files.get` appelle « Drive » la racine des dix Drive partagés — le fil
 * d'Ariane disait donc « Drive › … » pour n'importe lequel, c'est-à-dire ne disait rien.
 */
export interface EtapeAriane { id: string; nom: string; driveId?: string }

/**
 * ÉCHAPPE une valeur destinée à une requête Drive (`q=`). Les apostrophes et les antislashs y sont des délimiteurs :
 * un dossier nommé « L'Orne » couperait la requête en deux et la ferait échouer — ou, pire, la ferait porter sur
 * autre chose que ce qu'on croit. PUR.
 */
export function echapperQ(valeur: string): string {
  return valeur.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Une entrée brute, telle que l'API la rend. */
interface FichierBrut {
  id?: string; name?: string; driveId?: string; mimeType?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}

/**
 * Traduit une réponse de l'API en entrées du sélecteur.
 *
 * 🔴 DEUX RÈGLES, ET ELLES COMPTENT AUTANT L'UNE QUE L'AUTRE :
 *   ① un RACCOURCI VERS UN DOSSIER devient une entrée ordinaire, mais son `id` est celui de la CIBLE. Entrer dedans
 *      ouvre la cible, et « déposer ici » dépose dans la cible. Garder l'identifiant du raccourci ferait échouer le
 *      dépôt — un raccourci n'a pas d'enfants ;
 *   ② un RACCOURCI VERS UN FICHIER est IGNORÉ. On choisit une destination : un fichier n'en est pas une, et le
 *      proposer ne pourrait mener qu'à une erreur au moment du dépôt. PUR.
 */
export function versDossiers(j: unknown): DossierDrive[] {
  const files = (j as { files?: FichierBrut[] }).files ?? [];
  const out: DossierDrive[] = [];
  for (const f of files) {
    const nom = (f.name ?? '(sans nom)').trim() || '(sans nom)';
    if (f.mimeType === MIME_RACCOURCI) {
      const cible = f.shortcutDetails?.targetId ?? '';
      if (cible === '' || f.shortcutDetails?.targetMimeType !== MIME_DOSSIER) continue; // ② vers un fichier : ignoré
      out.push({ id: cible, nom, driveId: f.driveId ?? null, raccourci: true }); // ① l'id est celui de la CIBLE
      continue;
    }
    if (typeof f.id !== 'string' || f.id === '') continue;
    if (f.mimeType !== undefined && f.mimeType !== MIME_DOSSIER) continue;
    out.push({ id: f.id, nom, driveId: f.driveId ?? null });
  }
  return out;
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
    q: `'${echapperQ(o.parentId)}' in parents and ${FILTRE_DOSSIERS_ET_RACCOURCIS}`,
    fields: CHAMPS_DOSSIERS,
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
    q: `name contains '${echapperQ(terme)}' and ${FILTRE_DOSSIERS_ET_RACCOURCIS}`,
    fields: CHAMPS_DOSSIERS,
    pageSize: String(pageSize),
    orderBy: 'name',
    corpora: 'allDrives',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la recherche de dossiers') };
  return { ok: true, valeur: versDossiers(await res.json().catch(() => ({}))) };
}

/**
 * LOT 5-PJ-C — « PARTAGÉS AVEC MOI ». Une troisième entrée à la racine, comme dans Google Drive.
 *
 * 🔴 CES DOSSIERS NE SONT ATTEIGNABLES PAR AUCUN `in parents` : ils n'ont pas de parent chez nous, puisqu'ils
 * appartiennent à quelqu'un d'autre. `sharedWithMe = true` est la SEULE façon de les voir — c'est pourquoi ils
 * manquaient entièrement au sélecteur, sans que rien n'échoue.
 */
export async function listerPartagesAvecMoi(
  accessToken: string, deps: DepsGoogle, pageSize = 100,
): Promise<Resultat<DossierDrive[]>> {
  const p = new URLSearchParams({
    q: `sharedWithMe = true and ${FILTRE_DOSSIERS_ET_RACCOURCIS}`,
    fields: CHAMPS_DOSSIERS,
    pageSize: String(pageSize),
    orderBy: 'name',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture des dossiers partagés avec vous') };
  return { ok: true, valeur: versDossiers(await res.json().catch(() => ({}))) };
}

/**
 * LOT 5-PJ-C — LES DRIVE PARTAGÉS, AVEC LEUR IDENTIFIANT. `listerDrivesPartages` (lot 5-GOOGLE) ne rend que les
 * NOMS, et c'était son but : confirmer un accès sans faire défiler des noms de locataires. Pour NAVIGUER, il faut
 * l'identifiant — la racine d'un Drive partagé a pour identifiant celui du Drive lui-même.
 */
export async function listerDrivesAvecId(accessToken: string, deps: DepsGoogle): Promise<Resultat<DossierDrive[]>> {
  const res = await deps.fetch(`${ENDPOINT_DRIVES}?pageSize=100&fields=drives(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture des Drive partagés') };
  const j = (await res.json().catch(() => ({}))) as { drives?: { id?: string; name?: string }[] };
  return {
    ok: true,
    valeur: (j.drives ?? [])
      .filter((d) => typeof d.id === 'string' && d.id !== '')
      .map((d) => ({ id: d.id as string, nom: (d.name ?? '(sans nom)').trim() || '(sans nom)', driveId: d.id as string })),
  };
}

/**
 * Un dossier, avec ce qu'il faut pour remonter : son parent et son Drive.
 *
 * LOT 5-PJ-D — `mimeType` et `corbeille` s'y ajoutent, et ce ne sont pas des commodités : la vue d'ouverture doit
 * écarter un dossier RÉCENT qui a été mis à la corbeille ou remplacé par un fichier, et le dépôt doit refuser une
 * cible qui n'est pas un dossier. Sans ces deux champs, un `files.get` réussi (200) laisserait croire que tout va
 * bien — la corbeille répond 200, elle aussi.
 */
export interface DossierDetail {
  id: string;
  nom: string;
  parents: string[];
  driveId: string | null;
  /** Le type Google de l'entrée. `MIME_DOSSIER` pour un vrai dossier (racine de Drive partagé comprise). */
  mimeType: string | null;
  /** Vrai si l'entrée est À LA CORBEILLE. Google la rend quand même, avec un 200 : il faut le demander pour le savoir. */
  corbeille: boolean;
}

/** Lire UN dossier par son identifiant. Injectable : c'est ce qui rend éprouvables la vue d'ouverture et le dépôt. */
export type LecteurDossier = (id: string) => Promise<Resultat<DossierDetail>>;

export async function lireDossier(accessToken: string, id: string, deps: DepsGoogle): Promise<Resultat<DossierDetail>> {
  const p = new URLSearchParams({ fields: 'id,name,parents,driveId,mimeType,trashed', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { ok: false, motif: 'Ce dossier n’existe plus dans le Drive.' };
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture du dossier') };
  const j = (await res.json().catch(() => ({}))) as {
    id?: string; name?: string; parents?: string[]; driveId?: string; mimeType?: string; trashed?: boolean;
  };
  return {
    ok: true,
    valeur: {
      id: j.id ?? id, nom: (j.name ?? '').trim() || '(sans nom)', parents: j.parents ?? [],
      driveId: j.driveId ?? null, mimeType: j.mimeType ?? null, corbeille: j.trashed === true,
    },
  };
}

/**
 * LOT 5-PJ-D — MÉMORISE les lectures de dossiers LE TEMPS D'UNE REQUÊTE.
 *
 * 🔴 POURQUOI. La vue d'ouverture vérifie six dossiers récents et remonte le chemin de chacun. Dans un Drive de
 * gestion, ces six dossiers partagent presque toujours leurs ancêtres (« GESTION LOCATIVE › 1 actifs › … ») : sans
 * mémoire, on redemanderait cinq fois le même dossier à Google. Elle vaut pour UNE requête HTTP et meurt avec elle —
 * une mémoire qui survivrait ferait afficher un dossier renommé, ou effacé, comme s'il était toujours là.
 */
export function memoiserLecture(lire: LecteurDossier): LecteurDossier {
  const vus = new Map<string, Promise<Resultat<DossierDetail>>>();
  return (id: string) => {
    const deja = vus.get(id);
    if (deja !== undefined) return deja;
    const p = lire(id);
    vus.set(id, p);
    return p;
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
    courant = d.valeur.parents[0] ?? null;
    // La RACINE d'un Drive partagé (aucun parent, mais un `driveId`) emporte son identifiant de Drive : c'est le
    //   seul moyen de lui rendre son nom, `files.get` répondant « Drive » pour tous.
    etapes.push(courant === null && d.valeur.driveId !== null
      ? { id: d.valeur.id, nom: d.valeur.nom, driveId: d.valeur.driveId }
      : { id: d.valeur.id, nom: d.valeur.nom });
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
