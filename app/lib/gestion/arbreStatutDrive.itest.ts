/**
 * ══ 🔴🔴 LE DOSSIER DRIVE D'UN BIEN SELON SON STATUT (Arno, 21/10/2026, migrations 403 et 404) — VRAIE BASE, DRIVE SIMULÉ ═══════
 *
 *   ① « Nouveau bien » en location seule : la racine « Base de données location seule » naît À CÔTÉ de « Base de données
 *      locative », puis N3 › N4 › N5 › N6 ; le registre dit l'arbre ; rejoué : rien de plus ;
 *   ② le même propriétaire, un bien en gestion : un SECOND N3, sous « Actifs » (propriétaire mixte : un N3 par arbre) ;
 *   ③ les transitions dans les DEUX sens, avec un bail et une annexe : le N5 est DÉPLACÉ entier (addParents / removeParents),
 *      jamais recréé ; le registre suit (parent, arbre, branche — le contenu aussi) ;
 *   ④ 🔴 « Documents clients scannés » : refusé, AUCUNE écriture ;
 *   ⑤ le Drive refuse (recette) : le statut reste enregistré, la fiche dit « à créer » / « à déplacer » ;
 *   ⑥ le script de rangement À BLANC : ni écriture en base (empreinte du registre identique avant / après), ni requête au Drive.
 *
 * VRAIE base — une COPIE jetable de la recette, 403 et 404 appliquées ; le Drive est un FAUX en mémoire (aucune requête ne part).
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…`, et se met de côté sans la 404.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_statut403 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/arbreStatutDrive.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerBienComplet, creerProprietaires } from '../location/creationBienRepo';
import { biensARanger, creerDossierDuBien, deplacerDossierDuBien, dossiersDuProprietaire, etatDriveDuBien, type DepsArbre } from './arbreStatutDriveRepo';
import { CLE_RACINE_LOCATION_SEULE, NOM_RACINE_LOCATION_SEULE } from './arbreStatutDrive';
import { changerStatutBien } from './statutBienRepo';
import { archiverBien } from './finGestionRepo';
import { ranger } from '../../scripts/ranger-dossiers-statut';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest arbre statut' };
const S = `d${Date.now().toString(36)}`;
const DPE = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
afterAll(async () => { if (baseEssai) await closePool(); });

// ── LE FAUX DRIVE ───────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Dossier { id: string; name: string; parents: string[]; appProperties?: Record<string, string> }
const dossiers = new Map<string, Dossier>();
const ecritures: string[] = [];
let refuserEcritures = false;
let n = 0;
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
const fauxFetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const u = new URL(String(entree));
  const m = (init?.method ?? 'GET').toUpperCase();
  const chemin = u.pathname.replace('/drive/v3/', '');
  if (m !== 'GET') ecritures.push(`${m} ${chemin}${u.search.includes('addParents') ? `?add=${u.searchParams.get('addParents')}&remove=${u.searchParams.get('removeParents')}` : ''}`);
  if (m !== 'GET' && refuserEcritures) return json({ error: { code: 403, message: 'RECETTE — écriture dans le Drive non effectuée' } }, 403);
  if (m === 'GET' && chemin === 'files') {
    const q = u.searchParams.get('q') ?? '';
    const parent = /'([^']+)' in parents/.exec(q)?.[1] ?? '';
    return json({ files: [...dossiers.values()].filter((d) => d.parents.includes(parent)).map((d) => ({ id: d.id, name: d.name, appProperties: d.appProperties })) });
  }
  if (m === 'GET') {
    const d = dossiers.get(decodeURIComponent(chemin.replace(/^files\//, '')));
    return d === undefined ? json({ error: { code: 404 } }, 404) : json({ id: d.id, name: d.name, parents: d.parents, mimeType: 'application/vnd.google-apps.folder' });
  }
  if (m === 'POST' && chemin === 'files') {
    const b = JSON.parse(String(init?.body)) as { name: string; parents: string[]; appProperties?: Record<string, string> };
    n += 1;
    const id = `faux-${S}-${n}`;
    dossiers.set(id, { id, name: b.name, parents: b.parents, appProperties: b.appProperties });
    return json({ id, name: b.name });
  }
  if (m === 'PATCH') {
    const id = decodeURIComponent(chemin.replace(/^files\//, ''));
    const d = dossiers.get(id);
    if (d === undefined || String(init?.body ?? '') !== '{}') return json({ error: { code: 400 } }, 400);
    d.parents = [u.searchParams.get('addParents')!];
    return json({ id, name: d.name, parents: d.parents });
  }
  return json({ error: { code: 400 } }, 400);
}) as typeof fetch;
const deps: DepsArbre = { fetch: fauxFetch, jeton: async () => ({ etat: 'ok', jeton: 'jeton-faux' }) as never, maintenant: () => new Date('2026-10-21T10:00:00Z') };

let avec404 = false;
let racineLoc = '';
let n2: Record<string, string> = {};
beforeAll(async () => {
  if (!baseEssai) return;
  const { rows } = await query<{ c: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_drive_noeud' AND column_name = 'arbre') AS c`);
  avec404 = rows[0]?.c === true;
  if (!avec404) return;
  racineLoc = (await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_arbre WHERE sorte = 'racine' AND absent_le IS NULL LIMIT 1`)).rows[0].d;
  for (const r of (await query<{ b: string; d: string }>(`SELECT DISTINCT branche AS b, parent_drive_id AS d FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND arbre = 'locative'`)).rows) n2[r.b] = r.d;
  // Le Drive partagé « GESTION LOCATIVE », la racine, ses deux N2, et l'archive « Documents clients scannés » à côté.
  dossiers.set('DRIVE', { id: 'DRIVE', name: 'GESTION LOCATIVE', parents: [] });
  dossiers.set(racineLoc, { id: racineLoc, name: 'Base de données locative', parents: ['DRIVE'] });
  for (const [b, d] of Object.entries(n2)) dossiers.set(d, { id: d, name: b, parents: [racineLoc] });
  dossiers.set('DCS', { id: 'DCS', name: 'Documents clients scannés', parents: ['DRIVE'] });
  dossiers.set('DCS1', { id: 'DCS1', name: '1 actifs', parents: ['DCS'] });
  // Rejouable : une racine « location seule » déjà inscrite (table en ajout seul) existe dans ce faux Drive, à sa place.
  const deja = (await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_racine WHERE arbre = 'location_seule'`)).rows[0];
  if (deja !== undefined) dossiers.set(deja.d, { id: deja.d, name: NOM_RACINE_LOCATION_SEULE, parents: ['DRIVE'], appProperties: { svav_arbo: CLE_RACINE_LOCATION_SEULE } });
});

const enfantsDe = (id: string) => [...dossiers.values()].filter((d) => d.parents.includes(id));
const noeud = async (cle: string) => (await query<{ d: string; p: string; arbre: string; branche: string | null }>(
  'SELECT drive_id AS d, parent_drive_id AS p, arbre, branche FROM gestion_drive_noeud WHERE cle = $1', [cle])).rows[0];
const transition = (id: number, vers: string) => changerStatutBien(id, { vers, effetLe: '2026-10-21' }, AUTEUR, new Date('2026-10-21T10:00:00Z'));

describe.skipIf(!baseEssai)('🔴🔴 le dossier Drive d’un bien selon son statut (403 / 404)', () => {
  let pid = 0;
  let ls = 0;
  let cave = 0;
  let eg = 0;

  beforeAll(async () => {
    if (!avec404) return;
    pid = ok(await creerProprietaires({ cartes: [{ nom: `DRIVE${S}`, coordonnees: [{ sorte: 'telephone', valeur: '06 08 08 08 08', libelle: 'Mobile' },
      { sorte: 'email', valeur: `drive.${S}@exemple.test`, libelle: 'E-mail' }] }], enGestion: false, numeroMandatTransaction: `MT ${S}` }, AUTEUR)).ids[0];
    const a = ok(await creerBienComplet({ proprietaireIds: [pid], enGestion: false,
      logement: { adresse: `7 rue Seule${S}`, ...DPE, famille: 'logement', typeLogement: 'appartement' }, annexes: [{ categorie: 'cave', porte: '2' }] }, AUTEUR));
    ls = a.logementId; cave = a.annexes[0];
    eg = ok(await creerBienComplet({ proprietaireIds: [pid], enGestion: true,
      logement: { adresse: `8 rue Gestion${S}`, ...DPE, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
  });

  it('① « Nouveau bien » en location seule : racine « location seule » à côté de la locative, puis N3 › N4 › N5 › N6 ; rejoué : rien de plus', async () => {
    if (!avec404) return;
    expect(await etatDriveDuBien(ls)).toMatchObject({ etat: { etat: 'a_creer' }, libelleAttendu: 'Base de données location seule' });
    const r = await creerDossierDuBien(ls, 'itest', deps);
    if (!r.ok) throw new Error(r.motif);
    expect(r.geste).toBe('cree');
    const racinesLs = enfantsDe('DRIVE').filter((d) => d.name === NOM_RACINE_LOCATION_SEULE);
    expect(racinesLs).toHaveLength(1);   // jamais deux racines
    const racineLs = racinesLs[0];
    expect(racineLs.appProperties).toEqual({ svav_arbo: CLE_RACINE_LOCATION_SEULE });
    expect((await query('SELECT drive_id, parent_drive_id FROM gestion_drive_racine WHERE arbre = $1', ['location_seule'])).rows).toEqual([{ drive_id: racineLs.id, parent_drive_id: 'DRIVE' }]);
    const n3 = await noeud(`p:${pid}:L`);
    expect(n3).toMatchObject({ p: racineLs.id, arbre: 'location_seule', branche: null });
    const n5 = await noeud(`b:${ls}`);
    expect(enfantsDe(n5.d).map((d) => d.name).sort()).toEqual(['0 En attente', '1 Propriétaire', '2 Diagnostics', '3 Photos', '4 Syndic', '5 Travaux', '6 Locataires']);
    expect((await query<{ d: string | null }>('SELECT drive_dossier_id AS d FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id', [[ls, cave]])).rows.map((x) => x.d)).toEqual([n5.d, n5.d]);
    expect(ecritures.every((e) => e.startsWith('POST files'))).toBe(true);
    const avant = ecritures.length;
    expect(await creerDossierDuBien(ls, 'itest', deps)).toMatchObject({ ok: true, geste: 'deja' });
    expect(ecritures.length).toBe(avant);
    expect(await etatDriveDuBien(cave)).toMatchObject({ etat: { etat: 'ok' } });
  });

  it('② le même propriétaire, un bien EN GESTION : un second N3 sous « Actifs » — la fiche propose chaque dossier', async () => {
    if (!avec404) return;
    const r = await creerDossierDuBien(eg, 'itest', deps);
    if (!r.ok) throw new Error(r.motif);
    expect(await noeud(`p:${pid}:A`)).toMatchObject({ p: n2.Actifs, arbre: 'locative', branche: 'Actifs' });
    expect((await dossiersDuProprietaire(pid)).map((d) => d.libelle)).toEqual(['Base de données locative › Actifs', 'Base de données location seule']);
  });

  it('③ transitions dans les DEUX sens, avec bail et annexe : le N5 DÉPLACÉ entier, le registre suit', async () => {
    if (!avec404) return;
    const n5 = await noeud(`b:${ls}`);
    // Un dossier de bail sous « 6 Locataires » : il voyage avec le N5, et son arbre au registre aussi.
    const n6 = await noeud(`r:${ls}:6`);
    await query(`INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, arbre, proprietaire_id, lot_id, nom_a_la_creation, enregistre_par)
                 VALUES ($1, 'bail', 7, $2, $3, NULL, 'location_seule', $4, $5, 'BAIL 01/10/2026 ESSAI', 'itest')`, [`l:${ls}:2026-10-01`, `bail-${S}`, n6.d, pid, ls]);
    dossiers.set(`bail-${S}`, { id: `bail-${S}`, name: 'BAIL 01/10/2026 ESSAI', parents: [n6.d] });
    const ecrit = ecritures.length;
    ok(await transition(ls, 'en_gestion'));
    const r1 = await deplacerDossierDuBien(cave, 'itest', deps);   // depuis l'ANNEXE : c'est le bien principal qui voyage
    if (!r1.ok) throw new Error(r1.motif);
    expect(r1).toMatchObject({ geste: 'deplace', driveId: n5.d });
    const apres = await noeud(`b:${ls}`);
    expect(apres).toMatchObject({ d: n5.d, arbre: 'locative', branche: 'Actifs' });
    expect(dossiers.get(n5.d)!.parents).toEqual([apres.p]);
    expect(dossiers.get(apres.p)!.parents).toEqual([(await noeud(`p:${pid}:A`)).d]);
    expect(await noeud(`l:${ls}:2026-10-01`)).toMatchObject({ arbre: 'locative', branche: 'Actifs' });
    expect(await noeud(`r:${ls}:3`)).toMatchObject({ arbre: 'locative', branche: 'Actifs' });
    expect(ecritures.slice(ecrit).filter((e) => e.startsWith('PATCH'))).toEqual([`PATCH files/${n5.d}?add=${apres.p}&remove=${n5.p}`]);
    // Ancienne gestion (405) : « Gestion terminée » — le dossier RESTE à sa place ; ARCHIVÉE (fin + 2 ans) → « Inactifs » ;
    // puis location seule (retour à l'arbre « location seule », N4 d'origine repris).
    ok(await transition(ls, 'ancienne_gestion'));
    expect(await deplacerDossierDuBien(ls, 'itest', deps)).toMatchObject({ ok: true, geste: 'deja' });
    expect(await noeud(`b:${ls}`)).toMatchObject({ arbre: 'locative', branche: 'Actifs' });
    expect(await archiverBien(ls, new Date('2028-10-21T10:00:00Z'), AUTEUR)).toMatchObject({ archive: true });
    expect(await deplacerDossierDuBien(ls, 'itest', deps)).toMatchObject({ ok: true, geste: 'deplace' });
    expect(await noeud(`b:${ls}`)).toMatchObject({ arbre: 'locative', branche: 'Inactifs' });
    expect(await noeud(`p:${pid}:I`)).toMatchObject({ p: n2.Inactifs });
    ok(await transition(ls, 'location_seule'));
    expect(await deplacerDossierDuBien(ls, 'itest', deps)).toMatchObject({ ok: true, geste: 'deplace' });
    expect(await noeud(`b:${ls}`)).toMatchObject({ p: n5.p, arbre: 'location_seule', branche: null });
    // Le N5 n'a JAMAIS été recréé : une seule création de clé b:<ls>, et il garde ses 7 rubriques + le bail.
    expect([...dossiers.values()].filter((d) => d.appProperties?.svav_arbo === `b:${ls}`)).toHaveLength(1);
    expect(enfantsDe(n6.d).map((d) => d.id)).toEqual([`bail-${S}`]);
    expect(ecritures.some((e) => /DELETE|trash|copy/i.test(e))).toBe(false);
  });

  it('④ 🔴 « Documents clients scannés » : un N5 inscrit sous l’archive n’est JAMAIS déplacé — aucune écriture', async () => {
    if (!avec404) return;
    const piege = ok(await creerBienComplet({ proprietaireIds: [pid], enGestion: true,
      logement: { adresse: `9 rue Archive${S}`, ...DPE, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
    dossiers.set(`dcs-n5-${S}`, { id: `dcs-n5-${S}`, name: 'Bien rangé dans l’archive', parents: ['DCS1'] });
    await query(`INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, arbre, proprietaire_id, lot_id, nom_a_la_creation, enregistre_par)
                 VALUES ($1, 'bien', 5, $2, 'DCS1', 'Actifs', 'locative', $3, $4, 'piège', 'itest')`, [`b:${piege}`, `dcs-n5-${S}`, pid, piege]);
    ok(await transition(piege, 'location_seule'));
    const avant = ecritures.length;
    const r = await deplacerDossierDuBien(piege, 'itest', deps);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.motif).toMatch(/Documents clients scannés/);
    expect(ecritures.length).toBe(avant);
    expect(dossiers.get(`dcs-n5-${S}`)!.parents).toEqual(['DCS1']);
  });

  it('⑤ le Drive refuse (recette) : le statut reste enregistré, la fiche dit « à déplacer » ; « Déplacer maintenant » rejoue', async () => {
    if (!avec404) return;
    ok(await transition(eg, 'location_seule'));
    refuserEcritures = true;
    const r = await deplacerDossierDuBien(eg, 'itest', deps);
    refuserEcritures = false;
    expect(r.ok).toBe(false);
    expect((await query<{ s: string }>('SELECT statut_bien AS s FROM gestion_annuaire_lot WHERE id = $1', [eg])).rows[0].s).toBe('location_seule');
    expect(await etatDriveDuBien(eg)).toMatchObject({ etat: { etat: 'a_deplacer' }, libelleActuel: 'Base de données locative › Actifs', libelleAttendu: 'Base de données location seule' });
    expect(await deplacerDossierDuBien(eg, 'itest', deps)).toMatchObject({ ok: true, geste: 'deplace' });
    expect(await etatDriveDuBien(eg)).toMatchObject({ etat: { etat: 'ok' } });
  });

  it('⑥ le script de rangement À BLANC : aucune écriture en base (empreinte identique), aucune requête au Drive, aucun déplacement', async () => {
    if (!avec404) return;
    ok(await transition(eg, 'en_gestion'));   // un N5 désormais mal placé (location seule → en gestion, pas encore déplacé)
    const empreinte = async () => (await query<{ e: string }>(`SELECT md5(string_agg(n::text, '|' ORDER BY n.id)) AS e FROM gestion_drive_noeud n`)).rows[0].e;
    const avant = await empreinte();
    const ecrit = ecritures.length;
    let appels = 0;
    const { texte } = await ranger(false, { biens: biensARanger, base: NOM_BASE, deplacer: async () => { appels += 1; return { ok: true }; } });
    expect(appels).toBe(0);
    expect(await empreinte()).toBe(avant);
    expect(ecritures.length).toBe(ecrit);
    expect(texte).toContain('À BLANC (aucune écriture, aucune requête au Drive)');
    expect(texte).toMatch(new RegExp(`bien ${eg} — .* : « Base de données location seule » → « Base de données locative › Actifs » — à déplacer`));
    // RÉEL (dans ce faux Drive) : rejouable — une seconde passe ne déplace plus rien.
    const reel = await ranger(true, { biens: biensARanger, base: NOM_BASE, deplacer: async (lotId) => { const x = await deplacerDossierDuBien(lotId, 'itest', deps); return x.ok ? { ok: true } : { ok: false, motif: x.motif }; } });
    expect(reel.issues.filter((i) => i.lotId === eg)).toEqual([{ lotId: eg, ok: true, motif: null }]);
    const second = await ranger(true, { biens: biensARanger, base: NOM_BASE, deplacer: async () => ({ ok: true }) });
    expect(second.issues.some((i) => i.lotId === eg)).toBe(false);
  });
});
