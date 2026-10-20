import { createHash } from 'node:crypto';
import { query } from '../db/client';
import { chaineParents, echapperQ, MIME_DOSSIER, motifHttp } from '../gestion/drive';
import { ETIQUETTE_ARBO, nomAdresse, nomBienArbo, normaliser, type LotArbo } from '../gestion/arborescenceDrive';
import { indexerMaillons, peutCreerDossier } from '../gestion/driveLectureFichier';
import { porteLeNomProtege } from '../gestion/driveGardeFou';
import { jetonAccesGestion, type EtatGoogle } from '../gestion/jetonAcces';
import { renommerFichierDrive } from '../gestion/renommageDrive';
import { colonneExisteMemo } from './sondeLocation';
import { cleLocatairesDuBien, nomDossierBail, planBrancheBail, type CreationBail } from './brancheBailDrive';

/**
 * ══ 🔴🔴 NOUVEAU LOCATAIRE — CRÉER LA BRANCHE « BAIL » SUR LE DRIVE (Arno, 20/10/2026). IMPUR (base + Drive). ═══════════════════
 *
 * Appelée APRÈS l'enregistrement réussi du locataire (jamais dans sa transaction) : un échec du Drive ne défait rien, la fiche
 * dit « Dossier Drive du bail à créer » et « Créer le dossier » rejoue. Idempotente : chaque dossier porte sa clé
 * (`svav_arbo`), retrouvée sous son parent avant toute création, et enregistrée dans `gestion_drive_noeud` (avec `bail_id`,
 * migration 394) ; une clé connue n'est jamais recréée.
 *
 * 🔴 GARDE-FOUS DRIVE : aucune écriture sous « Documents clients scannés » (vérifié sur la chaîne des parents par la règle
 * commune `peutCreerDossier`, avant la première création) ; on CRÉE des dossiers et on RENOMME le N7 de CE bail, rien
 * d'autre — ni suppression, ni corbeille, ni déplacement, ni copie. Lectures : métadonnées seulement (jamais `alt=media`).
 * 🔒 `fetch` et le jeton sont INJECTÉS : tout s'éprouve sans réseau. En recette, le `fetch` global est intercepté (les
 * écritures Drive ne partent pas, la fiche le dit).
 */
const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
const PARTAGES = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
export interface DepsBrancheBail { fetch: typeof fetch; jeton: () => Promise<EtatGoogle>; maintenant?: () => Date }
const DEPS_PAR_DEFAUT: DepsBrancheBail = { fetch: (...a) => fetch(...a), jeton: jetonAccesGestion };
export type IssueBrancheBail = { ok: true; driveId: string; nom: string; crees: { cle: string; nom: string; driveId: string }[] } | { ok: false; motif: string };

/** Arno (20/10/2026) : le dossier porte la date d'entrée — sans elle, il ne peut pas être nommé. */
export const MOTIF_SANS_DATE = 'La date d’entrée dans les lieux du bail manque : le dossier Drive du bail ne peut pas être nommé.';

export function brancheBailDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_drive_noeud', 'bail_id');
}

/**
 * Le dossier N7 d'un bail, s'il est enregistré : celui créé par « Nouveau locataire » (clé `bl:<bail>`), sinon celui de
 * l'arborescence d'origine (un bail existant : clé `l:<tête du bien>:<date d'entrée>`, même bien, même date). `ancien` = ce
 * dernier — il n'est jamais recréé ni renommé par ce lot (les baux existants ne sont pas traités).
 */
export async function dossierDuBail(bailId: number): Promise<{ driveId: string; ancien: boolean } | null> {
  if (!(await brancheBailDisponible())) return null;
  const { rows } = await query<{ d: string; ancien: boolean }>(
    `SELECT n.drive_id AS d, (n.cle <> $1) AS ancien FROM gestion_drive_noeud n
      WHERE n.cle = $1
         OR (n.sorte = 'bail' AND n.bail_id IS NULL AND n.bail_entree = (SELECT entree FROM gestion_bail WHERE id = $2)
             AND n.lot_id = (SELECT coalesce((SELECT b5.lot_id FROM gestion_drive_noeud b5 WHERE b5.sorte = 'bien'
                                               AND (b5.lot_id = g.lot_id OR b5.drive_id = lo.drive_dossier_id) ORDER BY (b5.lot_id = g.lot_id) DESC LIMIT 1), g.lot_id)
                               FROM gestion_bail g JOIN gestion_annuaire_lot lo ON lo.id = g.lot_id WHERE g.id = $2))
      ORDER BY (n.cle = $1) DESC LIMIT 1`, [`bl:${bailId}`, bailId]);
  return rows[0] === undefined ? null : { driveId: rows[0].d, ancien: rows[0].ancien };
}

/** Les noms de famille des colocataires du bail, dans l'ordre de saisie (jamais garants ni contacts). */
async function nomsDuBail(bailId: number): Promise<string[]> {
  const { rows } = await query<{ nom: string }>(
    `SELECT l.nom FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.bail_id = $1 GROUP BY l.id, l.nom ORDER BY min(o.id)`, [bailId]);
  return rows.map((r) => r.nom);
}

async function jetonOk(deps: DepsBrancheBail): Promise<string | { motif: string }> {
  const j = await deps.jeton().catch(() => ({ etat: 'expire' as const, motif: 'Google n’a pas répondu.' }));
  return j.etat === 'ok' ? j.jeton : { motif: `Drive indisponible : ${j.motif}` };
}

async function lireJson<T>(deps: DepsBrancheBail, jeton: string, url: string): Promise<T | null> {
  const r = await deps.fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
  return r.ok ? (await r.json().catch(() => null)) as T | null : null;
}

/** Les dossiers enfants d'un dossier (nom, clé). Métadonnées seulement. */
async function enfants(deps: DepsBrancheBail, jeton: string, parentId: string): Promise<{ id: string; nom: string; cle: string | null }[] | null> {
  const q = `'${echapperQ(parentId)}' in parents and trashed = false and mimeType = '${MIME_DOSSIER}'`;
  const j = await lireJson<{ files?: { id: string; name: string; appProperties?: Record<string, string> }[] }>(deps, jeton,
    `${API_FICHIERS}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,appProperties)')}&pageSize=1000&${PARTAGES}`);
  return j === null ? null : (j.files ?? []).map((f) => ({ id: f.id, nom: f.name, cle: f.appProperties?.[ETIQUETTE_ARBO] ?? null }));
}

/** Créer UN dossier étiqueté (sa clé), sous un parent. La seule écriture de création de ce module. */
async function creerDossierEtiquete(deps: DepsBrancheBail, jeton: string, o: { parentId: string; nom: string; cle: string }): Promise<{ id: string } | { motif: string }> {
  const r = await deps.fetch(`${API_FICHIERS}?fields=id%2Cname&${PARTAGES}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: o.nom, mimeType: MIME_DOSSIER, parents: [o.parentId], appProperties: { [ETIQUETTE_ARBO]: o.cle } }),
  });
  if (!r.ok) return { motif: motifHttp(r.status, `la création du dossier « ${o.nom} »`) };
  const j = (await r.json().catch(() => ({}))) as { id?: string };
  return typeof j.id === 'string' && j.id !== '' ? { id: j.id } : { motif: 'Google n’a pas rendu d’identifiant pour ce dossier.' };
}

/** Le refus de créer sous un dossier : la règle commune (« Documents clients scannés », à toute profondeur). */
async function refusDeCreer(deps: DepsBrancheBail, jeton: string, parentId: string): Promise<string | null> {
  const chaine = await chaineParents(jeton, parentId, { fetch: deps.fetch });
  const v = peutCreerDossier(parentId, indexerMaillons(chaine));
  return v.creer ? null : v.motif;
}

/**
 * CRÉER LA BRANCHE DU BAIL (et ses parents manquants). Rejouée, elle ne crée rien de plus ; le N7 existant n'est pas renommé
 * ici (voir `renommerBrancheBail`).
 */
export async function creerBrancheBail(bailId: number, auteur: string, deps: DepsBrancheBail = DEPS_PAR_DEFAUT): Promise<IssueBrancheBail> {
  deps = deps ?? DEPS_PAR_DEFAUT;
  if (!(await brancheBailDisponible())) return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 394) : la branche du bail n’est pas encore créée sur le Drive.' };
  // Un bail EXISTANT de l'arborescence d'origine a déjà son dossier : rien n'est créé (les baux existants ne sont pas traités).
  const deja = await dossierDuBail(bailId);
  if (deja !== null && deja.ancien) return { ok: true, driveId: deja.driveId, nom: '', crees: [] };
  const { rows: b } = await query<{ lot_id: string; entree: string | null }>('SELECT lot_id::text, entree::text FROM gestion_bail WHERE id = $1', [bailId]);
  if (b[0] === undefined) return { ok: false, motif: 'Ce bail n’existe plus.' };
  const lotId = Number(b[0].lot_id);
  if (b[0].entree === null) return { ok: false, motif: MOTIF_SANS_DATE };
  // Le bien du Drive : le N5 du lot (son dossier attitré, ou celui dont il est la tête) ; sa tête porte les clés du bien.
  const { rows: n5 } = await query<{ cle: string; lot_id: string; parent: string; branche: string }>(
    `SELECT n.cle, n.lot_id::text, n.parent_drive_id AS parent, n.branche FROM gestion_drive_noeud n
      WHERE n.sorte = 'bien' AND (n.lot_id = $1 OR n.drive_id = (SELECT drive_dossier_id FROM gestion_annuaire_lot WHERE id = $1))
      ORDER BY (n.lot_id = $1) DESC LIMIT 1`, [lotId]);
  const teteId = n5[0] === undefined ? lotId : Number(n5[0].lot_id);
  const { rows: lot } = await query<LotArbo & { proprietaire_nom: string | null; code_postal: string | null; type_bien: string | null; wippimmo_id: string }>(
    `SELECT lo.id, lo.wippimmo_id, lo.proprietaire_id AS "proprietaireId", lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien,
            lo.categorie, lo.porte, coalesce(p.nom_complet, p.nom) AS proprietaire_nom
       FROM gestion_annuaire_lot lo LEFT JOIN gestion_annuaire_proprietaire p ON p.id = lo.proprietaire_id WHERE lo.id = $1`, [teteId]);
  const l = lot[0];
  if (l === undefined || l.proprietaireId === null) return { ok: false, motif: 'Le bien n’a pas de propriétaire : sa branche Drive ne peut pas être placée.' };
  const proprietaireId = Number(l.proprietaireId);
  const lotArbo: LotArbo = { id: teteId, wippimmo: l.wippimmo_id, proprietaireId, adresse: l.adresse, codePostal: l.code_postal, commune: l.commune,
    nature: l.nature, typeBien: l.type_bien, categorie: l.categorie, porte: l.porte, inactif: false, annexeDetachee: false };
  // Le N4 : celui du N5 s'il existe ; sinon un N4 du propriétaire au même nom ; sinon une clé neuve.
  const nomN4 = nomAdresse(lotArbo, null);
  const { rows: n4 } = await query<{ cle: string }>(
    n5[0] !== undefined
      ? `SELECT cle FROM gestion_drive_noeud WHERE drive_id = $1`
      : `SELECT cle FROM gestion_drive_noeud WHERE sorte = 'adresse' AND proprietaire_id = $1 AND branche = 'Actifs' AND lower(nom_a_la_creation) = lower($2) LIMIT 1`,
    n5[0] !== undefined ? [n5[0].parent] : [proprietaireId, nomN4]);
  const cleN4 = n4[0]?.cle ?? `a:${proprietaireId}:A:${createHash('sha256').update(`txt:${normaliser(nomN4)}`).digest('hex').slice(0, 12)}`;
  const annee = (deps.maintenant?.() ?? new Date()).getFullYear();
  const entree = b[0].entree;
  const { rows: ex } = await query<{ cle: string; drive_id: string; branche: string }>(
    `SELECT cle, drive_id, branche FROM gestion_drive_noeud WHERE cle = ANY($1::text[]) OR cle LIKE $2 OR cle LIKE $3 OR bail_id = $4`,
    [[`p:${proprietaireId}:A`, cleN4, `b:${teteId}`, `pr:${teteId}:0`, `pr:${teteId}:1`, `y:pr:${teteId}:0:${annee}`, `y:pr:${teteId}:1:${annee}`],
      `r:${teteId}:%`, `%bl:${bailId}%`, bailId]);
  const existants = new Map(ex.map((x) => [x.cle, x.drive_id]));
  const branche = ex.find((x) => x.cle === `b:${teteId}`)?.branche ?? 'Actifs';
  const { rows: n2 } = await query<{ d: string }>(
    `SELECT parent_drive_id AS d FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND branche = 'Actifs' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`);

  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { ok: false, motif: jeton.motif };
  // Le nom du N7 : ses voisins dans « 6 Locataires » (s'il existe déjà), hors le dossier de CE bail.
  const n6 = existants.get(cleLocatairesDuBien(teteId));
  const voisins = n6 === undefined ? [] : await enfants(deps, jeton, n6);
  if (voisins === null) return { ok: false, motif: 'Le dossier « 6 Locataires » du bien n’a pas pu être lu sur le Drive.' };
  const nomN7 = nomDossierBail(await nomsDuBail(bailId), entree, voisins.filter((v) => v.cle !== `bl:${bailId}`).map((v) => v.nom));
  if (nomN7 === null) return { ok: false, motif: MOTIF_SANS_DATE };
  const plan = planBrancheBail({
    bailId, annee, entree, nomN7, proprietaire: { id: proprietaireId, nom: l.proprietaire_nom ?? `Propriétaire ${proprietaireId}` },
    bien: { teteId, nom: nomBienArbo(lotArbo, []) }, adresse: { cle: cleN4, nom: nomN4 }, n2: n2[0]?.d ?? null, existants,
  });
  if (!plan.ok) return { ok: false, motif: plan.motif };

  // 🔴 LE GARDE-FOU, AVANT LA PREMIÈRE CRÉATION : chaque parent déjà existant est hors de « Documents clients scannés ».
  for (const parent of new Set(plan.creations.flatMap((c) => ('driveId' in c.parent ? [c.parent.driveId] : [])))) {
    const refus = await refusDeCreer(deps, jeton, parent);
    if (refus !== null) return { ok: false, motif: refus };
  }
  const crees: { cle: string; nom: string; driveId: string }[] = [];
  const idDe = new Map(existants);
  for (const c of plan.creations) {
    const parentId = 'driveId' in c.parent ? c.parent.driveId : idDe.get(c.parent.cle);
    if (parentId === undefined) return { ok: false, motif: `Parent introuvable pour « ${c.nom} ».` };
    if (porteLeNomProtege(c.nom)) return { ok: false, motif: `Nom refusé : « ${c.nom} ».` };
    // Idempotence côté Drive : un dossier portant déjà cette clé sous ce parent est repris, jamais doublé.
    const deja = await enfants(deps, jeton, parentId);
    if (deja === null) return { ok: false, motif: `Le dossier parent de « ${c.nom} » n’a pas pu être lu sur le Drive.` };
    const trouve = deja.find((d) => d.cle === c.cle);
    const cree = trouve !== undefined ? { id: trouve.id } : await creerDossierEtiquete(deps, jeton, { parentId, nom: c.nom, cle: c.cle });
    if ('motif' in cree) return { ok: false, motif: cree.motif };
    await enregistrer(c, cree.id, parentId, branche, proprietaireId, auteur);
    idDe.set(c.cle, cree.id);
    crees.push({ cle: c.cle, nom: c.nom, driveId: cree.id });
  }
  const n7 = idDe.get(`bl:${bailId}`);
  return n7 === undefined ? { ok: false, motif: 'Le dossier du bail n’a pas été créé.' } : { ok: true, driveId: n7, nom: nomN7, crees };
}

async function enregistrer(c: CreationBail, driveId: string, parentId: string, branche: string, proprietaireId: number, auteur: string): Promise<void> {
  await query(
    `INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, proprietaire_id, lot_id, nom_a_la_creation,
       annee, bail_entree, enregistre_par, bail_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13) ON CONFLICT (cle) DO NOTHING`,
    [c.cle, c.sorte, c.niveau, driveId, parentId, branche, proprietaireId, c.lotId, c.nom, c.annee, c.bailEntree, auteur, c.bailId]);
}

/**
 * « AJOUTER UN OCCUPANT » : le N7 de CE bail prend le nom de tous ses colocataires. Seul ce dossier est renommé (son
 * identifiant vient de `gestion_drive_noeud`, clé `bl:<bail>`), et seulement si son nom change. Sans dossier : rien.
 */
export async function renommerBrancheBail(bailId: number, deps: DepsBrancheBail = DEPS_PAR_DEFAUT): Promise<{ ok: true; nom: string | null } | { ok: false; motif: string }> {
  deps = deps ?? DEPS_PAR_DEFAUT;
  const d = await dossierDuBail(bailId);
  if (d === null || d.ancien) return { ok: true, nom: null };   // jamais un dossier de l'arborescence d'origine
  const { rows } = await query<{ parent: string; entree: string | null }>(
    `SELECT n.parent_drive_id AS parent, b.entree::text AS entree FROM gestion_drive_noeud n JOIN gestion_bail b ON b.id = $2 WHERE n.cle = $1`, [`bl:${bailId}`, bailId]);
  const jeton = await jetonOk(deps);
  if (typeof jeton !== 'string') return { ok: false, motif: jeton.motif };
  const voisins = rows[0] === undefined ? [] : await enfants(deps, jeton, rows[0].parent);
  if (voisins === null) return { ok: false, motif: 'Le dossier « 6 Locataires » n’a pas pu être lu sur le Drive.' };
  const actuel = voisins.find((v) => v.id === d.driveId);
  // Le nom entier est recalculé : un occupant de plus garde la date ; une date d'entrée changée renomme avec la nouvelle.
  const nom = nomDossierBail(await nomsDuBail(bailId), rows[0]?.entree ?? null, voisins.filter((v) => v.id !== d.driveId).map((v) => v.nom));
  if (nom === null) return { ok: true, nom: null };
  if (actuel !== undefined && actuel.nom === nom) return { ok: true, nom };
  if (porteLeNomProtege(nom)) return { ok: false, motif: `Nom refusé : « ${nom} ».` };
  const refus = await refusDeCreer(deps, jeton, d.driveId);
  if (refus !== null) return { ok: false, motif: refus };
  const r = await renommerFichierDrive({ accessToken: jeton, driveFileId: d.driveId, nom }, { fetch: deps.fetch });
  return r.ok ? { ok: true, nom } : { ok: false, motif: r.motif };
}
