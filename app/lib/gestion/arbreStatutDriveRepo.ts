import { query } from '../db/client';
import { chaineParents, echapperQ, MIME_DOSSIER, motifHttp } from './drive';
import { deplacerVers } from './driveMouvement';
import { porteLeNomProtege } from './driveGardeFou';
import { ETIQUETTE_ARBO, nomAdresse, nomBienArbo, type LotArbo } from './arborescenceDrive';
import {
  CLE_RACINE_LOCATION_SEULE, cleN3, cleN4, etatDossierBien, libellePlace, memePlace, NOM_RACINE_LOCATION_SEULE, placeDuStatut, planDossierBien,
  refusEcritureArbre, type ArbreDrive, type BienARanger, type CreationNoeud, type EtatDossierBien, type MaillonArbre, type PlaceDrive, type RacinesArbres,
} from './arbreStatutDrive';
import { estStatutBien, type StatutBien } from './statutBien';
import { sqlArchiveBien, sqlStatutBien } from './statutBienRepo';
import { dossiersAnnuelsActifs } from './finGestion';
import { jetonAccesGestion, type EtatGoogle } from './jetonAcces';
import { colonneExisteMemo } from '../location/sondeLocation';

/**
 * ══ 🔴🔴 LE DOSSIER DRIVE D'UN BIEN SELON SON STATUT — CRÉER, DÉPLACER (Arno, 21/10/2026, migrations 403 et 404). IMPUR. ═══════
 *
 *   · « Nouveau bien » : le dossier du bien (propriétaire › adresse › bien + rubriques N6) est créé DÈS l'enregistrement, dans
 *     l'arbre de son statut — APRÈS l'écriture en base (jamais dans sa transaction) : un échec du Drive ne défait rien ; la fiche
 *     dit « Dossier Drive à créer » et « Créer le dossier » rejoue. Le dossier BAIL reste créé à « Nouveau locataire ».
 *   · Chaque TRANSITION de statut DÉPLACE le N5 entier (N3 / N4 de la destination créés au besoin) ; en cas d'échec, le statut
 *     reste enregistré, la fiche dit « Dossier Drive à déplacer » et « Déplacer maintenant » rejoue.
 *   · IDEMPOTENT : chaque dossier porte sa clé (`svav_arbo`), cherchée sous son parent avant toute création, et inscrite au
 *     registre `gestion_drive_noeud` (avec son ARBRE, 404) ; une clé connue n'est jamais recréée.
 * 🔴 GARDE-FOUS : on ne crée et ne déplace QUE dans les deux arbres, et QUE des dossiers du registre ; « Documents clients
 * scannés » : aucune action (règle pure `refusEcritureArbre`, vérifiée sur la CHAÎNE DES PARENTS lue chez Google, avant toute
 * écriture). Écritures : créer un dossier étiqueté, déplacer un N5 (`addParents` / `removeParents`, corps vide) — ni suppression,
 * ni corbeille, ni copie, ni renommage. `fetch` et le jeton sont INJECTÉS (épreuves sans réseau) ; en recette, le `fetch`
 * global refuse les écritures Drive (la fiche dit alors « à créer » / « à déplacer »).
 */
const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
const PARTAGES = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
export interface DepsArbre { fetch: typeof fetch; jeton: () => Promise<EtatGoogle>; maintenant?: () => Date }
const DEPS_PAR_DEFAUT: DepsArbre = { fetch: (...a) => fetch(...a), jeton: jetonAccesGestion };

export const MOTIF_SANS_404 = 'Mise à jour de la base à appliquer (migration 404) : le dossier Drive du bien n’est pas encore géré selon son statut.';

export type IssueDossierBien =
  | { ok: true; driveId: string; geste: 'cree' | 'deplace' | 'deja'; place: PlaceDrive; crees: { cle: string; nom: string; driveId: string }[] }
  | { ok: false; motif: string };

export function arbreDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_drive_noeud', 'arbre');
}

/** Les racines des deux arbres et les N2 « Actifs » / « Inactifs ». Lecture seule. */
export async function racinesConnues(): Promise<RacinesArbres & { n2: Record<'Actifs' | 'Inactifs', string | null> }> {
  const { rows: r } = await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_arbre WHERE sorte = 'racine' AND absent_le IS NULL ORDER BY drive_id LIMIT 1`)
    .catch(() => ({ rows: [] as { d: string }[] }));
  const { rows: n2 } = await query<{ b: string; d: string }>(
    `SELECT DISTINCT ON (branche) branche AS b, parent_drive_id AS d FROM (
       SELECT branche, parent_drive_id, count(*) AS n FROM gestion_drive_noeud
        WHERE sorte = 'proprietaire' AND arbre = 'locative' GROUP BY 1, 2) x ORDER BY branche, n DESC`);
  const { rows: ls } = await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_racine WHERE arbre = 'location_seule'`);
  return {
    locative: r[0]?.d ?? null, locationSeule: ls[0]?.d ?? null,
    n2: { Actifs: n2.find((x) => x.b === 'Actifs')?.d ?? null, Inactifs: n2.find((x) => x.b === 'Inactifs')?.d ?? null },
  };
}

/** La TÊTE du bien d'un lot : son bien principal pour une annexe rattachée, sinon lui-même. */
async function teteDuLot(lotId: number): Promise<number> {
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const { rows } = await query<{ p: string }>(
    `SELECT ax.parent_id::text AS p FROM gestion_lot_annexe ax JOIN gestion_annuaire_lot an ON an.id = ax.annexe_id
      WHERE ax.annexe_id = $1${avecDetache ? ' AND an.annexe_detachee_le IS NULL' : ''}`, [lotId]).catch(() => ({ rows: [] as { p: string }[] }));
  return rows[0] === undefined ? lotId : Number(rows[0].p);
}

interface N5Inscrit { cle: string; driveId: string; parent: string; place: PlaceDrive; teteId: number }

/** Le N5 inscrit d'un bien (par sa tête, ou par le dossier attitré du lot). */
async function n5DuBien(teteId: number): Promise<N5Inscrit | null> {
  const avecDossier = await colonneExisteMemo('gestion_annuaire_lot', 'drive_dossier_id');
  const { rows } = await query<{ cle: string; d: string; p: string; arbre: string; branche: string | null; lot: string }>(
    `SELECT n.cle, n.drive_id AS d, n.parent_drive_id AS p, n.arbre, n.branche, n.lot_id::text AS lot FROM gestion_drive_noeud n
      WHERE n.sorte = 'bien' AND (n.lot_id = $1${avecDossier ? ' OR n.drive_id = (SELECT drive_dossier_id FROM gestion_annuaire_lot WHERE id = $1)' : ''})
      ORDER BY (n.lot_id = $1) DESC LIMIT 1`, [teteId]);
  const r = rows[0];
  if (r === undefined) return null;
  return { cle: r.cle, driveId: r.d, parent: r.p, place: { arbre: r.arbre as ArbreDrive, branche: (r.branche as PlaceDrive['branche']) ?? null }, teteId: Number(r.lot) };
}

/** Le statut ACTUEL d'un bien, et s'il est archivé (405). */
async function etatDuLot(lotId: number): Promise<{ statut: StatutBien; archive: boolean } | null> {
  const { rows } = await query<{ s: string; a: string | null }>(
    `SELECT ${await sqlStatutBien('lo')} AS s, (${await sqlArchiveBien('lo')})::text AS a FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [lotId]);
  return estStatutBien(rows[0]?.s) ? { statut: rows[0].s as StatutBien, archive: rows[0].a !== null } : null;
}

/** Une clé de registre LIBRE : la clé de base, ou « base:2 », « base:3 »… si elle est déjà prise ailleurs (N3 déplacé entier). */
async function cleLibre(base: string): Promise<string> {
  const { rows } = await query<{ cle: string }>('SELECT cle FROM gestion_drive_noeud WHERE cle = $1 OR cle LIKE $2', [base, `${base}:%`]);
  const prises = new Set(rows.map((r) => r.cle));
  if (!prises.has(base)) return base;
  for (let k = 2; ; k += 1) if (!prises.has(`${base}:${k}`)) return `${base}:${k}`;
}

export interface EtatDriveDuBien { etat: EtatDossierBien; n5DriveId: string | null; attendu: PlaceDrive; libelleAttendu: string; libelleActuel: string | null }

/** L'ÉTAT du dossier Drive d'un bien (fiche) : à sa place, à créer, à déplacer. `null` sans la 404. Lecture seule. */
export async function etatDriveDuBien(lotId: number): Promise<EtatDriveDuBien | null> {
  if (!(await arbreDisponible())) return null;
  const tete = await teteDuLot(lotId);
  const e = await etatDuLot(tete);
  if (e === null) return null;
  const n5 = await n5DuBien(tete);
  // « Gestion terminée » : la place attendue est celle où le dossier EST déjà (il ne bouge pas).
  const attendu = e.statut === 'ancienne_gestion' && !e.archive && n5 !== null && n5.place.arbre === 'locative' ? n5.place : placeDuStatut(e.statut, e.archive);
  return { etat: etatDossierBien(e.statut, n5?.place ?? null, e.archive), n5DriveId: n5?.driveId ?? null, attendu, libelleAttendu: libellePlace(attendu),
    libelleActuel: n5 === null ? null : libellePlace(n5.place) };
}

/** Les N3 d'un propriétaire, par place (fiche d'un propriétaire aux statuts mêlés : un bouton par dossier). Lecture seule. */
export async function dossiersDuProprietaire(proprietaireId: number): Promise<{ driveId: string; place: PlaceDrive; libelle: string }[]> {
  if (!(await arbreDisponible())) return [];
  const { rows } = await query<{ d: string; arbre: string; branche: string | null }>(
    `SELECT drive_id AS d, arbre, branche FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND proprietaire_id = $1
      ORDER BY (arbre = 'locative') DESC, branche NULLS LAST`, [proprietaireId]);
  return rows.map((r) => { const place = { arbre: r.arbre as ArbreDrive, branche: (r.branche as PlaceDrive['branche']) ?? null }; return { driveId: r.d, place, libelle: libellePlace(place) }; });
}

// ── GOOGLE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function jetonOk(deps: DepsArbre): Promise<string | { motif: string }> {
  const j = await deps.jeton().catch(() => ({ etat: 'expire' as const, motif: 'Google n’a pas répondu.' }));
  return j.etat === 'ok' ? j.jeton : { motif: `Drive indisponible : ${j.motif}` };
}

async function enfants(deps: DepsArbre, jeton: string, parentId: string): Promise<{ id: string; nom: string; cle: string | null }[] | null> {
  const q = `'${echapperQ(parentId)}' in parents and trashed = false and mimeType = '${MIME_DOSSIER}'`;
  const r = await deps.fetch(`${API_FICHIERS}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,appProperties)')}&pageSize=1000&${PARTAGES}`,
    { headers: { Authorization: `Bearer ${jeton}` } }).catch(() => null);
  if (r === null || !r.ok) return null;
  const j = (await r.json().catch(() => null)) as { files?: { id: string; name: string; appProperties?: Record<string, string> }[] } | null;
  return j === null ? null : (j.files ?? []).map((f) => ({ id: f.id, nom: f.name, cle: f.appProperties?.[ETIQUETTE_ARBO] ?? null }));
}

async function creerDossierEtiquete(deps: DepsArbre, jeton: string, o: { parentId: string; nom: string; cle: string }): Promise<{ id: string } | { motif: string }> {
  const r = await deps.fetch(`${API_FICHIERS}?fields=id%2Cname&${PARTAGES}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: o.nom, mimeType: MIME_DOSSIER, parents: [o.parentId], appProperties: { [ETIQUETTE_ARBO]: o.cle } }),
  }).catch(() => null);
  if (r === null) return { motif: 'Le Drive n’a pas répondu.' };
  if (!r.ok) return { motif: motifHttp(r.status, `la création du dossier « ${o.nom} »`) };
  const j = (await r.json().catch(() => ({}))) as { id?: string };
  return typeof j.id === 'string' && j.id !== '' ? { id: j.id } : { motif: 'Google n’a pas rendu d’identifiant pour ce dossier.' };
}

/** 🔴 LE GARDE, sur la chaîne RÉELLE des parents (lue chez Google) d'un dossier visé. */
async function refusPour(deps: DepsArbre, jeton: string, dossierId: string, racines: RacinesArbres): Promise<string | null> {
  const chaine: MaillonArbre[] = (await chaineParents(jeton, dossierId, { fetch: deps.fetch })).map((m) => ({ id: m.id, nom: m.nom, parentId: m.parentId }));
  return refusEcritureArbre(chaine, racines);
}

/**
 * LA RACINE « Base de données location seule » : celle du registre ; sinon retrouvée (par son étiquette) ou créée À CÔTÉ de
 * « Base de données locative » (même parent : le Drive partagé « GESTION LOCATIVE »), puis inscrite. C'est la SEULE création
 * permise hors des deux arbres, et seulement là.
 */
export async function assurerRacineLocationSeule(deps: DepsArbre, jeton: string, auteur: string): Promise<{ id: string } | { motif: string }> {
  const r = await racinesConnues();
  if (r.locationSeule !== null) return { id: r.locationSeule };
  if (r.locative === null) return { motif: 'La racine « Base de données locative » n’est pas connue : « Base de données location seule » ne peut pas être placée à côté.' };
  const chaine = await chaineParents(jeton, r.locative, { fetch: deps.fetch });
  const parent = chaine[0]?.parentId ?? null;
  if (parent === null) return { motif: 'Le dossier qui contient « Base de données locative » n’a pas pu être lu sur le Drive.' };
  if (chaine.some((m) => porteLeNomProtege(m.nom))) return { motif: refusEcritureArbre(chaine, r) ?? 'Emplacement refusé.' };
  const voisins = await enfants(deps, jeton, parent);
  if (voisins === null) return { motif: 'Le Drive partagé « GESTION LOCATIVE » n’a pas pu être lu.' };
  const trouve = voisins.find((v) => v.cle === CLE_RACINE_LOCATION_SEULE);
  const cree = trouve !== undefined ? { id: trouve.id } : await creerDossierEtiquete(deps, jeton, { parentId: parent, nom: NOM_RACINE_LOCATION_SEULE, cle: CLE_RACINE_LOCATION_SEULE });
  if ('motif' in cree) return cree;
  await query(`INSERT INTO gestion_drive_racine (arbre, drive_id, parent_drive_id, nom, enregistre_par) VALUES ('location_seule', $1, $2, $3, $4)
               ON CONFLICT (arbre) DO NOTHING`, [cree.id, parent, NOM_RACINE_LOCATION_SEULE, auteur]);
  return { id: (await racinesConnues()).locationSeule ?? cree.id };
}

/**
 * ══ LA RACINE « Base de données location seule » AVANT SA PREMIÈRE CRÉATION (Arno, 22/10/2026, mise en production) ═════════════
 * Le DIAGNOSTIC lit le registre et le Drive (lectures seules : métadonnées et liste des dossiers voisins) et dit ce que la
 * création ferait. 🔴 Refus : « Documents clients scannés » dans la chaîne ; racine « Base de données locative » inconnue ;
 * un dossier du MÊME NOM sans l'étiquette de l'application existe déjà à côté (créé à la main ?) — on ne crée jamais un doublon.
 */
export type DiagnosticRacine =
  | { etat: 'deja'; racineId: string }
  | { etat: 'retrouvee' | 'a_creer'; locative: { id: string; nom: string }; parent: { id: string; nom: string | null }; chaine: string[]; retrouvee: string | null }
  | { etat: 'refus'; motif: string; chaine: string[] };

export async function diagnosticRacineLocationSeule(deps: DepsArbre = DEPS_PAR_DEFAUT): Promise<DiagnosticRacine> {
  const r = await racinesConnues();
  if (r.locationSeule !== null) return { etat: 'deja', racineId: r.locationSeule };
  if (r.locative === null) return { etat: 'refus', motif: 'La racine « Base de données locative » n’est pas connue du registre.', chaine: [] };
  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { etat: 'refus', motif: jeton.motif, chaine: [] };
  const maillons = await chaineParents(jeton, r.locative, { fetch: deps.fetch });
  const chaine = maillons.map((m) => m.nom);
  const parentId = maillons[0]?.parentId ?? null;
  if (parentId === null) return { etat: 'refus', motif: 'Le dossier qui contient « Base de données locative » n’a pas pu être lu sur le Drive.', chaine };
  if (maillons.some((m) => porteLeNomProtege(m.nom))) return { etat: 'refus', motif: refusEcritureArbre(maillons, r) ?? 'Emplacement refusé (« Documents clients scannés »).', chaine };
  const voisins = await enfants(deps, jeton, parentId);
  if (voisins === null) return { etat: 'refus', motif: 'Le Drive partagé « GESTION LOCATIVE » n’a pas pu être lu.', chaine };
  const etiquete = voisins.find((v) => v.cle === CLE_RACINE_LOCATION_SEULE);
  const homonyme = voisins.find((v) => v.cle !== CLE_RACINE_LOCATION_SEULE && v.nom.trim().toLowerCase() === NOM_RACINE_LOCATION_SEULE.toLowerCase());
  if (etiquete === undefined && homonyme !== undefined) {
    return { etat: 'refus', chaine, motif: `Un dossier « ${homonyme.nom} » existe déjà à côté (id ${homonyme.id}) sans l’étiquette de l’application : rien n’est créé (pas de doublon). À trancher à la main.` };
  }
  return { etat: etiquete === undefined ? 'a_creer' : 'retrouvee', locative: { id: r.locative, nom: maillons[0]?.nom ?? '?' },
    parent: { id: parentId, nom: maillons[1]?.nom ?? null }, chaine, retrouvee: etiquete?.id ?? null };
}

/** La création RÉELLE, seulement si le diagnostic l'autorise ; puis l'inscription au registre (`assurerRacineLocationSeule`). */
export async function creerRacineLocationSeule(auteur: string, deps: DepsArbre = DEPS_PAR_DEFAUT): Promise<{ ok: true; id: string; geste: 'deja' | 'retrouvee' | 'cree' } | { ok: false; motif: string }> {
  const d = await diagnosticRacineLocationSeule(deps);
  if (d.etat === 'refus') return { ok: false, motif: d.motif };
  if (d.etat === 'deja') return { ok: true, id: d.racineId, geste: 'deja' };
  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { ok: false, motif: jeton.motif };
  const x = await assurerRacineLocationSeule(deps, jeton, auteur);
  return 'motif' in x ? { ok: false, motif: x.motif } : { ok: true, id: x.id, geste: d.etat === 'retrouvee' ? 'retrouvee' : 'cree' };
}

/** Le lot de tête, tel que l'arborescence le nomme. */
async function lotArbo(teteId: number): Promise<(LotArbo & { proprietaireNom: string }) | null> {
  const { rows } = await query<{ id: string; wippimmo_id: string; proprietaire_id: string | null; adresse: string | null; code_postal: string | null; commune: string | null;
    nature: string | null; type_bien: string | null; categorie: string | null; porte: string | null; nom: string | null }>(
    `SELECT lo.id::text, lo.wippimmo_id, lo.proprietaire_id::text, lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien,
            ${(await colonneExisteMemo('gestion_annuaire_lot', 'categorie')) ? 'lo.categorie, lo.porte' : 'NULL::text AS categorie, NULL::text AS porte'},
            coalesce(p.nom_complet, p.nom) AS nom
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire p ON p.id = lo.proprietaire_id WHERE lo.id = $1`, [teteId]);
  const l = rows[0];
  if (l === undefined || l.proprietaire_id === null) return null;
  return { id: Number(l.id), wippimmo: l.wippimmo_id, proprietaireId: Number(l.proprietaire_id), adresse: l.adresse, codePostal: l.code_postal, commune: l.commune,
    nature: l.nature, typeBien: l.type_bien, categorie: l.categorie, porte: l.porte, inactif: false, annexeDetachee: false, proprietaireNom: l.nom ?? `Propriétaire ${l.proprietaire_id}` };
}

/** Le plan des dossiers manquants (N3 → N6) d'un bien à une place, et ce qui est déjà inscrit. */
async function planPour(l: LotArbo & { proprietaireNom: string }, place: PlaceDrive, parentN3: string | null, annee: number, annuels = true) {
  const pid = l.proprietaireId as number;
  const nomN4 = nomAdresse(l, null);
  // Le N3 de cette place : celui du registre (même déplacé entier, sa clé reste) ; sinon une clé LIBRE (405).
  const { rows: n3 } = await query<{ cle: string }>(
    `SELECT cle FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND proprietaire_id = $1 AND arbre = $2 AND branche IS NOT DISTINCT FROM $3
      ORDER BY id LIMIT 1`, [pid, place.arbre, place.branche]);
  const n3Cle = n3[0]?.cle ?? await cleLibre(cleN3(pid, place));
  const { rows: n4 } = await query<{ cle: string }>(
    `SELECT cle FROM gestion_drive_noeud WHERE sorte = 'adresse' AND proprietaire_id = $1 AND arbre = $2 AND branche IS NOT DISTINCT FROM $3
        AND lower(nom_a_la_creation) = lower($4) ORDER BY id LIMIT 1`, [pid, place.arbre, place.branche, nomN4]);
  const adresse = { cle: n4[0]?.cle ?? await cleLibre(cleN4(pid, place, nomN4)), nom: nomN4 };
  const t = l.id;
  const { rows: ex } = await query<{ cle: string; d: string }>(
    `SELECT cle, drive_id AS d FROM gestion_drive_noeud WHERE cle = ANY($1::text[]) OR cle LIKE $2 OR cle LIKE $3 OR cle LIKE $4`,
    [[n3Cle, adresse.cle, `b:${t}`], `r:${t}:%`, `pr:${t}:%`, `y:pr:${t}:%`]);
  const existants = new Map(ex.map((x) => [x.cle, x.d]));
  return { plan: planDossierBien({ place, annee, proprietaire: { id: pid, nom: l.proprietaireNom }, adresse, bien: { teteId: t, nom: nomBienArbo(l, []) }, parentN3, existants, n3Cle, annuels }), existants, adresse };
}

/** Exécute un plan de créations : garde sur chaque parent existant, reprise d'un dossier déjà étiqueté, inscription. */
async function executer(deps: DepsArbre, jeton: string, creations: readonly CreationNoeud[], existants: ReadonlyMap<string, string>, place: PlaceDrive,
  proprietaireId: number, racines: RacinesArbres, auteur: string): Promise<{ ok: true; idDe: Map<string, string>; crees: { cle: string; nom: string; driveId: string }[] } | { ok: false; motif: string }> {
  for (const parent of new Set(creations.flatMap((c) => ('driveId' in c.parent ? [c.parent.driveId] : [])))) {
    const refus = await refusPour(deps, jeton, parent, racines);
    if (refus !== null) return { ok: false, motif: refus };
  }
  const idDe = new Map(existants);
  const crees: { cle: string; nom: string; driveId: string }[] = [];
  for (const c of creations) {
    const parentId = 'driveId' in c.parent ? c.parent.driveId : idDe.get(c.parent.cle);
    if (parentId === undefined) return { ok: false, motif: `Parent introuvable pour « ${c.nom} ».` };
    if (porteLeNomProtege(c.nom)) return { ok: false, motif: `Nom refusé : « ${c.nom} ».` };
    const deja = await enfants(deps, jeton, parentId);
    if (deja === null) return { ok: false, motif: `Le dossier parent de « ${c.nom} » n’a pas pu être lu sur le Drive.` };
    const trouve = deja.find((d) => d.cle === c.cle);
    const cree = trouve !== undefined ? { id: trouve.id } : await creerDossierEtiquete(deps, jeton, { parentId, nom: c.nom, cle: c.cle });
    if ('motif' in cree) return { ok: false, motif: cree.motif };
    await query(
      `INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, arbre, proprietaire_id, lot_id, nom_a_la_creation, annee, enregistre_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (cle) DO NOTHING`,
      [c.cle, c.sorte, c.niveau, cree.id, parentId, place.branche, place.arbre, proprietaireId, c.lotId, c.nom, c.annee, auteur]);
    idDe.set(c.cle, cree.id);
    crees.push({ cle: c.cle, nom: c.nom, driveId: cree.id });
  }
  return { ok: true, idDe, crees };
}

/** Le parent d'un N3 neuf à cette place : le N2 de la branche, ou la racine « location seule » (assurée au besoin). */
async function parentN3Pour(deps: DepsArbre, jeton: string, place: PlaceDrive, r: Awaited<ReturnType<typeof racinesConnues>>, auteur: string): Promise<string | null | { motif: string }> {
  if (place.arbre === 'locative') return r.n2[place.branche ?? 'Actifs'];
  const ls = await assurerRacineLocationSeule(deps, jeton, auteur);
  return 'motif' in ls ? ls : ls.id;
}

/**
 * « NOUVEAU BIEN » (et « Créer le dossier ») : le dossier du bien dans l'arbre de son statut. Rejouée, elle ne crée rien de plus ;
 * un N5 déjà inscrit ailleurs est DÉPLACÉ (jamais doublé).
 */
export async function creerDossierDuBien(lotId: number, auteur: string, deps: DepsArbre = DEPS_PAR_DEFAUT): Promise<IssueDossierBien> {
  deps = deps ?? DEPS_PAR_DEFAUT;
  if (!(await arbreDisponible())) return { ok: false, motif: MOTIF_SANS_404 };
  const tete = await teteDuLot(lotId);
  const n5 = await n5DuBien(tete);
  if (n5 !== null) return deplacerDossierDuBien(lotId, auteur, deps);
  const etat = await etatDuLot(tete);
  if (etat === null) return { ok: false, motif: 'Ce bien n’existe pas.' };
  const l = await lotArbo(tete);
  if (l === null) return { ok: false, motif: 'Le bien n’a pas de propriétaire : son dossier Drive ne peut pas être placé.' };
  const place = placeDuStatut(etat.statut, etat.archive);
  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { ok: false, motif: jeton.motif };
  const r = await racinesConnues();
  const parentN3 = await parentN3Pour(deps, jeton, place, r, auteur);
  if (parentN3 !== null && typeof parentN3 === 'object') return { ok: false, motif: parentN3.motif };
  const racines = { locative: r.locative, locationSeule: place.arbre === 'location_seule' ? parentN3 : r.locationSeule };
  const { plan, existants } = await planPour(l, place, parentN3, (deps.maintenant?.() ?? new Date()).getFullYear(), dossiersAnnuelsActifs(etat.statut));
  if (!plan.ok) return { ok: false, motif: plan.motif };
  const x = await executer(deps, jeton, plan.creations, existants, place, l.proprietaireId as number, racines, auteur);
  if (!x.ok) return x;
  const n5Id = x.idDe.get(`b:${tete}`);
  if (n5Id === undefined) return { ok: false, motif: 'Le dossier du bien n’a pas été créé.' };
  // Le bouton « Dossier Drive ↗ » du bien (et de ses annexes rattachées) ouvre ce dossier — seulement s'ils n'en ont pas déjà un.
  if (await colonneExisteMemo('gestion_annuaire_lot', 'drive_dossier_id')) {
    await query(`UPDATE gestion_annuaire_lot SET drive_dossier_id = $2 WHERE drive_dossier_id IS NULL
                   AND (id = $1 OR id IN (SELECT annexe_id FROM gestion_lot_annexe WHERE parent_id = $1))`, [tete, n5Id]);
  }
  return { ok: true, driveId: n5Id, geste: 'cree', place, crees: x.crees };
}

/**
 * UNE TRANSITION (et « Déplacer maintenant ») : le N5 du bien rejoint l'arbre de son statut, ENTIER. Les N3 / N4 de la
 * destination sont créés au besoin. Sans N5 inscrit : il est créé à la bonne place.
 */
export async function deplacerDossierDuBien(lotId: number, auteur: string, deps: DepsArbre = DEPS_PAR_DEFAUT): Promise<IssueDossierBien> {
  deps = deps ?? DEPS_PAR_DEFAUT;
  if (!(await arbreDisponible())) return { ok: false, motif: MOTIF_SANS_404 };
  const tete = await teteDuLot(lotId);
  const n5 = await n5DuBien(tete);
  if (n5 === null) return creerDossierDuBien(lotId, auteur, deps);
  const etat = await etatDuLot(tete);
  if (etat === null) return { ok: false, motif: 'Ce bien n’existe pas.' };
  // « Gestion terminée » : le dossier RESTE à sa place (405) ; archivé : « Inactifs ».
  if (etatDossierBien(etat.statut, n5.place, etat.archive).etat === 'ok') return { ok: true, driveId: n5.driveId, geste: 'deja', place: n5.place, crees: [] };
  const place = placeDuStatut(etat.statut, etat.archive);
  const l = await lotArbo(n5.teteId);
  if (l === null) return { ok: false, motif: 'Le bien n’a pas de propriétaire : son dossier Drive ne peut pas être placé.' };
  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { ok: false, motif: jeton.motif };
  const r = await racinesConnues();
  const parentN3 = await parentN3Pour(deps, jeton, place, r, auteur);
  if (parentN3 !== null && typeof parentN3 === 'object') return { ok: false, motif: parentN3.motif };
  const racines = { locative: r.locative, locationSeule: place.arbre === 'location_seule' ? parentN3 : r.locationSeule };
  // 🔴 La SOURCE aussi passe le garde : le N5 inscrit est dans un des deux arbres, jamais sous « Documents clients scannés ».
  const refusSource = await refusPour(deps, jeton, n5.driveId, racines);
  if (refusSource !== null) return { ok: false, motif: refusSource };
  // Archivé : si TOUS les biens du propriétaire dans « Actifs » sont archivés, le PROPRIÉTAIRE ENTIER passe en « Inactifs ».
  if (place.arbre === 'locative' && place.branche === 'Inactifs' && r.n2.Inactifs !== null) {
    const entier = await proprietaireEntierVersInactifs(deps, jeton, n5, l.proprietaireId as number, r.n2.Inactifs, racines, auteur);
    if (entier !== null) return entier;
  }
  const { plan, existants, adresse } = await planPour({ ...l, id: n5.teteId }, place, parentN3, (deps.maintenant?.() ?? new Date()).getFullYear(), dossiersAnnuelsActifs(etat.statut));
  if (!plan.ok) return { ok: false, motif: plan.motif };
  // Seuls les N3 / N4 manquants : le N5 et son contenu VOYAGENT, ils ne se recréent pas.
  const x = await executer(deps, jeton, plan.creations.filter((c) => c.niveau <= 4), existants, place, l.proprietaireId as number, racines, auteur);
  if (!x.ok) return x;
  const n4 = x.idDe.get(adresse.cle);
  if (n4 === undefined) return { ok: false, motif: 'Le dossier de l’adresse n’a pas pu être placé.' };
  const refusDest = await refusPour(deps, jeton, n4, racines);
  if (refusDest !== null) return { ok: false, motif: refusDest };
  const m = await deplacerVers(jeton, { id: n5.driveId, parentOrigine: n5.parent, parentCible: n4 }, { fetch: deps.fetch });
  if (!m.ok) return { ok: false, motif: m.motif };
  // Le registre suit : le N5 change de parent ; lui et tout son contenu changent d'arbre / de branche (les identifiants restent).
  await query('UPDATE gestion_drive_noeud SET parent_drive_id = $2, arbre = $3, branche = $4 WHERE drive_id = $1', [n5.driveId, n4, place.arbre, place.branche]);
  await query(`UPDATE gestion_drive_noeud SET arbre = $2, branche = $3 WHERE lot_id = $1 AND niveau > 5
                 AND (arbre IS DISTINCT FROM $2 OR branche IS DISTINCT FROM $3)`, [n5.teteId, place.arbre, place.branche]);
  await query(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
               VALUES ('annuaire_lot', $1, 'drive_dossier_deplace', $2, $3, $4, $5)`,
    [n5.teteId, libellePlace(n5.place), libellePlace(place), `dossier Drive du bien déplacé entier (${n5.driveId})`, auteur]).catch(() => undefined);
  return { ok: true, driveId: n5.driveId, geste: 'deplace', place, crees: x.crees };
}

/**
 * Arno (21/10/2026, 405 — « règle existante ») : quand le bien archivé est le DERNIER bien actif de son propriétaire dans « Actifs »,
 * c'est le N3 ENTIER du propriétaire qui passe dans « Inactifs » (avec ses adresses, ses biens et tout leur contenu). `null` : la
 * règle ne s'applique pas (autres biens actifs, N3 déjà présent dans « Inactifs », N5 hors de ce N3) — le N5 voyage seul.
 */
async function proprietaireEntierVersInactifs(deps: DepsArbre, jeton: string, n5: N5Inscrit, proprietaireId: number, n2Inactifs: string,
  racines: RacinesArbres, auteur: string): Promise<IssueDossierBien | null> {
  const { rows: n3s } = await query<{ d: string; p: string; branche: string | null }>(
    `SELECT drive_id AS d, parent_drive_id AS p, branche FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND proprietaire_id = $1 AND arbre = 'locative'`, [proprietaireId]);
  const actif = n3s.filter((x) => x.branche === 'Actifs');
  if (actif.length !== 1 || n3s.some((x) => x.branche === 'Inactifs')) return null;
  const n3 = actif[0];
  const { rows: n4 } = await query<{ p: string }>('SELECT parent_drive_id AS p FROM gestion_drive_noeud WHERE drive_id = $1', [n5.parent]);
  if (n4[0]?.p !== n3.d) return null;
  const { rows: autres } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_drive_noeud x LEFT JOIN gestion_annuaire_lot lo ON lo.id = x.lot_id
      WHERE x.sorte = 'bien' AND x.proprietaire_id = $1 AND x.arbre = 'locative' AND x.branche = 'Actifs' AND x.drive_id <> $2
        AND NOT (lo.statut_bien = 'ancienne_gestion' AND lo.statut_archive_le IS NOT NULL)`, [proprietaireId, n5.driveId]);
  if ((autres[0]?.n ?? 1) > 0) return null;
  const refus = await refusPour(deps, jeton, n2Inactifs, racines) ?? await refusPour(deps, jeton, n3.d, racines);
  if (refus !== null) return { ok: false, motif: refus };
  const m = await deplacerVers(jeton, { id: n3.d, parentOrigine: n3.p, parentCible: n2Inactifs }, { fetch: deps.fetch });
  if (!m.ok) return { ok: false, motif: m.motif };
  await query(`UPDATE gestion_drive_noeud SET parent_drive_id = $2, branche = 'Inactifs' WHERE drive_id = $1`, [n3.d, n2Inactifs]);
  await query(`UPDATE gestion_drive_noeud SET branche = 'Inactifs' WHERE proprietaire_id = $1 AND arbre = 'locative' AND branche = 'Actifs'`, [proprietaireId]);
  await query(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
               VALUES ('annuaire_lot', $1, 'drive_dossier_deplace', $2, $3, $4, $5)`,
    [n5.teteId, 'Base de données locative › Actifs', 'Base de données locative › Inactifs', `dernier bien actif archivé : le dossier ENTIER du propriétaire passe dans « Inactifs » (${n3.d})`, auteur])
    .catch(() => undefined);
  return { ok: true, driveId: n5.driveId, geste: 'deplace', place: { arbre: 'locative', branche: 'Inactifs' }, crees: [] };
}

/**
 * LE RANGEMENT (script `ranger-dossiers-statut`) : chaque bien (hors annexe rattachée, qui suit son bien principal), son statut,
 * et la place de son N5 au registre. LECTURE SEULE. Sans la 404, tout le registre est dans l'arbre locatif (sa seule réalité).
 */
export async function biensARanger(): Promise<BienARanger[]> {
  const statut = await sqlStatutBien('lo');
  const avec404 = await arbreDisponible();
  const avecDossier = await colonneExisteMemo('gestion_annuaire_lot', 'drive_dossier_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const archive = await sqlArchiveBien('lo');
  const { rows } = await query<{ id: string; adresse: string | null; commune: string | null; statut: string; d: string | null; arbre: string | null; branche: string | null; a: string | null }>(
    `SELECT lo.id::text, lo.adresse, lo.commune, ${statut} AS statut, (${archive})::text AS a, n.drive_id AS d, ${avec404 ? 'n.arbre' : "CASE WHEN n.drive_id IS NULL THEN NULL ELSE 'locative' END"} AS arbre, n.branche
       FROM gestion_annuaire_lot lo
       LEFT JOIN LATERAL (SELECT x.drive_id, ${avec404 ? 'x.arbre' : 'NULL::text AS arbre'}, x.branche FROM gestion_drive_noeud x
                           WHERE x.sorte = 'bien' AND (x.lot_id = lo.id${avecDossier ? ' OR x.drive_id = lo.drive_dossier_id' : ''})
                           ORDER BY (x.lot_id = lo.id) DESC LIMIT 1) n ON true
      WHERE NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id${avecDetache ? ' AND lo.annexe_detachee_le IS NULL' : ''})
      ORDER BY lo.id`);
  return rows.filter((r) => estStatutBien(r.statut)).map((r) => ({
    lotId: Number(r.id), statut: r.statut as StatutBien, titre: [r.adresse, r.commune].filter((x) => x).join(', ') || `Bien ${r.id}`,
    archive: r.a !== null,
    n5DriveId: r.d, n5: r.d === null ? null : { arbre: (r.arbre ?? 'locative') as ArbreDrive, branche: (r.branche as PlaceDrive['branche']) ?? null },
  }));
}
