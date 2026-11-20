import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (20/11/2026, lot 7c) — l'adresse d'une personne au FORMAT UNIQUE, à côté du texte, jamais à sa place ; seule une nouvelle saisie choisie dans
 * la liste la remplit ; une adresse existante n'est jamais réécrite ; les mails lisent l'adresse officielle quand elle existe, le texte sinon.
 */
const h = vi.hoisted(() => ({ dispo: true, sql: [] as { s: string; p: unknown[] }[], enCours: null as null | { id: string; ban_id: string }, statut: 'certain', lus: [] as unknown[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT id::text, ban_id FROM gestion_personne_adresse_ban')) return { rows: h.enCours ? [h.enCours] : [] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('SELECT to_regclass')) return { rows: [{ ok: h.dispo }] };
  if (s.startsWith('SELECT sujet_id::text, ban_id, libelle_officiel')) return { rows: h.lus.filter((x) => (p[1] as number[]).includes(Number((x as { sujet_id: string }).sujet_id))) };
  return { rows: [] };
} }));
const rapproches: unknown[] = [];
vi.mock('./banRepo', () => ({ rapprocherAdresse: async (a: unknown) => { rapproches.push(a); return h.statut === 'certain'
  ? { statut: 'certain', codePostal: '92400', ban: { id: '92026_5162_00001', libelle: '1 Villa Des Lilas', numero: 1, suffixe: null, insee: '92026', commune: 'Courbevoie' } }
  : { statut: h.statut, codePostal: null, ban: null }; } }));
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.dispo = true; h.sql = []; h.enCours = null; h.statut = 'certain'; h.lus = []; rapproches.length = 0; vi.resetModules(); });
const charger = () => import('./personneAdresseRepo');

describe('une adresse française choisie dans la liste', () => {
  it('retrouvée avec certitude : le format unique posé à côté du texte (identifiant BAN, libellé, numéro, indice, code postal, INSEE, commune)', async () => {
    const m = await charger();
    expect(await m.enregistrerAdressePersonne(q as never, 'proprietaire', 146, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE', nature: 'liste' }, AUTEUR)).toBe('pose');
    const ins = ecritures().find((x) => x.s.startsWith('INSERT INTO gestion_personne_adresse_ban'))!;
    expect(ins.p).toEqual(['proprietaire', 146, '92026_5162_00001', '1 Villa Des Lilas', 1, null, '92400', '92026', 'Courbevoie', '1 Villa Des Lilas', 2, AUTEUR.libelle]);
    expect(ecritures().some((x) => /gestion_annuaire_proprietaire|DELETE/.test(x.s))).toBe(false); // le texte de la fiche n'est jamais touché ici
  });
  it('la même adresse officielle déjà en cours : rien ; une autre : la ligne en cours FERMÉE (jamais effacée), la nouvelle posée', async () => {
    const m = await charger();
    h.enCours = { id: '7', ban_id: '92026_5162_00001' };
    expect(await m.enregistrerAdressePersonne(q as never, 'locataire', 9, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE', nature: 'liste' }, AUTEUR)).toBe('rien');
    expect(ecritures()).toEqual([]);
    h.enCours = { id: '7', ban_id: '75119_5560_00003' };
    expect(await m.enregistrerAdressePersonne(q as never, 'locataire', 9, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE', nature: 'liste' }, AUTEUR)).toBe('pose');
    expect(ecritures().map((x) => x.s.split(' ').slice(0, 3).join(' '))).toEqual(['UPDATE gestion_personne_adresse_ban SET', 'INSERT INTO gestion_personne_adresse_ban']);
  });
});

describe('une adresse à l’étranger, ou hors liste (saisie libre)', () => {
  it('aucun format unique posé ; une ligne en cours (l’ancienne adresse) est FERMÉE, l’écran et les mails reprennent le texte', async () => {
    const m = await charger();
    expect(await m.enregistrerAdressePersonne(q as never, 'apporteur', 4, { adresse: '12 Baker Street', codePostal: 'NW1 6XE', commune: 'Londres', nature: 'etranger' }, AUTEUR)).toBe('rien');
    expect(rapproches).toEqual([]);
    expect(ecritures()).toEqual([]);
    h.enCours = { id: '8', ban_id: '92026_5162_00001' };
    expect(await m.enregistrerAdressePersonne(q as never, 'carte', 31, { adresse: 'Service compta, BP 12', codePostal: '92001', commune: 'Nanterre CEDEX', nature: 'hors_liste' }, AUTEUR)).toBe('ferme');
    expect(ecritures().map((x) => x.s.slice(0, 40))).toEqual(['UPDATE gestion_personne_adresse_ban SET ']);
  });
  it('choisie mais non retrouvée avec certitude : rien n’est supposé', async () => {
    const m = await charger();
    h.statut = 'a_verifier';
    expect(await m.enregistrerAdressePersonne(q as never, 'proprietaire', 146, { adresse: '1 rue X', codePostal: null, commune: null, nature: 'liste' }, AUTEUR)).toBe('rien');
    expect(ecritures()).toEqual([]);
  });
  it('sans la migration 509 : rien du tout', async () => {
    h.dispo = false;
    const m = await charger();
    expect(await m.enregistrerAdressePersonne(q as never, 'proprietaire', 146, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE', nature: 'liste' }, AUTEUR)).toBe('rien');
    expect(h.sql).toEqual([]);
  });
});

describe('une adresse existante n’est jamais réécrite', () => {
  it('chaque chemin d’écriture ne pose le format unique que si l’adresse a été TOUCHÉE (le contrôle dit « écrire »)', () => {
    const lire = (f: string) => readFileSync(f, 'utf8');
    const edition = lire('app/lib/gestion/annuaireEditionRepo.ts');
    expect(edition.match(/if \(controle\.ok && controle\.ecrire\) \{\s+await enregistrerAdressePersonne\(q, sujet, id,/g)).toHaveLength(2); // modifier, créer
    const cartes = lire('app/lib/gestion/partieCategorieRepo.ts');
    expect(cartes.match(/&& controle\.ok && controle\.ecrire\) \{\s+await enregistrerAdressePersonne\(/g)).toHaveLength(2); // poser, modifier
    expect(lire('app/lib/location/suivi/suiviRepo.ts')).toMatch(/if \(adr\.ok && adr\.ecrire\) \{\s+await enregistrerAdressePersonne\(q, 'apporteur', id,/);
  });
  it('à l’écran, sans adresse officielle : le texte tel qu’il est ; avec : le libellé officiel mis en forme', async () => {
    const m = await charger();
    h.lus = [{ sujet_id: '146', ban_id: 'B', libelle_officiel: '1 Villa Des Lilas', code_postal: '92400', commune: 'Courbevoie' }];
    const lu = await m.adressesOfficiellesDesPersonnes('proprietaire', [146, 147]);
    expect(lu.get(146)?.libelle).toBe('1 villa des Lilas, 92400 Courbevoie');
    expect(lu.has(147)).toBe(false);
    const cartes = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(cartes).toContain('const adresse = p.adresseOfficielle ? p.adresseOfficielle.libelle : [');
    expect(cartes).toContain('const adressePostale = c.adresseOfficielle ? c.adresseOfficielle.libelle : [');
  });
});
