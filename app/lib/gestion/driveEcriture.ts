/**
 * MODULE « GESTION » — LOT DRIVE-1 : LA SEULE PORTE D'ÉCRITURE DANS DRIVE. IMPUR (réseau + base).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 IL N'EXISTE AUCUN AUTRE CHEMIN. Tout ce qui écrit dans Drive pour ce lot passe ici, et rien ne sort d'ici sans
 * avoir d'abord obtenu le verdict de `driveGardeFou`. C'est ce qui rend la règle d'Arno du 26/09/2026 vérifiable :
 * il suffit de lire ce fichier pour savoir ce que le programme peut toucher. Un test statique
 * (`driveGardeFou.test.ts`) compte les verbes HTTP d'écriture et les appels au garde, et échoue s'ils divergent.
 *
 * 🔴 CE MODULE NE SAIT FAIRE QUE CINQ CHOSES : créer un dossier, créer un raccourci, créer la racine — et, depuis la
 * décision d'Arno du 18/10/2026, créer un dossier MIROIR sous le dossier de copie et COPIER un fichier de
 * « Documents clients scannés » dans ce miroir (`copierDepuisScannes`, la SEULE fonction qui émette `files.copy`).
 * Il ne sait ni renommer, ni déplacer, ni supprimer, ni partager, ni déposer un fichier — ces fonctions ne sont pas
 * écrites, donc elles ne peuvent pas être appelées par erreur. Le garde-fou les connaît quand même (`OperationDrive`)
 * parce que le jour où l'une d'elles s'écrira, elle devra passer par lui.
 *
 * 🔴 UN REFUS EST JOURNALISÉ AVANT D'ÊTRE RENDU. Un refus silencieux serait le pire des deux mondes : la protection
 * joue, et personne ne sait qu'elle a dû jouer. La ligne part dans `gestion_drive_refus`, qui est append-only.
 *
 * ⚠️ LE RYTHME EST BRIDÉ. Drive plafonne les écritures par utilisateur et par seconde ; une construction de plusieurs
 * milliers de dossiers lancée à pleine vitesse se fait refuser au bout de quelques dizaines. On attend entre deux
 * écritures, et on réessaie avec une attente croissante sur 403/429/5xx — jamais sur autre chose, parce qu'une
 * erreur de droits ne se répare pas en insistant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { MIME_DOSSIER, MIME_RACCOURCI } from './drive';
import {
  nettoyerNom, porteLeNomProtege, verifierCopieDepuisScannes, verifierCreationRacine, verifierDestinationCopie,
  verifierEcriture, type ContexteCopieScannes, type IndexArbre, type OperationDrive, type Verdict,
} from './driveGardeFou';

const API = 'https://www.googleapis.com/drive/v3';

/** Entre deux écritures. 12/s est la cadence que Drive tolère confortablement pour un utilisateur délégué. */
export const PAUSE_ECRITURE_MS = 80;
/** Combien de fois on réessaie une écriture ralentie par Google, et à partir de quelle attente. */
export const REESSAIS_MAX = 5;
export const ATTENTE_INITIALE_MS = 1_000;

export interface DepsDrive {
  fetch: typeof fetch;
  /** Injectée pour que les tests n'attendent pas réellement. */
  attendre?: (ms: number) => Promise<void>;
}

export type IssueCreation =
  | { ok: true; id: string; nom: string }
  | { ok: false; refuse: true; motif: string }
  | { ok: false; refuse: false; motif: string };

const dormir = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/**
 * JOURNALISE UN REFUS. Ne lève jamais : un journal qui échoue ne doit pas masquer le refus lui-même, qui reste
 * rendu à l'appelant et fait échouer la commande.
 */
export async function journaliserRefus(
  refus: { operation: OperationDrive; parentDriveId?: string | null; cibleDriveId?: string | null; nom?: string },
  verdict: Extract<Verdict, { ok: false }>,
  auteur = 'construction',
): Promise<void> {
  try {
    await query(
      `INSERT INTO gestion_drive_refus (operation, parent_drive_id, cible_drive_id, nom_tente, garde, motif, auteur_libelle)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [refus.operation, refus.parentDriveId ?? null, refus.cibleDriveId ?? null, refus.nom ?? null,
        verdict.garde, verdict.motif, auteur]);
  } catch (e) {
    console.error('[driveEcriture] refus non journalisé (le refus, lui, tient)', e);
  }
}

/** Un appel à Drive, avec réessai sur les seuls codes qui se réparent en attendant. */
async function appeler(
  url: string, init: RequestInit, deps: DepsDrive,
): Promise<{ ok: true; corps: Record<string, unknown> } | { ok: false; motif: string }> {
  const attendre = deps.attendre ?? dormir;
  let attente = ATTENTE_INITIALE_MS;

  for (let essai = 0; essai <= REESSAIS_MAX; essai += 1) {
    let reponse: Response;
    try {
      reponse = await deps.fetch(url, init);
    } catch (e) {
      return { ok: false, motif: `Drive injoignable : ${(e as Error).message}` };
    }
    if (reponse.ok) return { ok: true, corps: (await reponse.json()) as Record<string, unknown> };

    // 🔴 ON NE RÉESSAIE QUE CE QUI SE RÉPARE EN ATTENDANT. Un 403 « insufficientPermissions » ou un 404 ne
    //   deviendront pas vrais parce qu'on insiste — insister masquerait le vrai motif.
    const texte = await reponse.text().catch(() => '');
    const ralenti = reponse.status === 429
      || (reponse.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(texte))
      || reponse.status >= 500;
    if (!ralenti || essai === REESSAIS_MAX) {
      return { ok: false, motif: `Drive a répondu ${reponse.status} : ${texte.slice(0, 300)}` };
    }
    await attendre(attente);
    attente *= 2;
  }
  return { ok: false, motif: 'Drive n’a pas répondu après plusieurs essais.' };
}

/**
 * CRÉE UN DOSSIER. Refuse si le garde-fou refuse — et le journalise.
 *
 * ⚠️ `parentDriveId` DOIT être un dossier de la liste blanche. C'est l'appelant qui le sait, mais c'est le garde
 * qui le vérifie : on ne se fie jamais à ce que l'appelant croit savoir.
 */
export async function creerDossier(
  demande: { parentDriveId: string; nom: string },
  index: IndexArbre,
  jeton: string,
  deps: DepsDrive,
): Promise<IssueCreation> {
  const nom = nettoyerNom(demande.nom);
  const verdict = verifierEcriture({ operation: 'creer_dossier', parentDriveId: demande.parentDriveId }, index);
  if (!verdict.ok) {
    await journaliserRefus({ operation: 'creer_dossier', parentDriveId: demande.parentDriveId, nom }, verdict);
    return { ok: false, refuse: true, motif: verdict.motif };
  }

  const r = await appeler(`${API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: MIME_DOSSIER, parents: [demande.parentDriveId] }),
  }, deps);
  if (!r.ok) return { ok: false, refuse: false, motif: r.motif };

  const id = typeof r.corps.id === 'string' ? r.corps.id : '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour ce dossier.' };
  return { ok: true, id, nom };
}

/**
 * CRÉE UN RACCOURCI, dans notre arborescence, vers un dossier de notre arborescence.
 *
 * 🔴 LES DEUX BOUTS SONT VÉRIFIÉS. Un raccourci dont la CIBLE serait un dossier préexistant ferait entrer ce dossier
 * dans notre arborescence à l'œil, et le premier clic y mènerait. Le garde vérifie donc aussi la cible.
 */
export async function creerRaccourci(
  demande: { parentDriveId: string; cibleDriveId: string; nom: string },
  index: IndexArbre,
  jeton: string,
  deps: DepsDrive,
): Promise<IssueCreation> {
  const nom = nettoyerNom(demande.nom);
  const verdict = verifierEcriture(
    { operation: 'creer_raccourci', parentDriveId: demande.parentDriveId, cibleDriveId: demande.cibleDriveId }, index);
  if (!verdict.ok) {
    await journaliserRefus(
      { operation: 'creer_raccourci', parentDriveId: demande.parentDriveId, cibleDriveId: demande.cibleDriveId, nom },
      verdict);
    return { ok: false, refuse: true, motif: verdict.motif };
  }

  const r = await appeler(`${API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nom, mimeType: MIME_RACCOURCI, parents: [demande.parentDriveId],
      shortcutDetails: { targetId: demande.cibleDriveId },
    }),
  }, deps);
  if (!r.ok) return { ok: false, refuse: false, motif: r.motif };

  const id = typeof r.corps.id === 'string' ? r.corps.id : '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour ce raccourci.' };
  return { ok: true, id, nom };
}

/**
 * CRÉE LA RACINE — la SEULE écriture hors de l'arborescence, et la plus surveillée.
 *
 * 🔴 ELLE COMMENCE PAR REGARDER SI UN ÉLÉMENT DU MÊME NOM EXISTE DÉJÀ, en lecture. S'il y en a un, on s'arrête : ce
 * lot ne réutilise pas et ne modifie pas un dossier qu'il n'a pas créé. C'est une question pour Arno, pas une
 * décision de programme.
 */
export async function creerRacine(
  demande: { driveId: string; nom: string },
  index: IndexArbre,
  jeton: string,
  deps: DepsDrive,
): Promise<IssueCreation> {
  const nom = nettoyerNom(demande.nom);

  // ── LECTURE d'abord : y a-t-il déjà quelque chose de ce nom ? ────────────────────────────────────────────────
  const q = `'${demande.driveId}' in parents and trashed = false and name = '${nom.replace(/'/g, "\\'")}'`;
  const vu = await appeler(
    `${API}/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`
    + `&corpora=drive&driveId=${demande.driveId}&pageSize=10&fields=files(id,name)`,
    { method: 'GET', headers: { Authorization: `Bearer ${jeton}` } }, deps);
  if (!vu.ok) return { ok: false, refuse: false, motif: vu.motif };
  const homonymes = (Array.isArray(vu.corps.files) ? vu.corps.files : [])
    .map((f) => f as { id: string; name: string })
    .map((f) => ({ id: f.id, nom: f.name }));

  const verdict = verifierCreationRacine(
    { driveIdCible: demande.driveId, driveIdAttendu: demande.driveId, homonymesTrouves: homonymes }, index);
  if (!verdict.ok) {
    await journaliserRefus({ operation: 'creer_dossier', parentDriveId: demande.driveId, nom }, verdict);
    return { ok: false, refuse: true, motif: verdict.motif };
  }

  const r = await appeler(`${API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: MIME_DOSSIER, parents: [demande.driveId] }),
  }, deps);
  if (!r.ok) return { ok: false, refuse: false, motif: r.motif };

  const id = typeof r.corps.id === 'string' ? r.corps.id : '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour la racine.' };
  return { ok: true, id, nom };
}

/** Un dossier mémorisé existe-t-il encore dans Drive ? LECTURE SEULE — sert à SIGNALER, jamais à recréer. */
export async function dossierExisteEncore(
  driveId: string, jeton: string, deps: DepsDrive,
): Promise<{ existe: boolean; nom?: string; motif?: string }> {
  const r = await appeler(`${API}/files/${driveId}?supportsAllDrives=true&fields=id,name,trashed`,
    { method: 'GET', headers: { Authorization: `Bearer ${jeton}` } }, deps);
  if (!r.ok) return { existe: false, motif: r.motif };
  return { existe: r.corps.trashed !== true, nom: typeof r.corps.name === 'string' ? r.corps.name : undefined };
}

// ── LA COPIE DEPUIS « Documents clients scannés » (décision d'Arno du 18/10/2026) ───────────────────────────────────

/** Les étiquettes de suivi posées SUR LA COPIE à sa création — jamais sur l'original. */
export interface EtiquettesCopie {
  /** L'identifiant de l'élément de « Documents clients scannés » dont c'est la copie. */
  svav_source_id: string;
  /** Sa date de modification au moment de la copie : deux versions d'un même fichier coexistent sans s'écraser. */
  svav_source_modifie?: string;
}
const CLES_ETIQUETTES = new Set(['svav_source_id', 'svav_source_modifie']);

export class RequeteCopieRefusee extends Error {
  constructor(motif: string) {
    super(`Copie depuis « Documents clients scannés » : ${motif}`);
    this.name = 'RequeteCopieRefusee';
  }
}

/**
 * LE `fetch` DE LA COPIE. Il ne laisse passer QUE deux formes de requête, et lève AVANT tout envoi pour le reste :
 *   · un `GET` de l'API de lecture Drive (`files…`) ;
 *   · un `POST {API}/files/<id>/copy?…` dont le corps est EXACTEMENT `{ name, parents: [<un dossier>], appProperties }`,
 *     `name` étant le NOM EXACT de la source (`nomsAttendus`, lu chez Google), `appProperties` ne portant que les
 *     étiquettes de suivi, et le parent n'étant pas un identifiant protégé.
 * Tout le reste — PATCH, PUT, DELETE, /permissions, /watch, /emptyTrash, addParents, removeParents, trashed,
 * properties, un `name` qui n'est pas celui de la source, description, starred… — est refusé. Défense en profondeur :
 * le verdict a déjà jugé la requête.
 *
 * 🔴 CORRECTIF DU 19/10/2026 — LE NOM EST TOUJOURS TRANSMIS. Sans lui, Google nomme la copie d'un document Google
 * natif « Copie de … » (arrêt du 18/10, `docs/COPIE_ARCHIVE_ARRET_2026-10-18.md`). Un nom absent est donc refusé, et un
 * nom différent de celui de la source aussi : ce serait un renommage déguisé.
 */
export function fetchCopieScannes(
  base: typeof fetch, proteges: ReadonlySet<string>, nomsAttendus: ReadonlyMap<string, string> = new Map(),
): typeof fetch {
  return (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = (init?.method ?? 'GET').toUpperCase();
    if (/[?&](addParents|removeParents)=/.test(url)) throw new RequeteCopieRefusee('déplacement refusé');
    if (methode === 'GET') {
      if (!url.startsWith(`${API}/files`) || /\/(permissions|watch|emptyTrash|revisions|comments)(\/|\?|$)/.test(url)) {
        throw new RequeteCopieRefusee(`lecture hors de l’API des fichiers refusée : ${url.slice(0, 120)}`);
      }
      return base(entree, init);
    }
    if (methode !== 'POST') throw new RequeteCopieRefusee(`méthode ${methode} refusée`);
    const m = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([A-Za-z0-9_-]+)\/copy\?[^/]*$/.exec(url);
    if (m === null) throw new RequeteCopieRefusee(`POST hors copie refusé : ${url.slice(0, 120)}`);
    let corps: Record<string, unknown>;
    try {
      corps = JSON.parse(String(init?.body ?? '')) as Record<string, unknown>;
    } catch {
      throw new RequeteCopieRefusee('corps illisible');
    }
    const cles = Object.keys(corps);
    if (cles.some((k) => k !== 'name' && k !== 'parents' && k !== 'appProperties')) {
      throw new RequeteCopieRefusee(`champ refusé dans le corps : ${cles.join(', ')}`);
    }
    const attendu = nomsAttendus.get(m[1]);
    if (typeof corps.name !== 'string' || corps.name === '' || attendu === undefined || corps.name !== attendu) {
      throw new RequeteCopieRefusee('le nom de la copie doit être EXACTEMENT celui de la source');
    }
    const parents = corps.parents;
    if (!Array.isArray(parents) || parents.length !== 1 || typeof parents[0] !== 'string' || proteges.has(parents[0])) {
      throw new RequeteCopieRefusee('un seul parent, jamais protégé');
    }
    const etiquettes = (corps.appProperties ?? {}) as Record<string, unknown>;
    if (typeof etiquettes !== 'object' || Object.keys(etiquettes).some((k) => !CLES_ETIQUETTES.has(k))) {
      throw new RequeteCopieRefusee('étiquette non permise');
    }
    return base(entree, init);
  }) as typeof fetch;
}

export type IssueCopie =
  | { ok: true; id: string; nom: string; md5: string | null; taille: string | null; mime: string }
  | { ok: false; refuse: true; motif: string }
  | { ok: false; refuse: false; motif: string };

/**
 * COPIE UN FICHIER de « Documents clients scannés » vers un dossier miroir à nous. La SEULE fonction qui émette
 * `files.copy`. Le corps est construit ICI, jamais reçu de l'appelant : `{ name, parents: [destination], appProperties }`.
 *
 * 🔴 LE NOM EXACT DE LA SOURCE EST TOUJOURS TRANSMIS (correctif du 19/10/2026) : Google ne recopie pas le nom d'un
 * document Google natif, il écrit « Copie de … ». Le nom vient du relevé chez Google, tel quel, sans aucun nettoyage.
 * Un document Google se copie TEL QUEL (même type, aucune conversion) : `files.copy` ne convertit jamais.
 */
export async function copierDepuisScannes(
  demande: {
    sourceId: string; sourceMime: string; sourceChaine: readonly string[]; destinationId: string;
    /** Le nom EXACT de la source, lu chez Google. */
    sourceNom: string;
    sourceModifie?: string;
  },
  index: IndexArbre,
  ctx: ContexteCopieScannes,
  proteges: ReadonlySet<string>,
  jeton: string,
  deps: DepsDrive,
): Promise<IssueCopie> {
  const verdict = verifierCopieDepuisScannes(demande, index, ctx);
  if (!verdict.ok) {
    await journaliserRefus(
      { operation: 'copier_depuis_scannes', parentDriveId: demande.destinationId, cibleDriveId: demande.sourceId },
      verdict);
    return { ok: false, refuse: true, motif: verdict.motif };
  }
  const etiquettes: EtiquettesCopie = { svav_source_id: demande.sourceId };
  if (demande.sourceModifie !== undefined) etiquettes.svav_source_modifie = demande.sourceModifie;

  const r = await appeler(
    `${API}/files/${demande.sourceId}/copy?supportsAllDrives=true&fields=id,name,md5Checksum,size,mimeType`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: demande.sourceNom, parents: [demande.destinationId], appProperties: etiquettes }),
    }, { ...deps, fetch: fetchCopieScannes(deps.fetch, proteges, new Map([[demande.sourceId, demande.sourceNom]])) });
  if (!r.ok) return { ok: false, refuse: false, motif: r.motif };
  const id = typeof r.corps.id === 'string' ? r.corps.id : '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour cette copie.' };
  const texte = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    ok: true, id, nom: texte(r.corps.name) ?? '', md5: texte(r.corps.md5Checksum), taille: texte(r.corps.size),
    mime: texte(r.corps.mimeType) ?? '',
  };
}

/**
 * CRÉE UN DOSSIER MIROIR sous le dossier de copie, avec le nom EXACT de l'original (aucun nettoyage : « strictement
 * identique » — un espace final compris) et l'étiquette `svav_source_id`. Le parent doit être un dossier à nous,
 * SOUS le dossier de copie. Le nom exact « Documents clients scannés » est refusé : l'application le prendrait pour
 * l'original protégé.
 */
export async function creerDossierDeCopie(
  demande: { parentDriveId: string; nom: string; sourceId: string },
  index: IndexArbre,
  ctx: ContexteCopieScannes,
  jeton: string,
  deps: DepsDrive,
): Promise<IssueCreation> {
  const nom = demande.nom;
  // eslint-disable-next-line no-control-regex
  const nomRefuse = nom.trim() === '' || /[\u0000-\u001f\u007f]/.test(nom) || porteLeNomProtege(nom);
  const ecriture = verifierEcriture({ operation: 'creer_dossier', parentDriveId: demande.parentDriveId }, index);
  const verdict: Verdict = !ecriture.ok ? ecriture
    : nomRefuse ? { ok: false, garde: 'autre', motif: `Nom de dossier miroir refusé : « ${nom} ».` }
      : verifierDestinationCopie(demande.parentDriveId, index, ctx);
  if (!verdict.ok) {
    await journaliserRefus({ operation: 'creer_dossier', parentDriveId: demande.parentDriveId, nom }, verdict);
    return { ok: false, refuse: true, motif: verdict.motif };
  }
  const r = await appeler(`${API}/files?supportsAllDrives=true&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nom, mimeType: MIME_DOSSIER, parents: [demande.parentDriveId],
      appProperties: { svav_source_id: demande.sourceId },
    }),
  }, deps);
  if (!r.ok) return { ok: false, refuse: false, motif: r.motif };
  const id = typeof r.corps.id === 'string' ? r.corps.id : '';
  if (id === '') return { ok: false, refuse: false, motif: 'Drive n’a pas rendu d’identifiant pour ce dossier.' };
  return { ok: true, id, nom };
}

/** La pause entre deux écritures, à appeler par la boucle de construction. */
export const respirer = (deps: DepsDrive): Promise<void> => (deps.attendre ?? dormir)(PAUSE_ECRITURE_MS);
