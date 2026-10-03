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

/**
 * Ce qu'on sait d'un fichier déposé. `webViewLink` est le SEUL lien qu'on montre — jamais une URL de stockage.
 *
 * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA COPIE RAPPORTE SON EMPREINTE, SON PARENT ET SA TAILLE ════════════════
 *
 * DEMANDE D'ARNO (03/10/2026) : « à chaque dépôt réussi […] enregistrer IMMÉDIATEMENT la copie (fileId, md5,
 * parents, nom) au registre et dans l'index ».
 *
 * 🔴 CE QUI MANQUAIT, ET IL NE MANQUAIT QU'UN MOT DANS UNE URL. Les deux envois demandaient
 * `fields=id,name,webViewLink` : Google renvoie `md5Checksum` GRATUITEMENT dans la même réponse, et nous ne le
 * demandions pas. Le registre gardait donc des lignes à `md5` NULL (vérifié en base : `gestion_piece_drive`
 * id 26554, déposée le 03/10 à 21:37:35, `md5` vide), et la reconnaissance par CONTENU de notre propre copie
 * devenait impossible — il fallait attendre que l'agent `changes.list` passe. MESURÉ sur le cas d'Arno : dépôt à
 * 21:37:35, entrée dans `gestion_drive_empreinte` à 21:50:12, soit **12 min 37 s** d'aveuglement.
 *
 * ⚠️ TOUS CES CHAMPS SONT FACULTATIFS, et c'est voulu : un appelant écrit avant ce lot compile et se comporte à
 * l'identique, et un Google qui n'en rendrait pas (document natif sans empreinte) n'est pas un échec.
 */
export interface FichierDepose {
  id: string;
  nom: string;
  webViewLink: string | null;
  /** `null` = document Google natif, ou champ non rendu. Ce n'est PAS une erreur : on ne devine pas une empreinte. */
  md5?: string | null;
  /** Le dossier où la copie est née, tel que Google le nomme — et non celui qu'on a demandé. */
  parentId?: string | null;
  tailleOctets?: number | null;
  typeMime?: string | null;
  modifieLe?: string | null;
  driveId?: string | null;
}

/**
 * 🔴 LES CHAMPS DEMANDÉS À CHAQUE DÉPÔT, ÉCRITS UNE SEULE FOIS. Les deux voies d'envoi (reprenable et multipart)
 * doivent rapporter EXACTEMENT la même chose : sans cela, la même pièce entrerait au registre avec son empreinte
 * par un chemin et sans elle par l'autre, selon sa taille. C'est le genre de divergence qu'on ne découvre que six
 * mois plus tard, sur un fichier de 6 Mo.
 */
const CHAMPS_DEPOT = 'id,name,webViewLink,md5Checksum,parents,size,mimeType,modifiedTime,driveId';

/** Taille d'un morceau d'envoi reprenable. Multiple de 256 Kio, comme l'exige l'API ; 8 Mio est le compromis usuel. */
export const MORCEAU_OCTETS = 8 * 1024 * 1024;

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — EN DESSOUS DE CETTE TAILLE, UNE SEULE REQUÊTE SUFFIT ═════════════════
 *
 * MESURÉ LE 30/09/2026 SUR LE VRAI DRIVE, sur un fichier de 130 ko, trois fois de suite :
 *
 *     envoi reprenable (2 allers-retours)   2 953 / 3 556 / 2 608 ms
 *     envoi multipart  (1 aller-retour)     2 466 / 2 476 / 2 058 ms
 *
 * 🔴 CE QU'ON PAIE, ET QUI N'A RIEN À VOIR AVEC LA TAILLE. L'envoi reprenable OUVRE une session (une requête),
 * puis pousse le contenu (une autre). Sur 130 ko, la seconde requête ne transporte presque rien : on paie un
 * aller-retour entier — environ un demi-seconde — pour une reprise dont un fichier de 130 ko n'a aucun besoin.
 *
 * 🔴 AU-DESSUS, LE REPRENABLE GARDE TOUT SON SENS, et il ne bouge pas : sur une pièce de 25 Mo, une coupure à
 * 90 % ferait tout recommencer, et chaque morceau accepté est acquis. Le seuil n'est donc pas un réglage de
 * vitesse : c'est la taille à partir de laquelle une reprise vaut son aller-retour.
 */
export const SIMPLE_JUSQUA_OCTETS = 5 * 1024 * 1024;

/**
 * DÉPOSE une copie d'une pièce dans un dossier du Drive.
 *
 * 🔴 DEUX ENVOIS, UN SEUIL. En dessous de `SIMPLE_JUSQUA_OCTETS`, une requête `multipart` — voir l'encadré et sa
 * mesure. Au-dessus, l'ENVOI REPRENABLE : il ouvre une session, pousse le fichier par morceaux, et chaque morceau
 * accepté est acquis. C'est aussi ce que fait le bouton Drive de Gmail.
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
  if (o.octets.byteLength > 0 && o.octets.byteLength <= SIMPLE_JUSQUA_OCTETS) {
    return deposerEnUneRequete(accessToken, { ...o, typeMime: type }, deps);
  }
  const p = new URLSearchParams({ uploadType: 'resumable', fields: CHAMPS_DEPOT, ...PARTAGES });

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

/**
 * 🔴 LOT PASTILLE-DRIVE-EN-DIRECT — ET C'EST ICI QUE LES MÉTADONNÉES ENTRENT, pour les DEUX voies d'envoi : les
 * deux passent par cette fonction, donc aucune ne peut l'oublier.
 *
 * ⚠️ `size` ARRIVE EN CHAÎNE (Google rend les entiers 64 bits en chaîne, comme `pg` rend les `bigint` — le même
 * piège, consigné dans AGENTS.md). Une taille illisible rend `null`, jamais `NaN` : `NaN` traverserait jusqu'à un
 * `INSERT` et ferait échouer l'écriture du registre après un dépôt parfaitement réussi.
 */
function versFichier(j: unknown): FichierDepose {
  const f = j as {
    id?: string; name?: string; webViewLink?: string; md5Checksum?: string; parents?: string[];
    size?: string; mimeType?: string; modifiedTime?: string; driveId?: string;
  };
  const taille = Number(f.size ?? '');
  return {
    id: f.id ?? '', nom: (f.name ?? '').trim(), webViewLink: f.webViewLink ?? null,
    md5: f.md5Checksum ?? null,
    parentId: f.parents?.[0] ?? null,
    tailleOctets: Number.isFinite(taille) && (f.size ?? '') !== '' ? taille : null,
    typeMime: f.mimeType ?? null,
    modifieLe: f.modifiedTime ?? null,
    driveId: f.driveId ?? null,
  };
}

/**
 * ══ 🔴 L'ENVOI EN UNE SEULE REQUÊTE (`uploadType=multipart`) ═══════════════════════════════════════════════════
 *
 * Les métadonnées ET le contenu dans un seul corps `multipart/related` : une requête au lieu de deux. Voir
 * `SIMPLE_JUSQUA_OCTETS` pour la mesure qui l'a fait entrer, et pour la raison de son plafond.
 *
 * ⚠️ LA FRONTIÈRE EST TIRÉE AU HASARD, ET C'EST NÉCESSAIRE : si elle apparaissait dans les octets du document,
 * Google couperait le corps au mauvais endroit et le fichier arriverait tronqué. Une frontière fixe finirait un
 * jour par se trouver dans un PDF — et le jour où cela arriverait, rien ne le dirait.
 *
 * ⚠️ LES MÉTADONNÉES SONT DANS LE CORPS, comme pour l'envoi reprenable : c'est le seul endroit où le nom et le
 * parent voyagent. Rien de tout cela ne passe par l'URL.
 */
async function deposerEnUneRequete(
  accessToken: string,
  o: { nom: string; typeMime: string; octets: Uint8Array; dossierId: string },
  deps: DepsGoogle,
): Promise<Resultat<FichierDepose>> {
  const frontiere = `svav-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const tete = new TextEncoder().encode(
    `--${frontiere}
Content-Type: application/json; charset=UTF-8

`
    + `${JSON.stringify({ name: o.nom, parents: [o.dossierId] })}
`
    + `--${frontiere}
Content-Type: ${o.typeMime}

`);
  const pied = new TextEncoder().encode(`
--${frontiere}--`);
  const charge = new Uint8Array(tete.byteLength + o.octets.byteLength + pied.byteLength);
  charge.set(tete, 0);
  charge.set(o.octets, tete.byteLength);
  charge.set(pied, tete.byteLength + o.octets.byteLength);

  const p = new URLSearchParams({ uploadType: 'multipart', fields: CHAMPS_DEPOT, ...PARTAGES });
  const res = await deps.fetch(`${API_TELEVERSEMENT}?${p}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${frontiere}`,
    },
    body: corps(charge),
  });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'le dépôt dans le Drive') };
  return { ok: true, valeur: versFichier(await res.json().catch(() => ({}))) };
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT REDACTION-GMAIL — LIRE DES FICHIERS (et non plus seulement des dossiers), POUR LES JOINDRE À UN MAIL
   🔒 STRICTEMENT EN LECTURE : `files.list` et `files.get`. Aucune création, aucune modification, aucun partage.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'on demande d'un FICHIER : de quoi l'afficher, le juger et, le cas échéant, le joindre. */
/**
 * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — `md5Checksum` S'AJOUTE À LA LISTE, ET IL NE COÛTE RIEN.
 *
 * C'est un champ de plus dans un appel qu'on faisait déjà : aucune requête supplémentaire, aucun octet de contenu
 * lu (une empreinte n'est pas le document). Il permet à la loupe « Où est ce document ? » de reconnaître une copie
 * faite À LA MAIN dans Google Drive, qui n'a laissé aucune trace dans notre registre — et de la reconnaître SANS
 * balayer le Drive, puisque l'empreinte voyage avec chaque ligne déjà listée.
 *
 * ⚠️ ABSENT POUR LES DOCUMENTS GOOGLE NATIFS (Doc, Sheet) : Google n'en calcule pas. `null` est donc normal, et
 * l'écran le DIT au lieu de laisser croire à un échec.
 */
const CHAMPS_FICHIERS =
  'files(id,name,driveId,mimeType,size,modifiedTime,webViewLink,parents,md5Checksum,'
  + 'shortcutDetails(targetId,targetMimeType))';

export interface FichierDrive {
  id: string;
  nom: string;
  driveId: string | null;
  typeMime: string;
  /** En octets. `null` pour un document Google natif, qui n'a pas de taille tant qu'on ne l'exporte pas. */
  tailleOctets: number | null;
  modifieLe: string | null;
  /** L'adresse à ouvrir dans un navigateur — c'est elle qu'« Insérer un lien » met dans le message. */
  lien: string | null;
  dossier: boolean;
  /**
   * 🔴 LOT APERCU-RAPIDE — LE DOSSIER QUI CONTIENT CE FICHIER. Il voyage avec la ligne, et il sert à UNE chose :
   * borner « Précédent / Suivant » de l'aperçu au dossier du document affiché.
   *
   * ⚠️ INDISPENSABLE DANS UNE RECHERCHE, et seulement là. Une liste de dossier a un parent commun, évident ;
   * quarante résultats venus de tout le Drive n'en ont aucun, et sans cette colonne « Suivant » emmènerait d'un
   * dossier à un autre — exactement ce que la règle interdit.
   *
   * ⚠️ POUR UN RACCOURCI, c'est le parent DU RACCOURCI, pas celui de sa cible : c'est là qu'on l'a vu, et c'est
   * dans cette liste-là qu'on navigue.
   */
  parentId: string | null;
  /**
   * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — L'EMPREINTE DE CONTENU, pour reconnaître le MÊME document
   * quel que soit son nom. Elle arrive dans le même appel que la liste : zéro requête de plus.
   * `null` = document Google natif (Google n'en calcule pas), ou champ non rendu.
   */
  md5: string | null;
}

function versFichiers(j: unknown): FichierDrive[] {
  const brut = (j as { files?: unknown[] })?.files ?? [];
  return brut.map((f) => {
    const o = f as {
      id?: string; name?: string; driveId?: string | null; mimeType?: string; size?: string;
      modifiedTime?: string; webViewLink?: string; parents?: string[]; md5Checksum?: string;
      shortcutDetails?: { targetId?: string; targetMimeType?: string };
    };
    // Un RACCOURCI est suivi jusqu'à sa cible : c'est elle qu'on affiche, qu'on joint ou qu'on lie.
    const cible = o.shortcutDetails?.targetId;
    const type = o.shortcutDetails?.targetMimeType ?? o.mimeType ?? '';
    return {
      id: cible ?? o.id ?? '',
      nom: (o.name ?? '').trim() || '(sans nom)',
      driveId: o.driveId ?? null,
      typeMime: type,
      tailleOctets: o.size === undefined ? null : Number(o.size),
      modifieLe: o.modifiedTime ?? null,
      lien: o.webViewLink ?? null,
      dossier: type === MIME_DOSSIER,
      parentId: o.parents?.[0] ?? null,
      /* ⚠️ POUR UN RACCOURCI, l'empreinte rendue est celle du RACCOURCI (souvent absente), pas celle de sa cible :
         Google ne nous donne pas la seconde ici. `null` est donc la bonne réponse — on ne devine pas. */
      md5: o.md5Checksum ?? null,
    };
  }).filter((f) => f.id !== '');
}

/**
 * LE CONTENU D'UN DOSSIER : ses sous-dossiers ET ses fichiers, dans cet ordre. LECTURE SEULE.
 *
 * ⚠️ `orderBy: 'folder,name'` — Google range les dossiers avant les fichiers quand on le lui demande ainsi. C'est
 * l'ordre de n'importe quel explorateur, et celui qu'on attend sans y penser.
 */
/**
 * ══ 🔴🔴 LOT DRIVE-FACON-FINDER — LE DOSSIER EST LU EN ENTIER, PAR PAGES ══════════════════════════════════════
 *
 * DÉFAUT TROUVÉ EN MESURANT, le 29/09/2026 : cette fonction demandait UNE page de 200 entrées et s'arrêtait là.
 * « 1 Propriétaires » en compte plus de 300 : on en voyait 200, les autres n'existaient pas — sans un mot, sans
 * un « … et d'autres ». Chercher un propriétaire dont le nom commence par C à Z revenait à ne pas le trouver, et
 * l'on en concluait qu'il n'avait pas de dossier.
 *
 * 🔴 ON SUIT DONC `nextPageToken`, jusqu'à `PAGES_MAX`. La borne existe parce qu'un dossier peut, en théorie,
 * contenir des dizaines de milliers d'entrées : cinq pages (1 000 entrées) couvrent tout ce que le cabinet range
 * réellement, et la liste virtualisée les affiche sans peine. Au-delà, `tronque` le DIT — un silence serait la
 * même faute qu'avant, en plus tardive.
 *
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES-ET-DEFILEMENT-DRIVE — LA BORNE MONTE, ET LA LECTURE ACCÉLÈRE ════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « tous les fichiers d'un dossier sont atteignables, QUEL QUE SOIT LEUR NOMBRE :
 * chargement de la suite au défilement, ou pages complètes. Garde la vitesse obtenue. »
 *
 * 🔴 ON A CHOISI LES PAGES COMPLÈTES, ET ELLES COÛTENT MOINS CHER QU'AVANT, pas plus. `files.list` accepte
 * `pageSize` jusqu'à 1 000 ; on en demandait 200. Conséquences, dans cet ordre :
 *
 *   · un dossier de 300 entrées (« 1 Propriétaires ») se lisait en DEUX appels, il s'en lit UN ;
 *   · le plafond passe de 1 000 à 25 000 entrées — au-delà de tout ce qu'un dossier Drive porte en pratique ;
 *   · et le cas ordinaire — un dossier de quelques dizaines d'entrées — ne change pas d'un appel : Google ne
 *     facture pas la taille demandée, il rend ce qu'il y a.
 *
 * ⚠️ LA BORNE NE DISPARAÎT PAS, et il ne faut pas qu'elle disparaisse : sans elle, un dossier pathologique ferait
 * tourner la lecture indéfiniment pendant qu'un écran attend. Elle est seulement portée là où plus personne ne la
 * rencontre — et quand elle est atteinte, `tronque` le DIT toujours.
 */
export const PAGES_MAX_CONTENU = 25;

/**
 * 🔴 LA TAILLE DE PAGE : le maximum que `files.list` accepte. En demander moins ne coûte pas moins cher — c'est
 * le nombre d'ALLERS-RETOURS qui coûte, et chacun vaut environ 300 ms (mesuré le 03/10/2026).
 */
export const TAILLE_PAGE_CONTENU = 1000;

export async function listerContenu(
  accessToken: string, o: { parentId: string; driveId?: string | null; pageSize?: number; pagesMax?: number },
  deps: DepsGoogle,
): Promise<Resultat<{ fichiers: FichierDrive[]; tronque: boolean }>> {
  const pagesMax = o.pagesMax ?? PAGES_MAX_CONTENU;
  const fichiers: FichierDrive[] = [];
  let jeton: string | null = null;
  for (let page = 0; page < pagesMax; page += 1) {
    const p = new URLSearchParams({
      q: `'${echapperQ(o.parentId)}' in parents and trashed = false`,
      fields: `nextPageToken, ${CHAMPS_FICHIERS}`,
      pageSize: String(o.pageSize ?? TAILLE_PAGE_CONTENU),
      orderBy: 'folder,name',
      ...PARTAGES,
    });
    if (o.driveId) { p.set('driveId', o.driveId); p.set('corpora', 'drive'); }
    if (jeton !== null) p.set('pageToken', jeton);
    const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture du dossier') };
    const j = await res.json().catch(() => ({}));
    fichiers.push(...versFichiers(j));
    jeton = (j as { nextPageToken?: string }).nextPageToken ?? null;
    if (jeton === null) return { ok: true, valeur: { fichiers, tronque: false } };
  }
  // On s'est arrêté sur la borne alors que Google en avait encore : on le DIT.
  return { ok: true, valeur: { fichiers, tronque: jeton !== null } };
}

/**
 * ══ 🔴 LOT EDITEUR-PJ — CHERCHER UN FICHIER PAR SON NOM, DANS TOUT LE DRIVE. LECTURE SEULE. ═══════════════════════
 *
 * POURQUOI IL EN FALLAIT UNE. Le Drive du cabinet fait ~15 000 dossiers sur 13 niveaux (mesuré le 25/09/2026).
 * Retrouver « bail 2024 signé » en descendant treize dossiers est un travail ; le nom, lui, on s'en souvient.
 *
 * 🔴🔴 CE QUE CETTE RECHERCHE NE CHANGE PAS : LE DROIT DE JOINDRE. Elle rend des noms, dans tout le Drive — comme
 * la navigation, qui laisse déjà voir le contenu de « Documents clients scannés ». Le verdict, lui, se prononce
 * TOUJOURS au moment de lire les octets, en remontant la chaîne des parents du fichier lui-même
 * (`/api/admin/gestion/drive/fichiers?fichier=…&contenu=1`). Un fichier protégé peut donc apparaître dans une
 * liste de résultats ; il ne peut pas en sortir. C'est la même règle qu'ailleurs, appliquée au même endroit.
 *
 * ⚠️ LES DOSSIERS SONT ÉCARTÉS : on cherche ici ce qu'on va JOINDRE. Chercher un dossier existe déjà
 * (`chercherDossiers`), pour le sélecteur de dépôt, et les deux listes n'ont pas le même usage.
 *
 * ⚠️ `echapperQ` — une apostrophe dans un nom (« Bail d'habitation ») fermerait la chaîne de la requête Google et
 * ferait échouer la recherche, ou pire, en changerait le sens.
 */
export async function chercherFichiers(
  accessToken: string, texte: string, deps: DepsGoogle, pageSize = 40,
): Promise<Resultat<FichierDrive[]>> {
  const terme = texte.trim();
  // Deux caractères, comme partout ailleurs dans le module : une lettre seule remonterait la moitié du Drive.
  if (terme.length < 2) return { ok: true, valeur: [] };
  const p = new URLSearchParams({
    q: `name contains '${echapperQ(terme)}' and mimeType != '${MIME_DOSSIER}' and trashed = false`,
    fields: CHAMPS_FICHIERS,
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
    corpora: 'allDrives',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la recherche de fichiers') };
  return { ok: true, valeur: versFichiers(await res.json().catch(() => ({}))) };
}

/** Ce que `lireMetadonnees` rend. La VIGNETTE y a rejoint le reste au lot APERCU-RAPIDE — voir ci-dessous. */
export interface MetaFichier {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number | null;
  parents: string[];
  lien: string | null;
  /**
   * 🔴 LOT APERCU-RAPIDE — L'ADRESSE DE LA VIGNETTE DE LA 1re PAGE, telle que Drive la calcule pour nous.
   *
   * ⚠️ ELLE EST DEMANDÉE ICI, DANS LE MÊME `files.get` QUE LE RESTE, et c'est tout l'intérêt : mesuré le
   * 29/09/2026, un `files.get` coûte 270 à 440 ms. En demander un SECOND juste pour la vignette aurait doublé ce
   * prix pour un champ que le premier appel savait déjà rendre. Un champ de plus ne coûte rien ; un aller-retour
   * de plus coûte un tiers de seconde.
   *
   * ⚠️ `null` EST NORMAL : Drive ne fabrique pas de vignette pour tout (fichiers neufs, types exotiques). L'écran
   * passe alors directement au document, sans rien annoncer — une vignette absente n'est pas une panne.
   */
  vignette: string | null;
  /**
   * 🔴 LOT RANGER-INSTANTANE-ET-NOM — le Drive partagé auquel cet élément appartient ; `null` = « Mon Drive ».
   *
   * ⚠️ IL NE COÛTE RIEN : c'est un champ de plus dans un `files.get` qu'on faisait déjà. Il sert à savoir, en
   * lisant la chaîne des parents, dans quel Drive d'équipe on se trouve — une question qui demandait jusqu'ici
   * un second appel (270 à 440 ms mesurées, cf. `driveMemoire`).
   */
  driveId: string | null;
  /**
   * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — L'EMPREINTE DE CONTENU ══════════════════════════════════
   *
   * Elle répond à « est-ce le MÊME document ? », quel que soit son nom : deux fichiers de même empreinte ont les
   * mêmes octets. C'est ce qui permet à la loupe de retrouver une copie faite À LA MAIN dans Google Drive, qui
   * n'a laissé aucune trace dans notre registre.
   *
   * ⚠️ `null` EST NORMAL, ET FRÉQUENT : Google n'en calcule pas pour ses documents natifs (Doc, Sheet, Slide),
   * qui n'ont pas d'octets figés. L'écran le DIT alors, au lieu de laisser croire à un échec.
   *
   * ⚠️ ELLE NE COÛTE RIEN : c'est un champ de plus dans un `files.get` qu'on faisait déjà. Aucun appel
   * supplémentaire, aucun octet de contenu lu — une empreinte n'est pas le document.
   */
  md5: string | null;
}

/**
 * Les MÉTADONNÉES d'un élément : nom, type, taille, parents, vignette, empreinte. LECTURE SEULE.
 *
 * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — `inclureCorbeille`, ET LE DÉFAUT QU'IL RÉPARE ═════════════════════════════
 *
 * CONSTAT SUR LE VRAI DRIVE (03/10/2026, dossier « Test ») : la mise à la corbeille fonctionnait, et « Annuler »
 * répondait « Emplacement incomplet : par précaution, cette mise à la corbeille est refusée ». La restauration
 * était donc IMPOSSIBLE — exactement ce qui rendait le geste réversible.
 *
 * 🔴 LA CAUSE ÉTAIT ICI, ET ELLE EST LOGIQUE : cette fonction REFUSE un élément à la corbeille (voir plus bas).
 * Or, pour restaurer, le fichier EST à la corbeille — par définition. `chaineParents` cassait donc à son premier
 * maillon, le verdict ne savait pas situer le fichier, et « ne pas savoir vaut interdit » faisait le reste.
 *
 * 🔴 LE REFUS PAR DÉFAUT NE BOUGE PAS D'UN IOTA, et c'est important : partout ailleurs (joindre, visualiser,
 * déplacer, copier), un fichier à la corbeille ne doit pas être traité comme présent. Seul le chemin de
 * RESTAURATION demande `inclureCorbeille`, et il le demande parce qu'il sait ce qu'il cherche.
 *
 * ⚠️ CELA NE RELÂCHE AUCUN GARDE-FOU : le verdict reste rendu sur la chaîne RÉELLE des parents, et un fichier de
 * « Documents clients scannés » reste refusé, à la corbeille comme ailleurs. On lit mieux, on n'autorise pas plus.
 */
export async function lireMetadonnees(
  accessToken: string, id: string, deps: DepsGoogle,
  o: { inclureCorbeille?: boolean } = {},
): Promise<Resultat<MetaFichier>> {
  const p = new URLSearchParams({
    fields: 'id,name,mimeType,size,parents,webViewLink,trashed,thumbnailLink,driveId,md5Checksum',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture du fichier') };
  const b = await res.json().catch(() => ({})) as {
    id?: string; name?: string; mimeType?: string; size?: string; parents?: string[];
    webViewLink?: string; trashed?: boolean; thumbnailLink?: string; driveId?: string; md5Checksum?: string;
  };
  if (b.trashed === true && o.inclureCorbeille !== true) {
    return { ok: false, motif: 'Ce fichier est à la corbeille du Drive.' };
  }
  return {
    ok: true,
    valeur: {
      id: b.id ?? id,
      nom: (b.name ?? '').trim() || '(sans nom)',
      typeMime: b.mimeType ?? '',
      tailleOctets: b.size === undefined ? null : Number(b.size),
      parents: b.parents ?? [],
      lien: b.webViewLink ?? null,
      vignette: b.thumbnailLink ?? null,
      driveId: b.driveId ?? null,
      md5: b.md5Checksum ?? null,
    },
  };
}

/**
 * ══ 🔴🔴 LA CHAÎNE DES PARENTS D'UN ÉLÉMENT, jusqu'en haut. LECTURE SEULE (métadonnées uniquement). ══════════════
 *
 * C'est ELLE qui permet de répondre à « ce fichier est-il sous “Documents clients scannés” ? ». On ne se fie ni au
 * nom du fichier, ni à celui de son dossier immédiat : on REMONTE. Un fichier rangé douze niveaux sous le dossier
 * interdit est sous le dossier interdit.
 *
 * ⚠️ BORNÉE, et ELLE S'ARRÊTE SUR ERREUR SANS PRÉTENDRE AVOIR FINI. Le verdict (`peutJoindre`) refuse quand la
 * chaîne est incomplète — c'est exactement ce qu'on veut : ne pas savoir vaut interdit.
 */
export interface MaillonParent { id: string; nom: string; parentId: string | null; driveId?: string | null }

export async function chaineParents(
  accessToken: string, depart: string, deps: DepsGoogle, max = 32,
  /**
   * 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — remonter la chaîne D'UN ÉLÉMENT À LA CORBEILLE. Faux par défaut : tous les
   * appelants d'avant ce lot se comportent à l'identique. Seule la RESTAURATION le passe à vrai, parce qu'elle
   * part justement d'un fichier à la corbeille — sans quoi « Annuler » ne peut rien défaire (défaut constaté sur
   * le vrai Drive le 03/10/2026).
   *
   * ⚠️ IL NE VAUT QUE POUR LE PREMIER MAILLON EN PRATIQUE : un fichier à la corbeille garde ses parents, qui eux
   * ne le sont pas. On le passe quand même à toute la remontée, parce qu'un dossier parent mis à la corbeille
   * avec son contenu est un cas réel, et qu'une chaîne coupée au milieu redonnerait le même refus.
   */
  o: { inclureCorbeille?: boolean } = {},
): Promise<MaillonParent[]> {
  const chaine: MaillonParent[] = [];
  const vus = new Set<string>();
  let courant: string | null = depart;
  for (let i = 0; i < max && courant !== null; i += 1) {
    if (vus.has(courant)) break;
    vus.add(courant);
    const m: Resultat<MetaFichier> = await lireMetadonnees(accessToken, courant, deps, o);
    if (!m.ok) break;
    const parent = m.valeur.parents[0] ?? null;
    chaine.push({ id: courant, nom: m.valeur.nom, parentId: parent, driveId: m.valeur.driveId });
    courant = parent;
  }
  return chaine;
}

/**
 * ══ 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — EXPORTER UN DOCUMENT GOOGLE EN PDF, POUR L'APERÇU. LECTURE SEULE. ═══════
 *
 * 🔴 UN DOCUMENT GOOGLE N'A PAS D'OCTETS : `alt=media` le refuse, parce qu'un Doc n'est pas un fichier — c'est une
 * base de données chez Google. `files.export` en rend une REPRÉSENTATION, calculée à la volée.
 *
 * 🔒 C'EST UNE LECTURE, malgré le mot « export ». La méthode est un GET, rien n'est créé, rien n'est converti dans
 * le Drive, et il n'y reste AUCUNE COPIE — exigence d'Arno pour ce lot. Le PDF ne vit que le temps de la réponse.
 */
export async function exporterEnPdf(
  accessToken: string, id: string, deps: DepsGoogle, tailleMax: number,
): Promise<Resultat<Buffer>> {
  const p = new URLSearchParams({ mimeType: 'application/pdf', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}/export?${p}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture de ce document Google') };
  const octets = Buffer.from(await res.arrayBuffer());
  // ⚠️ La taille n'est connue qu'APRÈS : un document Google n'annonce aucune taille tant qu'il n'est pas exporté.
  if (octets.byteLength > tailleMax) {
    return { ok: false, motif: 'Ce document est trop volumineux pour être affiché en aperçu.' };
  }
  return { ok: true, valeur: octets };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT APERCU-RAPIDE — LIRE EN FLUX PLUTÔT QU'EN UN BLOC, ET POURQUOI C'ÉTAIT LE DÉFAUT PRINCIPAL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   MESURÉ le 29/09/2026 sur trois PDF réels, avec la route telle qu'elle était écrite :

     fichier    téléchargement COMPLET en mémoire     premier morceau d'octets
     0,14 Mo             873 ms                              678 ms
     1,35 Mo           1 291 ms                              896 ms
     2,84 Mo           8 976 ms                              708 ms

   Le premier octet arrive TOUJOURS en moins d'une seconde. C'est l'attente du DERNIER qui coûte — et elle grandit
   avec le fichier, sans rien apporter : le lecteur PDF du navigateur sait afficher les premières pages bien avant
   d'avoir tout reçu. On rendait donc l'écran muet pendant neuf secondes pour lui livrer d'un coup ce qu'il aurait
   affiché progressivement.

   ⇒ CES DEUX FONCTIONS NE LISENT PAS LES OCTETS : elles ouvrent le robinet et rendent le corps de la réponse tel
   quel, à faire suivre au navigateur. Rien ne s'accumule en mémoire du serveur — ni pour 3 Mo, ni pour dix aperçus
   simultanés.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Un flux ouvert chez Google, prêt à être relayé. `corps` est `null` si Google n'a rien renvoyé.
 *
 * 🔴 LOT APERCU-PAGE1 — `statut` et `intervalle` portent la réponse PARTIELLE. Drive rend 206 quand on lui demande
 * une tranche ; il faut transmettre les deux au navigateur, sans quoi PDF.js croit avoir reçu tout le fichier et
 * recommence en entier.
 */
export interface FluxDrive {
  corps: ReadableStream<Uint8Array> | null;
  typeMime: string | null;
  /** 200 (tout) ou 206 (une tranche). */
  statut: number;
  /** La valeur exacte de `Content-Range` rendue par Google, à retransmettre telle quelle. `null` si complète. */
  intervalle: string | null;
  /** La longueur de CE morceau, telle que Google l'annonce. `null` quand il ne l'annonce pas. */
  longueur: number | null;
}

/**
 * OUVRE le flux des octets d'un fichier (`alt=media`). LECTURE SEULE. Ne lit RIEN : rend le robinet.
 *
 * ══ 🔴🔴 LOT APERCU-PAGE1 — LES REQUÊTES PARTIELLES, ET POURQUOI ELLES CHANGENT TOUT ═════════════════════════════
 *
 * MESURÉ le 29/09/2026 : le réseau n'était PAS le coupable — 755 à 993 ms pour télécharger ENTIÈREMENT chacun des
 * quatre PDF d'essai, 3,2 Mo compris. Ce qui prenait 2 à 5 secondes, c'était le lecteur PDF de Chrome, qui attend
 * le fichier complet puis décode 29 pages avant d'en peindre une.
 *
 * On lit désormais le PDF avec PDF.js, page par page — et PDF.js ne demande que les quelques dizaines de kilo-octets
 * dont il a besoin pour la page 1, À CONDITION que la route sache répondre à un `Range`. Sans cela il retombe sur
 * le téléchargement complet, et l'on n'a rien gagné.
 *
 * ⚠️ `Range` EST TRANSMIS TEL QUEL À GOOGLE, jamais réinterprété : Drive sait le faire, et refabriquer la tranche
 * chez nous obligerait à lire tout le fichier pour en couper un morceau — exactement ce qu'on cherche à éviter.
 */
export async function ouvrirFluxFichier(
  accessToken: string, id: string, deps: DepsGoogle, intervalle?: string | null,
): Promise<Resultat<FluxDrive>> {
  const p = new URLSearchParams({ alt: 'media', ...PARTAGES });
  const entetes: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  const demande = (intervalle ?? '').trim();
  if (demande !== '') entetes.Range = demande;
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`, { headers: entetes });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'le téléchargement du fichier') };
  const longueur = Number(res.headers.get('content-length') ?? '');
  return {
    ok: true,
    valeur: {
      corps: res.body,
      typeMime: res.headers.get('content-type'),
      statut: res.status,
      intervalle: res.headers.get('content-range'),
      longueur: Number.isFinite(longueur) && longueur >= 0 ? longueur : null,
    },
  };
}

/**
 * OUVRE le flux de l'EXPORT PDF d'un document Google. LECTURE SEULE (un GET), rien n'est créé dans le Drive.
 *
 * ⚠️ AUCUNE BORNE DE TAILLE ICI, et il n'y en avait déjà pas de vraie : un document Google n'annonce aucune taille
 * tant qu'il n'est pas exporté. L'ancienne version bornait APRÈS avoir tout téléchargé — c'est-à-dire qu'elle
 * refusait un document dont elle venait de payer le prix entier. La borne utile est celle des fichiers ORDINAIRES,
 * qui, eux, annoncent leur taille avant.
 */
export async function ouvrirFluxExportPdf(
  accessToken: string, id: string, deps: DepsGoogle,
): Promise<Resultat<FluxDrive>> {
  const p = new URLSearchParams({ mimeType: 'application/pdf', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}/export?${p}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture de ce document Google') };
  /**
   * ⚠️ AUCUNE TRANCHE POSSIBLE ICI, et il faut le dire. Un export est CALCULÉ à la volée : Google n'en connaît pas
   * la taille d'avance et n'accepte pas de `Range`. L'appelant annoncera donc `Accept-Ranges: none`, et PDF.js
   * téléchargera l'export en entier — ce qui est la seule chose possible, et reste bien plus rapide que le lecteur
   * natif puisque le rendu, lui, se fait page par page.
   */
  return { ok: true, valeur: { corps: res.body, typeMime: 'application/pdf', statut: 200, intervalle: null, longueur: null } };
}

/**
 * OUVRE le flux de la VIGNETTE de la 1re page, à l'adresse que Drive a donnée dans les métadonnées.
 *
 * 🔒 AUCUN JETON N'EST ENVOYÉ, ET IL NE FAUT PAS EN ENVOYER : `thumbnailLink` est une adresse signée, de courte
 * vie, qui s'ouvre telle quelle. Y ajouter l'en-tête d'autorisation la ferait refuser par Google.
 *
 * 🔒 ET ELLE NE SORT PAS D'ICI. L'adresse signée reste côté serveur ; le navigateur, lui, demande la vignette à
 * NOTRE route, qui a d'abord prononcé le verdict. La livrer au navigateur reviendrait à donner une clé d'accès
 * directe au contenu, hors de toute règle.
 *
 * ⚠️ `=s<taille>` EST RÉÉCRIT : Drive propose par défaut une miniature de liste, illisible en grand. On demande
 * une largeur utile — mesuré le 29/09/2026 : ~950 ko en `s1600`, nettement moins en `s1000`, pour une première
 * page parfaitement lisible.
 */
export async function ouvrirFluxVignette(
  lienVignette: string, deps: DepsGoogle, largeur = 1000,
): Promise<Resultat<FluxDrive>> {
  const adresse = lienVignette.replace(/=s\d+(-c)?$/, `=s${largeur}`);
  const res = await deps.fetch(adresse);
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la lecture de la vignette') };
  return {
    ok: true,
    valeur: {
      corps: res.body, typeMime: res.headers.get('content-type') ?? 'image/jpeg',
      statut: 200, intervalle: null, longueur: null,
    },
  };
}

/**
 * LE CONTENU D'UN FICHIER, en octets. LECTURE SEULE (`alt=media`).
 *
 * ⚠️ TOUJOURS EMPLOYÉE POUR LES PIÈCES JOINTES, qui doivent bien être assemblées en entier avant de partir dans un
 * mail. L'APERÇU, lui, est passé au flux (`ouvrirFluxFichier`) au lot APERCU-RAPIDE : regarder n'est pas envoyer.
 *
 * 🔴🔴 CETTE FONCTION NE VÉRIFIE RIEN ELLE-MÊME, et c'est délibéré : elle ne sait pas où le fichier est rangé.
 * C'est l'APPELANT qui doit avoir obtenu le verdict de `peutJoindre` AVANT de l'appeler — et la route qui l'emploie
 * le fait, avec un test qui le prouve. Mélanger la règle et la lecture ferait une fonction qui décide ET qui agit :
 * la règle deviendrait alors invérifiable sans réseau.
 */
export async function lireContenuFichier(
  accessToken: string, id: string, deps: DepsGoogle, tailleMax: number,
): Promise<Resultat<Buffer>> {
  const p = new URLSearchParams({ alt: 'media', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(id)}?${p}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'le téléchargement du fichier') };
  const octets = Buffer.from(await res.arrayBuffer());
  if (octets.byteLength > tailleMax) {
    return { ok: false, motif: `Ce fichier dépasse la taille autorisée pour une pièce jointe.` };
  }
  return { ok: true, valeur: octets };
}

/**
 * ══ 🔴🔴 LOT RANGER-ARBRE-2 — LE VRAI NOM D'UN DRIVE PARTAGÉ ═════════════════════════════════════════════════════
 *
 * 🔴 CE QU'ON A DÉCOUVERT LE 30/09/2026, SUR LE VRAI DRIVE DU CABINET. `files.get` sur la RACINE d'un Drive
 * partagé ne rend pas son nom : il rend le mot générique « Drive ». Mesuré :
 *
 *     files.get(0AMcTtmCenCqoUk9PVA) → { name: "Drive" }        ← ce que voit la chaîne des parents
 *     drives.list                    → { name: "GESTION LOCATIVE" } ← le vrai nom, celui qu'Arno lit partout
 *
 * C'EST L'AUTRE MOITIÉ DU CONSTAT D'ARNO : « un dossier ouvert depuis “Récents” affiche “Google Drive › Drive” ».
 * Il manquait les parents — et le seul parent affiché portait, en plus, un nom que personne ne reconnaît.
 *
 * ⚠️ UN APPEL, ET SEULEMENT POUR UNE RACINE DE DRIVE PARTAGÉ (un maillon sans parent dont l'identifiant est celui
 * du Drive). Une chaîne dans « Mon Drive » n'en déclenche aucun.
 * 🔒 LECTURE SEULE : `drives.get` ne lit qu'un nom.
 */
export async function nomDuDrive(
  accessToken: string, driveId: string, deps: DepsGoogle,
): Promise<string | null> {
  const res = await deps.fetch(`${ENDPOINT_DRIVES}/${encodeURIComponent(driveId)}?fields=name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { name?: string };
  const nom = (j.name ?? '').trim();
  return nom === '' ? null : nom;
}
