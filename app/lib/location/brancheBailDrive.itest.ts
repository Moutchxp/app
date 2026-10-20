/**
 * ══ 🔴🔴 NOUVEAU LOCATAIRE — LA BRANCHE « BAIL » DU DRIVE (Arno, 20/10/2026, migration 394), SUR UNE COPIE DE LA RECETTE ═════
 *
 *   ① BIEN OBLIGATOIRE : sans bien, aucun enregistrement ;
 *   ② CRÉATION COMPLÈTE au nouveau locataire : N7 « BAIL MARTIN » sous « 6 Locataires » › N8 → N10, chaque dossier enregistré
 *      dans `gestion_drive_noeud`, rattaché au bail (`bail_id`) ; ③ IDEMPOTENCE (rejouée : aucune création) ;
 *   ④ DEUX COLOCATAIRES (« BAIL YOUENOU – TALHOUARN ») ; ⑤ DOUBLON DE NOM (l'année d'entrée s'ajoute) ;
 *   ⑥ « AJOUTER UN OCCUPANT » RENOMME le N7 de CE bail (et rien d'autre) ;
 *   ⑦ DRIVE EN ÉCHEC (l'interception de la recette : écriture refusée 403) : le locataire reste enregistré, la fiche dit « à
 *      créer » ; « Créer le dossier » relance et réussit ;
 *   ⑧ 🔴 « DOCUMENTS CLIENTS SCANNÉS » : aucune écriture sous ce dossier, zéro appel d'écriture ;
 *   ⑨ PARENTS MANQUANTS (propriétaire sans dossier) : N3 → N6 d'abord, selon le modèle ;
 *   ⑩ L'ESSAI « ESSAI BAIL DRIVE », rejoué : la liste des dossiers créés.
 *
 * 🔒 LE DRIVE EST UN FAUX, EN MÉMOIRE (aucun appel réseau : le `fetch` global REFUSE tout appel Google pendant l'épreuve) ;
 *    il est amorcé avec les dossiers du registre de la recette, et il enregistre chaque appel (méthode, adresse, corps).
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE (`essaiAnnule.ts`) ; la 394 y est appliquée puis annulée.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_test…`, copie de la recette AVEC la 393 et SANS la 394 :
 *   createdb svav_test_bail394 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_bail394
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_bail394 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/brancheBailDrive.itest.ts
 */
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { ajouterOccupant } from '../gestion/annuaireEditionRepo';
import { decisionRecette } from '../recette/interception';
import { creerLocatairesSurBienAvec } from './portefeuilleRepo';
import { creerBrancheBail, renommerBrancheBail, type DepsBrancheBail } from './brancheBailDriveRepo';
import { dossierDuBailDuLocataire, resumeBailDuLocataire } from './resumeBailRepo';
import { oublierSchemaLocation } from './sondeLocation';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest branche bail 394' };
const S = `d${Date.now().toString(36)}`;
const MAINTENANT = new Date('2026-10-20T12:00:00+02:00');
const ENTREE = '2026-11-01';
/** La liste des dossiers créés, écrite pour le compte rendu si `SORTIE_ESSAI` désigne un fichier (sous `.captures/`). */
const noter = (titre: string, lignes: string[]): void => {
  const f = process.env.SORTIE_ESSAI;
  if (f !== undefined && f !== '') appendFileSync(f, `${titre}\n  ${lignes.join('\n  ')}\n\n`);
};

/* ── LE FAUX DRIVE ─────────────────────────────────────────────────────────────────────────────────────────────────── */
interface Dossier { id: string; name: string; parents: string[]; appProperties?: Record<string, string> }
interface Appel { methode: string; url: string; corps: Record<string, unknown> | null; refuse: boolean }
const dossiers = new Map<string, Dossier>();
let appels: Appel[] = [];
/** TOUS les appels de l'épreuve (jamais remis à zéro). */
const tous: Appel[] = [];
let suivant = 0;
/** `ouvert` : le Drive accepte ; `recette` : les écritures passent par l'interception de la recette (refusées 403). */
let mode: 'ouvert' | 'recette' = 'ouvert';
const json = (statut: number, corps: unknown) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

const fauxFetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const url = String(entree);
  const methode = (init?.method ?? 'GET').toUpperCase();
  const corps = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
  const decision = mode === 'recette' ? decisionRecette(url, methode, `t${appels.length}`) : { action: 'laisser' as const };
  appels.push({ methode, url, corps, refuse: decision.action === 'refuser' });
  tous.push(appels[appels.length - 1]);
  if (decision.action === 'refuser') return json(decision.statut, decision.corps);
  const u = new URL(url);
  if (!u.pathname.startsWith('/drive/v3/files')) return json(404, {});
  const id = decodeURIComponent(u.pathname.split('/')[4] ?? '');
  if (methode === 'GET' && id === '') {
    const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q') ?? '')?.[1] ?? '';
    return json(200, { files: [...dossiers.values()].filter((d) => d.parents[0] === parent).map((d) => ({ id: d.id, name: d.name, appProperties: d.appProperties })) });
  }
  if (methode === 'GET') {
    const d = dossiers.get(id);
    return d === undefined ? json(404, {}) : json(200, { id: d.id, name: d.name, parents: d.parents, mimeType: 'application/vnd.google-apps.folder', trashed: false });
  }
  if (methode === 'POST' && id === '') {
    const neuf: Dossier = { id: `F${++suivant}`, name: String(corps?.name), parents: corps?.parents as string[], appProperties: corps?.appProperties as Record<string, string> };
    dossiers.set(neuf.id, neuf);
    return json(200, { id: neuf.id, name: neuf.name });
  }
  if (methode === 'PATCH' && id !== '') {
    const d = dossiers.get(id);
    if (d === undefined) return json(404, {});
    d.name = String(corps?.name);
    return json(200, { id: d.id, name: d.name });
  }
  return json(400, {});
}) as typeof fetch;
const DEPS: DepsBrancheBail = { fetch: fauxFetch, jeton: async () => ({ etat: 'ok', jeton: 'faux-jeton' }), maintenant: () => MAINTENANT };

const ecritures = () => appels.filter((a) => a.methode !== 'GET');
const creations = () => appels.filter((a) => a.methode === 'POST');
/** « N<niveau> nom ← nom du parent » pour chaque création, dans l'ordre. */
const arbre = (avant: Map<string, Dossier>) => creations().map((a) => {
  const p = (a.corps?.parents as string[])[0];
  return `${a.corps?.name} ← ${dossiers.get(p)?.name ?? avant.get(p)?.name ?? p}`;
});

/* ── LA BASE ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
const un = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T> => (await query<T>(sql, p)).rows[0];
const carte = (nom: string, prenom: string, n: number) => ({ nom, prenom, coordonnees: [
  { sorte: 'telephone' as const, valeur: `06 41 51 62 ${String(n).padStart(2, '0')}`, libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase().replace(/\s+/g, '.')}.${n}.${S}@exemple.test`, libelle: 'E-mail' }] });
const oublier = (): void => { oublierSchemaLocation(); oublierSchema(); };
type Issue = Awaited<ReturnType<typeof creerLocatairesSurBienAvec>>;
const creer = async (lotId: number | null, cartes: ReturnType<typeof carte>[]): Promise<Issue> =>
  creerLocatairesSurBienAvec({ cartes, existants: [], contacts: [], lotId, entree: ENTREE }, AUTEUR, DEPS);
const bailDe = async (locataireId: number): Promise<number> =>
  Number((await un<{ b: string }>('SELECT bail_id::text AS b FROM gestion_annuaire_occupation WHERE locataire_id = $1 ORDER BY id DESC LIMIT 1', [locataireId])).b);
const idsDe = (i: Issue): number[] => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return (i.data as { locataireIds: number[] }).locataireIds; };
const driveDe = (i: Issue) => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return (i.data as { drive?: unknown }).drive; };
const MODELE_BAIL = (n7: string, annee = '2026') => [
  `${n7} ← 6 Locataires`,
  `1 Papiers d’identité ← ${n7}`, `2 Profil financier ← ${n7}`, `3 Garants ← ${n7}`, `4 GLI ← ${n7}`, `5 Assurances ← ${n7}`,
  'Assurance habitation ← 5 Assurances', `${annee} ← Assurance habitation`, `6 Entretien ← ${n7}`, 'Chaudière ← 6 Entretien', `${annee} ← Chaudière`,
];

let essai: EssaiAnnule | null = null;
const fetchGlobal = globalThis.fetch;
beforeAll(async () => {
  if (!baseEssai) return;
  // 🔒 Aucun appel réseau vers Google pendant l'épreuve : un oubli d'injection échouerait ici, jamais sur le vrai Drive.
  globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => {
    if (/googleapis\.com/.test(String(u))) throw new Error(`appel Google interdit pendant l'épreuve : ${String(u)}`);
    return fetchGlobal(u, i);
  }) as typeof fetch;
  essai = await ouvrirEssaiAnnule();
});
afterAll(async () => { globalThis.fetch = fetchGlobal; if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 394 — la branche « BAIL » créée sur le Drive au nouveau locataire', () => {
  it('⓪ la base est la recette AVEC la 393, SANS la 394 ; la 394 appliquée dans la transaction ; le faux Drive amorcé du registre', async () => {
    expect((await un<{ t: string | null }>(`SELECT to_regclass('gestion_bail')::text AS t`)).t).toBe('gestion_bail');
    expect((await un<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'gestion_drive_noeud' AND column_name = 'bail_id'`)).n).toBe(0);
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/394_location_bail_drive.sql'), 'utf8'));
    oublier();
    const { rows } = await query<{ cle: string; drive_id: string; parent: string; nom: string }>(
      'SELECT cle, drive_id, parent_drive_id AS parent, nom_a_la_creation AS nom FROM gestion_drive_noeud');
    for (const r of rows) dossiers.set(r.drive_id, { id: r.drive_id, name: r.nom, parents: [r.parent], appProperties: { svav_arbo: r.cle } });
    const n2 = (await un<{ d: string }>(`SELECT parent_drive_id AS d FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND branche = 'Actifs' GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`)).d;
    dossiers.set(n2, { id: n2, name: 'Actifs', parents: ['N1'] });
    dossiers.set('N1', { id: 'N1', name: 'Base de données locative', parents: [] });
    expect(dossiers.size).toBeGreaterThan(10000);
  });

  it('① BIEN OBLIGATOIRE : sans bien, refusé, rien n’est écrit ni sur la base ni sur le Drive', async () => {
    appels = [];
    expect(await creer(null, [carte('SANSBIEN', 'Paul', 1)])).toEqual({ etat: 'refus', motif: 'Choisissez le bien loué.' });
    expect(appels).toEqual([]);
  });

  let martin = 0;
  let bailMartin = 0;
  let n7Martin = '';
  it('② CRÉATION COMPLÈTE : « BAIL MARTIN » sous « 6 Locataires » du lot 6, N8 → N10 selon le modèle, chaque dossier rattaché au bail', async () => {
    appels = [];
    const avant = new Map(dossiers);
    const i = await creer(6, [carte('Martin', 'Paul', 2)]);
    martin = idsDe(i)[0];
    bailMartin = await bailDe(martin);
    expect(arbre(avant)).toEqual(MODELE_BAIL('BAIL MARTIN'));
    // Sous LE « 6 Locataires » du bien (r:6:6), étiqueté de sa clé.
    const n6 = (await un<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_noeud WHERE cle = 'r:6:6'`)).d;
    expect(creations()[0].corps).toMatchObject({ name: 'BAIL MARTIN', parents: [n6], appProperties: { svav_arbo: `bl:${bailMartin}` }, mimeType: 'application/vnd.google-apps.folder' });
    const drive = driveDe(i) as { ok: boolean; driveId: string; nom: string };
    expect(drive).toMatchObject({ ok: true, nom: 'BAIL MARTIN' });
    n7Martin = drive.driveId;
    // Le registre : 11 dossiers, tous de CE bail, au bon niveau.
    const { rows } = await query<{ cle: string; sorte: string; niveau: number; nom: string; bail: string; lot: string }>(
      `SELECT cle, sorte, niveau, nom_a_la_creation AS nom, bail_id::text AS bail, lot_id::text AS lot FROM gestion_drive_noeud WHERE bail_id = $1 ORDER BY id`, [bailMartin]);
    expect(rows.map((r) => `${r.niveau} ${r.sorte} ${r.nom}`)).toEqual([
      '7 bail BAIL MARTIN', '8 piece_bail 1 Papiers d’identité', '8 piece_bail 2 Profil financier', '8 piece_bail 3 Garants', '8 piece_bail 4 GLI',
      '8 piece_bail 5 Assurances', '9 sous_piece_bail Assurance habitation', '10 annee 2026', '8 piece_bail 6 Entretien', '9 sous_piece_bail Chaudière', '10 annee 2026']);
    expect(rows.every((r) => r.lot === '6')).toBe(true);
    // Aucune autre écriture que des créations.
    expect(ecritures().every((a) => a.methode === 'POST')).toBe(true);
    // La fiche locataire : le dossier est créé, le bouton l'ouvre.
    expect((await resumeBailDuLocataire(martin)).drive).toEqual({ etat: 'cree', driveId: n7Martin });
    expect(await dossierDuBailDuLocataire(martin)).toMatchObject({ driveId: n7Martin });
  });

  it('③ IDEMPOTENCE : rejouée (« Créer le dossier » cliqué deux fois), aucune création ; même un registre perdu ne double rien sur le Drive', async () => {
    appels = [];
    const r = await creerBrancheBail(bailMartin, AUTEUR.libelle, DEPS);
    expect(r).toMatchObject({ ok: true, driveId: n7Martin, crees: [] });
    expect(ecritures()).toEqual([]);
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_drive_noeud WHERE bail_id = $1', [bailMartin])).n).toBe(11);
  });

  it('④ DEUX COLOCATAIRES (lot 42, qui a déjà d’anciens baux) : « BAIL YOUENOU – TALHOUARN », dans l’ordre de saisie', async () => {
    appels = [];
    const avant = new Map(dossiers);
    const i = await creer(42, [carte('Youenou', 'Anne', 3), carte('Talhouarn', 'Yann', 4)]);
    expect(driveDe(i)).toMatchObject({ ok: true, nom: 'BAIL YOUENOU – TALHOUARN' });
    expect(arbre(avant)).toEqual(MODELE_BAIL('BAIL YOUENOU – TALHOUARN'));
  });

  it('⑤ DOUBLON DE NOM : un « Bail Durand » déjà dans ce « 6 Locataires » (lot 80) → « BAIL DURAND 2026 »', async () => {
    const n6 = (await un<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_noeud WHERE cle = 'r:80:6'`)).d;
    dossiers.set('ANCIEN-DURAND', { id: 'ANCIEN-DURAND', name: 'Bail Durand', parents: [n6] });
    appels = [];
    const i = await creer(80, [carte('Durand', 'Léa', 5)]);
    expect(driveDe(i)).toMatchObject({ ok: true, nom: 'BAIL DURAND 2026' });
    expect(creations()[0].corps?.name).toBe('BAIL DURAND 2026');
    expect(dossiers.get('ANCIEN-DURAND')?.name).toBe('Bail Durand');
  });

  it('⑥ « AJOUTER UN OCCUPANT » : le N7 de CE bail est renommé « BAIL MARTIN – OCCUPANT » ; un seul renommage, rien d’autre', async () => {
    const autre = idsDe(await creer(28, [carte('Occupant', 'Zoé', 6)]))[0];
    appels = [];
    const avantNoms = new Map([...dossiers].map(([k, d]) => [k, d.name]));
    expect((await ajouterOccupant(6, autre, ENTREE, AUTEUR, null, DEPS)).etat).toBe('ok');
    expect(await bailDe(autre)).toBe(bailMartin);
    const patchs = ecritures();
    expect(patchs.map((a) => `${a.methode} ${new URL(a.url).pathname.split('/').pop()} ${JSON.stringify(a.corps)}`))
      .toEqual([`PATCH ${n7Martin} {"name":"BAIL MARTIN – OCCUPANT"}`]);
    expect([...dossiers].filter(([k, d]) => avantNoms.get(k) !== d.name).map(([k]) => k)).toEqual([n7Martin]);
    // Rejoué : le nom est déjà le bon, aucun appel d'écriture.
    appels = [];
    expect(await renommerBrancheBail(bailMartin, DEPS)).toEqual({ ok: true, nom: 'BAIL MARTIN – OCCUPANT' });
    expect(ecritures()).toEqual([]);
  });

  it('⑦ DRIVE EN ÉCHEC (interception de la recette, 403) : le locataire reste enregistré, « à créer » ; « Créer le dossier » relance et réussit', async () => {
    mode = 'recette';
    appels = [];
    const i = await creer(83, [carte('Echec', 'Max', 7)]);
    mode = 'ouvert';
    const loc = idsDe(i)[0];
    expect(driveDe(i)).toMatchObject({ ok: false });
    // L'interception : UNE écriture tentée (le N7), refusée — rien d'autre n'est parti.
    expect(ecritures().map((a) => `${a.methode} ${a.refuse ? 'refusée' : 'passée'} ${a.corps?.name}`)).toEqual(['POST refusée BAIL ECHEC']);
    const bail = await bailDe(loc);
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_annuaire_occupation WHERE locataire_id = $1', [loc])).n).toBe(1);
    expect((await un<{ n: number }>('SELECT count(*)::int AS n FROM gestion_drive_noeud WHERE bail_id = $1', [bail])).n).toBe(0);
    expect((await resumeBailDuLocataire(loc)).drive).toEqual({ etat: 'a_creer' });
    expect(await dossierDuBailDuLocataire(loc)).toBeNull();
    // « Créer le dossier » (la route appelle creerBrancheBail pour ce bail).
    appels = [];
    const avant = new Map(dossiers);
    const r = await creerBrancheBail(bail, AUTEUR.libelle, DEPS);
    expect(r).toMatchObject({ ok: true, nom: 'BAIL ECHEC' });
    expect(arbre(avant)).toEqual(MODELE_BAIL('BAIL ECHEC'));
    expect((await resumeBailDuLocataire(loc)).drive).toMatchObject({ etat: 'cree' });
  });

  it('⑧ 🔴 « DOCUMENTS CLIENTS SCANNÉS » : un bien rangé dessous → refus, ZÉRO écriture ; le locataire reste enregistré', async () => {
    // Le dossier du bien 94 placé (dans le faux Drive seulement) sous « Documents clients scannés › 1 actifs ».
    const n4 = (await un<{ d: string }>(`SELECT parent_drive_id AS d FROM gestion_drive_noeud WHERE cle = 'b:94'`)).d;
    dossiers.set('DCS', { id: 'DCS', name: 'Documents clients scannés', parents: ['N1'] });
    dossiers.set('DCS-1', { id: 'DCS-1', name: '1 actifs', parents: ['DCS'] });
    const d4 = dossiers.get(n4)!;
    const parentAvant = d4.parents;
    d4.parents = ['DCS-1'];
    appels = [];
    const i = await creer(94, [carte('Scanne', 'Eve', 8)]);
    const loc = idsDe(i)[0];
    expect(driveDe(i)).toMatchObject({ ok: false });
    expect(String((driveDe(i) as { motif: string }).motif)).toMatch(/Documents clients scannés/);
    expect(ecritures()).toEqual([]);
    // Et « Créer le dossier » relancé : toujours refusé, toujours zéro écriture.
    appels = [];
    expect(await creerBrancheBail(await bailDe(loc), AUTEUR.libelle, DEPS)).toMatchObject({ ok: false });
    expect(ecritures()).toEqual([]);
    // Aucune lecture de CONTENU, nulle part dans l'épreuve.
    expect(appels.some((a) => /alt=media/.test(a.url))).toBe(false);
    d4.parents = parentAvant;
  });

  it('⑨ PARENTS MANQUANTS (lot 436, propriétaire 319 sans dossier) : N3 sous « Actifs », N4, N5 et ses rubriques, « 6 Locataires », puis le bail', async () => {
    appels = [];
    const avant = new Map(dossiers);
    const i = await creer(436, [carte('Neuf', 'Ida', 9)]);
    expect(driveDe(i)).toMatchObject({ ok: true, nom: 'BAIL NEUF' });
    const a = arbre(avant);
    expect(a[0]).toMatch(/ ← Actifs$/);
    expect(a.slice(1, 3).map((x) => x.replace(/^.* ← /, '← '))).toEqual([`← ${a[0].split(' ← ')[0]}`, `← ${a[1].split(' ← ')[0]}`]);
    const n5 = a[2].split(' ← ')[0];
    expect(a.slice(3, 13)).toEqual([`0 En attente ← ${n5}`, `1 Propriétaire ← ${n5}`, 'PNO ← 1 Propriétaire', '2026 ← PNO', 'Taxe foncière ← 1 Propriétaire',
      '2026 ← Taxe foncière', `2 Diagnostics ← ${n5}`, `3 Photos ← ${n5}`, `4 Syndic ← ${n5}`, `5 Travaux ← ${n5}`]);
    expect(a.slice(13)).toEqual([`6 Locataires ← ${n5}`, ...MODELE_BAIL('BAIL NEUF')]);
    noter('⑨ dossiers créés (lot 436, propriétaire sans dossier) :', a);
  });

  it('⑩ L’ESSAI « ESSAI BAIL DRIVE », rejoué sur le lot 21 : la liste des dossiers créés', async () => {
    appels = [];
    const avant = new Map(dossiers);
    const i = await creer(21, [carte('ESSAI BAIL DRIVE', 'Locataire', 10)]);
    expect(driveDe(i)).toMatchObject({ ok: true, nom: 'BAIL ESSAI BAIL DRIVE' });
    expect(arbre(avant)).toEqual(MODELE_BAIL('BAIL ESSAI BAIL DRIVE'));
    noter('⑩ dossiers créés (lot 21, « ESSAI BAIL DRIVE ») :', arbre(avant));
  });

  it('🔴 sur toute l’épreuve : ni suppression, ni corbeille, ni déplacement, ni copie', () => {
    expect(tous.length).toBeGreaterThan(0);
    expect(tous.filter((a) => !['GET', 'POST', 'PATCH'].includes(a.methode))).toEqual([]);
    expect(tous.filter((a) => /addParents|removeParents|\/copy|alt=media|emptyTrash/.test(a.url))).toEqual([]);
    // Les écritures : des créations de dossiers, et des renommages qui ne portent QUE le nom.
    for (const a of tous.filter((x) => x.methode === 'POST')) expect(Object.keys(a.corps ?? {}).sort()).toEqual(['appProperties', 'mimeType', 'name', 'parents']);
    for (const a of tous.filter((x) => x.methode === 'PATCH')) expect(Object.keys(a.corps ?? {})).toEqual(['name']);
  });
});
