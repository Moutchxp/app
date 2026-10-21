import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (22/10/2026) — la racine « Base de données location seule » créée à part, pour la mise en production : diagnostic
 * (lectures seules), refus (« Documents clients scannés », doublon non étiqueté, racine inconnue), création étiquetée et inscrite.
 * Base et Drive simulés : rien n'est écrit, rien ne part.
 */
const ecritures: { sql: string; params: unknown[] }[] = [];
let racineInscrite: string | null = null;
let locative: string | null = 'LOC';
vi.mock('../lib/db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM gestion_drive_arbre')) return { rows: locative === null ? [] : [{ d: locative }] };
    if (sql.includes('FROM gestion_drive_racine')) return { rows: racineInscrite === null ? [] : [{ d: racineInscrite }] };
    if (sql.includes('INSERT INTO gestion_drive_racine')) { ecritures.push({ sql, params }); racineInscrite = String(params[0]); return { rows: [] }; }
    return { rows: [] };
  }),
}));
const { diagnosticRacineLocationSeule, creerRacineLocationSeule } = await import('../lib/gestion/arbreStatutDriveRepo');
const { texteRapportRacine } = await import('./racine-location-seule');

interface Dossier { name: string; parents: string[]; appProperties?: Record<string, string>; driveId?: string }
let drive: Record<string, Dossier>;
/** Les Drive partagés (GET drives/{id}) ; absent = Google refuse (404). */
let drivesPartages: Record<string, string>;
const appels: { methode: string; url: string; corps?: unknown }[] = [];
const json = (b: unknown, statut = 200) => new Response(JSON.stringify(b), { status: statut, headers: { 'Content-Type': 'application/json' } });
const fauxFetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const u = new URL(String(entree)); const methode = init?.method ?? 'GET';
  appels.push({ methode, url: u.pathname + u.search, corps: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (methode === 'POST') { const b = JSON.parse(String(init!.body)) as Dossier; drive.NEUF = { name: b.name, parents: b.parents, appProperties: b.appProperties }; return json({ id: 'NEUF', name: b.name }); }
  const id = decodeURIComponent(u.pathname.split('/').pop() ?? '');
  if (u.pathname.includes('/drives/')) return drivesPartages[id] === undefined ? json({}, 404) : json({ name: drivesPartages[id] });
  if (id !== 'files') { const d = drive[id]; return d === undefined ? json({}, 404) : json({ id, name: d.name, parents: d.parents, driveId: d.driveId }); }
  const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q') ?? '')?.[1];
  return json({ files: Object.entries(drive).filter(([, d]) => d.parents.includes(parent ?? '')).map(([i, d]) => ({ id: i, name: d.name, appProperties: d.appProperties })) });
}) as typeof fetch;
const deps = { fetch: fauxFetch, jeton: async () => ({ etat: 'ok' as const, jeton: 'J' }) };

beforeEach(() => {
  ecritures.length = 0; appels.length = 0; racineInscrite = null; locative = 'LOC';
  // Comme chez Google : la racine du Drive partagé se lit comme un dossier nommé « Drive » ; son vrai nom vient de drives/{id}.
  drive = {
    LOC: { name: 'Base de données locative', parents: ['GL'], driveId: 'GL' },
    GL: { name: 'Drive', parents: [], driveId: 'GL' },
    AUTRE: { name: '00 Arrivée des mails', parents: ['GL'], driveId: 'GL' },
  };
  drivesPartages = { GL: 'GESTION LOCATIVE' };
});
const ecrituresDrive = () => appels.filter((a) => a.methode !== 'GET');

describe('🔴 diagnostic : lectures seules', () => {
  it('à créer : à côté de « Base de données locative », dans « GESTION LOCATIVE » — aucune écriture', async () => {
    const d = await diagnosticRacineLocationSeule(deps);
    expect(d).toMatchObject({ etat: 'a_creer', locative: { id: 'LOC', nom: 'Base de données locative' }, parent: { id: 'GL', nom: 'GESTION LOCATIVE' }, retrouvee: null });
    expect(d).toMatchObject({ chaine: ['Base de données locative', 'GESTION LOCATIVE'] });
    expect(appels.some((a) => a.methode === 'GET' && a.url.startsWith('/drive/v3/drives/GL'))).toBe(true);
    expect(ecrituresDrive()).toEqual([]); expect(ecritures).toEqual([]);
  });
  it('le nom du Drive partagé illisible : « Drive », comme Google le rend (rien d’inventé)', async () => {
    drivesPartages = {};
    expect(await diagnosticRacineLocationSeule(deps)).toMatchObject({ etat: 'a_creer', parent: { id: 'GL', nom: 'Drive' } });
  });
  it('déjà inscrite : rien à lire au Drive', async () => {
    racineInscrite = 'RLS';
    expect(await diagnosticRacineLocationSeule(deps)).toEqual({ etat: 'deja', racineId: 'RLS' });
    expect(appels).toEqual([]);
  });
  it('🔴 refus : « Documents clients scannés » dans la chaîne ; racine locative inconnue ; homonyme sans étiquette', async () => {
    drive.GL.parents = ['DCS']; drive.DCS = { name: 'Documents clients scannés', parents: [] };
    expect(await diagnosticRacineLocationSeule(deps)).toMatchObject({ etat: 'refus' });
    expect(appels.some((a) => a.url.includes('/drives/'))).toBe(false);   // refusé avant toute autre lecture
    delete drive.DCS; drive.GL.parents = [];
    drive.MAIN = { name: 'Base de données location seule', parents: ['GL'] };
    expect(await diagnosticRacineLocationSeule(deps)).toMatchObject({ etat: 'refus', motif: expect.stringMatching(/sans l’étiquette.*pas de doublon/) });
    locative = null;
    expect(await diagnosticRacineLocationSeule(deps)).toMatchObject({ etat: 'refus', motif: expect.stringMatching(/locative » n’est pas connue/) });
    expect(ecrituresDrive()).toEqual([]); expect(ecritures).toEqual([]);
  });
});

describe('🔴 création réelle', () => {
  it('crée UN dossier étiqueté à côté de la locative, l’inscrit ; rejouée : rien de plus', async () => {
    expect(await creerRacineLocationSeule('script racine-location-seule', deps)).toEqual({ ok: true, id: 'NEUF', geste: 'cree' });
    const posts = ecrituresDrive();
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toMatchObject({ name: 'Base de données location seule', parents: ['GL'], appProperties: { svav_arbo: 'rls:location_seule' } });
    expect(ecritures.map((e) => e.params.slice(0, 3))).toEqual([['NEUF', 'GL', 'Base de données location seule']]);
    appels.length = 0;
    expect(await creerRacineLocationSeule('script', deps)).toEqual({ ok: true, id: 'NEUF', geste: 'deja' });
    expect(ecrituresDrive()).toEqual([]);
  });
  it('déjà présente avec l’étiquette : inscrite sans rien créer ; refus : ni création ni inscription', async () => {
    drive.ETQ = { name: 'Base de données location seule', parents: ['GL'], appProperties: { svav_arbo: 'rls:location_seule' } };
    expect(await creerRacineLocationSeule('script', deps)).toEqual({ ok: true, id: 'ETQ', geste: 'retrouvee' });
    expect(ecrituresDrive()).toEqual([]);
    racineInscrite = null; ecritures.length = 0; delete drive.ETQ;
    drive.GL.parents = ['DCS']; drive.DCS = { name: 'Documents clients scannés', parents: [] };
    expect(await creerRacineLocationSeule('script', deps)).toMatchObject({ ok: false });
    expect(ecrituresDrive()).toEqual([]); expect(ecritures).toEqual([]);
  });
});

describe('le rapport', () => {
  const quand = new Date('2026-10-22T08:00:00Z');
  it('à blanc : ce qui serait fait ; réel : l’issue ; refus : le motif', () => {
    const d = { etat: 'a_creer' as const, locative: { id: 'LOC', nom: 'Base de données locative' }, parent: { id: 'GL', nom: 'GESTION LOCATIVE' }, chaine: ['Base de données locative', 'GESTION LOCATIVE'], retrouvee: null };
    const blanc = texteRapportRacine({ reel: false, base: 'svav', quand, diagnostic: d });
    expect(blanc).toContain('À BLANC (lectures seules');
    expect(blanc).toContain('il serait CRÉÉ puis inscrit');
    expect(texteRapportRacine({ reel: true, base: 'svav', quand, diagnostic: d, issue: { ok: true, id: 'NEUF', geste: 'cree' } })).toContain('✓ CRÉÉE et inscrite : NEUF');
    expect(texteRapportRacine({ reel: false, base: 'svav', quand, diagnostic: { etat: 'refus', motif: 'X', chaine: [] } })).toContain('⛔ REFUS : X');
  });
});
