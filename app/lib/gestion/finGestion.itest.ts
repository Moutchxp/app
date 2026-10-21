/**
 * ══ 🔴🔴 FIN DE GESTION EN DEUX TEMPS, PUIS ARCHIVAGE AUTOMATIQUE (Arno, 21/10/2026, migration 405) — VRAIE BASE, DRIVE SIMULÉ ══
 *
 * Horloge SIMULÉE (fin de gestion le 21/10/2026) :
 *   ① fin de gestion : « Gestion terminée » — toujours dans la Gestion, hors compteurs actifs, dossier Drive à sa place ;
 *   ② archivage à J + 2 ans : rien la veille ; le jour J, la passe archive — le bien disparaît de la Gestion, son N5 part dans
 *      « Inactifs » (le propriétaire ENTIER si c'était son dernier bien actif), il reste dans la Location, l'Historique le dit ;
 *      la passe est IDEMPOTENTE ;
 *   ③ reprise à J + 1 an : rien n'est archivé à J + 2 ans ; une nouvelle fin repart pour 2 ans ;
 *   ④ passage en location seule pendant la période : pas d'archivage ;
 *   ⑤ reprise APRÈS archivage : en gestion, plus archivé, dossier ramené dans « Actifs » ;
 *   ⑥ délai modifié (12 mois) : vaut pour les biens pas encore archivés ;
 *   ⑦ 🔴 un N5 sous « Documents clients scannés » : archivé en base, mais AUCUNE écriture Drive — « Dossier Drive à déplacer ».
 *
 * VRAIE base — COPIE jetable de la recette, 403, 404 et 405 appliquées ; le Drive est un FAUX en mémoire (rien ne part).
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_statut403 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/finGestion.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerBienComplet, creerProprietaires } from '../location/creationBienRepo';
import { clientsEtBiens } from '../location/clientsBiensRepo';
import { creerDossierDuBien, deplacerDossierDuBien, etatDriveDuBien, type DepsArbre } from './arbreStatutDriveRepo';
import { CLE_RACINE_LOCATION_SEULE, NOM_RACINE_LOCATION_SEULE } from './arbreStatutDrive';
import { ficheProprietaire } from './annuaireRepo';
import { archiverBien, enregistrerDelaiArchivage, passerArchivage } from './finGestionRepo';
import { changerStatutBien, transitionsDuBien } from './statutBienRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest fin de gestion' };
const S = `f${Date.now().toString(36)}`;
const DPE = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const jour = (iso: string) => new Date(`${iso}T10:00:00Z`);
afterAll(async () => { if (baseEssai) await closePool(); });

// ── LE FAUX DRIVE (même modèle que arbreStatutDrive.itest.ts) ───────────────────────────────────────────────────────────────
interface Dossier { id: string; name: string; parents: string[]; appProperties?: Record<string, string> }
const dossiers = new Map<string, Dossier>();
const ecritures: string[] = [];
let n = 0;
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
const fauxFetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const u = new URL(String(entree));
  const m = (init?.method ?? 'GET').toUpperCase();
  const chemin = u.pathname.replace('/drive/v3/', '');
  if (m !== 'GET') ecritures.push(`${m} ${chemin}`);
  if (m === 'GET' && chemin === 'files') {
    const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q') ?? '')?.[1] ?? '';
    return json({ files: [...dossiers.values()].filter((d) => d.parents.includes(parent)).map((d) => ({ id: d.id, name: d.name, appProperties: d.appProperties })) });
  }
  if (m === 'GET') {
    const d = dossiers.get(decodeURIComponent(chemin.replace(/^files\//, '')));
    return d === undefined ? json({ error: { code: 404 } }, 404) : json({ id: d.id, name: d.name, parents: d.parents });
  }
  if (m === 'POST' && chemin === 'files') {
    const b = JSON.parse(String(init?.body)) as { name: string; parents: string[]; appProperties?: Record<string, string> };
    n += 1; const id = `faux-${S}-${n}`;
    dossiers.set(id, { id, name: b.name, parents: b.parents, appProperties: b.appProperties });
    return json({ id, name: b.name });
  }
  if (m === 'PATCH') {
    const d = dossiers.get(decodeURIComponent(chemin.replace(/^files\//, '')));
    if (d === undefined || String(init?.body ?? '') !== '{}') return json({ error: { code: 400 } }, 400);
    d.parents = [u.searchParams.get('addParents')!];
    return json({ id: d.id, name: d.name, parents: d.parents });
  }
  return json({ error: { code: 400 } }, 400);
}) as typeof fetch;
const deps: DepsArbre = { fetch: fauxFetch, jeton: async () => ({ etat: 'ok', jeton: 'faux' }) as never, maintenant: () => jour('2026-10-21') };
const deplacer = async (lotId: number) => { const r = await deplacerDossierDuBien(lotId, 'itest', deps); return r.ok ? { ok: true, motif: null } : { ok: false, motif: r.motif }; };

let avec405 = false;
const n2: Record<string, string> = {};
beforeAll(async () => {
  if (!baseEssai) return;
  const { rows } = await query<{ c: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'statut_archive_le') AS c`);
  avec405 = rows[0]?.c === true;
  if (!avec405) return;
  const racine = (await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_arbre WHERE sorte = 'racine' AND absent_le IS NULL LIMIT 1`)).rows[0].d;
  for (const r of (await query<{ b: string; d: string }>(`SELECT DISTINCT branche AS b, parent_drive_id AS d FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND arbre = 'locative' AND cle ~ '^p:[0-9]+:[AI]$'`)).rows) n2[r.b] = r.d;
  dossiers.set('DRIVE', { id: 'DRIVE', name: 'GESTION LOCATIVE', parents: [] });
  dossiers.set(racine, { id: racine, name: 'Base de données locative', parents: ['DRIVE'] });
  for (const [b, d] of Object.entries(n2)) dossiers.set(d, { id: d, name: b, parents: [racine] });
  dossiers.set('DCS', { id: 'DCS', name: 'Documents clients scannés', parents: ['DRIVE'] });
  dossiers.set('DCS2', { id: 'DCS2', name: '2 vendus', parents: ['DCS'] });
  const ls = (await query<{ d: string }>(`SELECT drive_id AS d FROM gestion_drive_racine WHERE arbre = 'location_seule'`)).rows[0];
  if (ls !== undefined) dossiers.set(ls.d, { id: ls.d, name: NOM_RACINE_LOCATION_SEULE, parents: ['DRIVE'], appProperties: { svav_arbo: CLE_RACINE_LOCATION_SEULE } });
  await enregistrerDelaiArchivage(24, AUTEUR);
});

const proprietaire = async (nom: string) => ok(await creerProprietaires({ cartes: [{ nom, coordonnees: [{ sorte: 'telephone', valeur: '06 09 09 09 09', libelle: 'Mobile' },
  { sorte: 'email', valeur: `${nom.toLowerCase()}@exemple.test`, libelle: 'E-mail' }] }], enGestion: true, numeroMandat: `MG ${nom}` }, AUTEUR)).ids[0];
const bien = async (p: number, adresse: string) => {
  const id = ok(await creerBienComplet({ proprietaireIds: [p], enGestion: true, logement: { adresse, ...DPE, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
  const r = await creerDossierDuBien(id, 'itest', deps);
  if (!r.ok) throw new Error(r.motif);
  return id;
};
const statut = (id: number, vers: string, le: string) => changerStatutBien(id, { vers, effetLe: le }, AUTEUR, jour(le));
const etat = async (id: number) => (await query<{ s: string; a: string | null; d: string | null }>(
  'SELECT statut_bien AS s, statut_archive_le::text AS a, statut_bien_depuis::text AS d FROM gestion_annuaire_lot WHERE id = $1', [id])).rows[0];
const n5 = async (id: number) => (await query<{ d: string; branche: string | null; arbre: string }>(`SELECT drive_id AS d, branche, arbre FROM gestion_drive_noeud WHERE cle = $1`, [`b:${id}`])).rows[0];

describe.skipIf(!baseEssai)('🔴🔴 fin de gestion en deux temps, puis archivage automatique (405)', () => {
  let seul = 0; let pSeul = 0;

  it('① fin de gestion : « Gestion terminée », toujours dans la Gestion, hors compteurs actifs, dossier Drive à sa place', async () => {
    if (!avec405) return;
    pSeul = await proprietaire(`SEUL${S}`);
    seul = await bien(pSeul, `1 rue Fin${S}`);
    ok(await statut(seul, 'ancienne_gestion', '2026-10-21'));
    expect(await etat(seul)).toEqual({ s: 'ancienne_gestion', a: null, d: '2026-10-21' });
    const f = ok(await ficheProprietaire(pSeul, { horsLocationSeule: true }));
    expect(f.biens.map((b) => [b.id, b.statut, b.archiveLe, b.finStatut])).toEqual([[seul, 'ancienne_gestion', null, '2026-10-21']]);
    expect(await deplacerDossierDuBien(seul, 'itest', deps)).toMatchObject({ ok: true, geste: 'deja' });
    expect(await n5(seul)).toMatchObject({ branche: 'Actifs' });
    expect(await etatDriveDuBien(seul)).toMatchObject({ etat: { etat: 'ok' } });
  });

  it('② archivage à J + 2 ans : rien la veille ; le jour J, archivé, hors Gestion, propriétaire ENTIER en « Inactifs », dans la Location ; idempotent', async () => {
    if (!avec405) return;
    const veille = await passerArchivage({ reel: true, maintenant: jour('2028-10-20'), auteur: AUTEUR, deplacer });
    expect(veille.archives.some((a) => a.lotId === seul)).toBe(false);
    const blanc = await passerArchivage({ reel: false, maintenant: jour('2028-10-21'), auteur: AUTEUR, deplacer });
    expect(blanc.enCours.find((b) => b.lotId === seul)).toMatchObject({ aArchiver: true, echeance: '2028-10-21' });
    expect((await etat(seul)).a).toBeNull();   // à blanc : rien d'écrit
    const avant = ecritures.length;
    const p = await passerArchivage({ reel: true, maintenant: jour('2028-10-21'), auteur: AUTEUR, deplacer });
    expect(p.archives.find((a) => a.lotId === seul)).toEqual({ lotId: seul, phrase: 'Archivage automatique : fin de gestion le 21/10/2026 + 2 ans', drive: { ok: true, motif: null } });
    expect((await etat(seul)).a).not.toBeNull();
    // La Gestion ne le montre plus ; la Location, si (pastille « Ancienne gestion »).
    expect(ok(await ficheProprietaire(pSeul, { horsLocationSeule: true })).biens).toEqual([]);
    expect((await clientsEtBiens(`SEUL${S}`, 'ancienne_gestion')).clients[0].biens).toMatchObject([{ id: seul, statut: 'ancienne_gestion', archive: true }]);
    // Son dernier bien actif : le N3 ENTIER du propriétaire passe dans « Inactifs » (un seul déplacement).
    const n3 = (await query<{ d: string; branche: string }>(`SELECT drive_id AS d, branche FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND proprietaire_id = $1`, [pSeul])).rows;
    expect(n3).toHaveLength(1);
    expect(n3[0].branche).toBe('Inactifs');
    expect(dossiers.get(n3[0].d)!.parents).toEqual([n2.Inactifs]);
    expect(await n5(seul)).toMatchObject({ branche: 'Inactifs' });
    expect(ecritures.slice(avant).filter((e) => e.startsWith('PATCH'))).toEqual([`PATCH files/${n3[0].d}`]);
    expect((await transitionsDuBien(seul))[0]).toMatchObject({ source: 'archivage', motif: 'Archivage automatique : fin de gestion le 21/10/2026 + 2 ans' });
    // IDEMPOTENT : une seconde passe n'archive plus rien.
    const encore = await passerArchivage({ reel: true, maintenant: jour('2028-10-22'), auteur: AUTEUR, deplacer });
    expect(encore.archives.some((a) => a.lotId === seul)).toBe(false);
    expect(await archiverBien(seul, jour('2029-01-01'), AUTEUR)).toEqual({ archive: false, motif: 'Le bien est déjà archivé.' });
  });

  it('③ reprise à J + 1 an : rien à J + 2 ans ; une nouvelle fin repart pour 2 ans', async () => {
    if (!avec405) return;
    const p = await proprietaire(`REPRIS${S}`);
    const b = await bien(p, `2 rue Repris${S}`);
    await bien(p, `3 rue Autre${S}`);
    ok(await statut(b, 'ancienne_gestion', '2026-10-21'));
    ok(await statut(b, 'en_gestion', '2027-10-21'));
    expect((await passerArchivage({ reel: true, maintenant: jour('2028-10-21'), auteur: AUTEUR, deplacer })).archives.some((a) => a.lotId === b)).toBe(false);
    expect(await etat(b)).toMatchObject({ s: 'en_gestion', a: null });
    ok(await statut(b, 'ancienne_gestion', '2027-11-01'));
    const p1 = await passerArchivage({ reel: false, maintenant: jour('2029-10-31'), auteur: AUTEUR });
    expect(p1.enCours.find((x) => x.lotId === b)).toMatchObject({ echeance: '2029-11-01', aArchiver: false });
    const p2 = await passerArchivage({ reel: true, maintenant: jour('2029-11-01'), auteur: AUTEUR, deplacer });
    expect(p2.archives.map((a) => a.lotId)).toContain(b);
    // Un autre bien actif chez ce propriétaire : seul le N5 voyage, sous un N3 « Inactifs » neuf.
    expect(await n5(b)).toMatchObject({ branche: 'Inactifs' });
    expect((await query<{ branche: string }>(`SELECT branche FROM gestion_drive_noeud WHERE sorte = 'proprietaire' AND proprietaire_id = $1 ORDER BY branche`, [p])).rows.map((x) => x.branche))
      .toEqual(['Actifs', 'Inactifs']);
  });

  it('④ passé en location seule pendant la période : jamais archivé', async () => {
    if (!avec405) return;
    const p = await proprietaire(`LS${S}`);
    const b = await bien(p, `4 rue Seule${S}`);
    ok(await statut(b, 'ancienne_gestion', '2026-10-21'));
    ok(await statut(b, 'location_seule', '2027-03-01'));
    expect((await passerArchivage({ reel: true, maintenant: jour('2029-01-01'), auteur: AUTEUR, deplacer })).archives.some((a) => a.lotId === b)).toBe(false);
    expect(await archiverBien(b, jour('2029-01-01'), AUTEUR)).toMatchObject({ archive: false, motif: expect.stringContaining('n’est plus en fin de gestion') });
    expect(await etat(b)).toMatchObject({ s: 'location_seule', a: null });
  });

  it('⑤ reprise APRÈS archivage : en gestion, plus archivé, dossier ramené dans « Actifs »', async () => {
    if (!avec405) return;
    ok(await changerStatutBien(seul, { vers: 'en_gestion', effetLe: '2028-12-01' }, AUTEUR, jour('2028-12-01')));
    expect(await etat(seul)).toMatchObject({ s: 'en_gestion', a: null });
    expect(await deplacerDossierDuBien(seul, 'itest', deps)).toMatchObject({ ok: true, geste: 'deplace' });
    expect(await n5(seul)).toMatchObject({ branche: 'Actifs' });
    expect(ok(await ficheProprietaire(pSeul, { horsLocationSeule: true })).biens.map((b) => b.id)).toEqual([seul]);
  });

  it('⑥ délai modifié (12 mois) : vaut pour les biens pas encore archivés', async () => {
    if (!avec405) return;
    const p = await proprietaire(`DELAI${S}`);
    const b = await bien(p, `5 rue Delai${S}`);
    ok(await statut(b, 'ancienne_gestion', '2026-10-21'));
    ok(await enregistrerDelaiArchivage(12, AUTEUR));
    try {
      expect((await passerArchivage({ reel: false, maintenant: jour('2027-10-21'), auteur: AUTEUR })).enCours.find((x) => x.lotId === b)).toMatchObject({ echeance: '2027-10-21', aArchiver: true });
      expect((await etat(seul)).a).toBeNull();   // l'archivé d'avant (puis repris) n'est pas touché
    } finally {
      ok(await enregistrerDelaiArchivage(24, AUTEUR));
    }
    expect(await enregistrerDelaiArchivage('0', AUTEUR)).toMatchObject({ etat: 'refus' });
  });

  it('⑦ 🔴 N5 sous « Documents clients scannés » : archivé en base, AUCUNE écriture Drive, « Dossier Drive à déplacer »', async () => {
    if (!avec405) return;
    const p = await proprietaire(`ARCH${S}`);
    const b = ok(await creerBienComplet({ proprietaireIds: [p], enGestion: true, logement: { adresse: `6 rue Archive${S}`, ...DPE, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
    dossiers.set(`dcs-${S}`, { id: `dcs-${S}`, name: 'Bien rangé dans l’archive', parents: ['DCS2'] });
    await query(`INSERT INTO gestion_drive_noeud (cle, sorte, niveau, drive_id, parent_drive_id, branche, arbre, proprietaire_id, lot_id, nom_a_la_creation, enregistre_par)
                 VALUES ($1, 'bien', 5, $2, 'DCS2', 'Actifs', 'locative', $3, $4, 'piège', 'itest')`, [`b:${b}`, `dcs-${S}`, p, b]);
    ok(await statut(b, 'ancienne_gestion', '2026-10-21'));
    const avant = ecritures.length;
    // Le geste de la passe pour CE bien : l'archivage en base, puis le déplacement Drive (refusé).
    expect(await archiverBien(b, jour('2028-10-21'), AUTEUR)).toMatchObject({ archive: true });
    expect(await deplacer(b)).toMatchObject({ ok: false, motif: expect.stringContaining('Documents clients scannés') });
    expect((await etat(b)).a).not.toBeNull();
    expect(ecritures.length).toBe(avant);
    expect(dossiers.get(`dcs-${S}`)!.parents).toEqual(['DCS2']);
    expect(await etatDriveDuBien(b)).toMatchObject({ etat: { etat: 'a_deplacer' } });
  });
});
