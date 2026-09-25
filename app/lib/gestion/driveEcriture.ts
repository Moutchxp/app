/**
 * MODULE « GESTION » — LOT DRIVE-1 : LA SEULE PORTE D'ÉCRITURE DANS DRIVE. IMPUR (réseau + base).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 IL N'EXISTE AUCUN AUTRE CHEMIN. Tout ce qui écrit dans Drive pour ce lot passe ici, et rien ne sort d'ici sans
 * avoir d'abord obtenu le verdict de `driveGardeFou`. C'est ce qui rend la règle d'Arno du 26/09/2026 vérifiable :
 * il suffit de lire ce fichier pour savoir ce que le programme peut toucher. Un test statique
 * (`driveGardeFou.test.ts`) compte les verbes HTTP d'écriture et les appels au garde, et échoue s'ils divergent.
 *
 * 🔴 CE MODULE NE SAIT FAIRE QUE TROIS CHOSES : créer un dossier, créer un raccourci, créer la racine. Il ne sait
 * ni renommer, ni déplacer, ni supprimer, ni partager, ni copier, ni déposer un fichier — ces fonctions ne sont pas
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
  nettoyerNom, verifierCreationRacine, verifierEcriture,
  type IndexArbre, type OperationDrive, type Verdict,
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

/** La pause entre deux écritures, à appeler par la boucle de construction. */
export const respirer = (deps: DepsDrive): Promise<void> => (deps.attendre ?? dormir)(PAUSE_ECRITURE_MS);
