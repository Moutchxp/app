import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30, point 4) « on enrichit la copropriété aussi bien depuis la fiche copropriété que depuis la création d'un bien, et cela
 * nourrit une seule et même base » — le rattachement d'un bien de l'application à la copropriété qui porte déjà son adresse (règle de la 520). Base simulée.
 * (Le parcours réel — création, fiche, second bien, changement d'adresse — est rejoué en recette dans une transaction annulée : voir PASSATION.)
 */
const h = vi.hoisted(() => ({ lot: null as Record<string, unknown> | null, deja: 0, conflit: null as unknown, libelle: '12 bis rue _TEST Comparable', sql: [] as { s: string; p: unknown[] }[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT immeuble, adresse, code_postal AS cp, wippimmo_id')) return { rows: h.lot === null ? [] : [h.lot] };
  if (s.startsWith('SELECT count(*)::text AS n FROM (SELECT 1 FROM gestion_copropriete WHERE cle_immeuble')) return { rows: [{ n: String(h.deja) }] };
  if (s.startsWith('SELECT libelle FROM gestion_copropriete')) return { rows: [{ libelle: h.libelle }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./coproprieteRepo', () => ({ ficheCopropriete: async () => null, etatPlace: () => null }));
const conflit = vi.fn(async (..._a: unknown[]) => h.conflit);
vi.mock('./adresseCoproExclusiviteRepo', () => ({ conflitDeLAdresse: (...a: unknown[]) => conflit(...a) }));
import { rattacherBienALaCoproprieteDeSonAdresse } from './digicodesBienRepo';

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const C271 = { cle: '12 bis rue test comparable', ecrite: '12 bis rue _TEST Comparable, 92600 Asnières', principale: false, biens: [], digicodes: [],
  copropriete: { id: 271, cle: '1 rue test deux adresses', libelle: '1 rue _TEST Deux Adresses', nom: null, syndic: null } };
const ecritures = () => h.sql.filter((x) => /^(UPDATE|INSERT)/.test(x.s));
beforeEach(() => { h.lot = { immeuble: '12bis rue _TEST Comparable', adresse: '12bis rue _TEST Comparable', cp: '92600', wippimmo_id: 'app-1' }; h.deja = 0; h.conflit = C271; h.sql = []; conflit.mockClear(); });

describe('un bien de l’application rejoint la copropriété qui porte déjà son adresse', () => {
  it('« 12bis » d’un bien, « 12 bis » d’une copropriété (même code postal) : son « Immeuble » prend l’adresse de la copropriété, journalisé', async () => {
    expect(await rattacherBienALaCoproprieteDeSonAdresse(q as never, 5, AUTEUR)).toBe(true);
    expect(conflit.mock.calls[0].slice(1)).toEqual([{ coproId: null, coproCle: '12bis rue test comparable' }, { libelle: '12bis rue _TEST Comparable', codePostal: '92600' }]);
    const e = ecritures();
    expect(e).toHaveLength(2);
    expect([e[0].s.startsWith('UPDATE gestion_annuaire_lot SET immeuble'), e[0].p]).toEqual([true, [5, '12 bis rue _TEST Comparable']]);
    expect([e[1].s.startsWith('INSERT INTO gestion_journal'), e[1].s.includes("'immeuble_copropriete'"), e[1].p.slice(0, 3)]).toEqual([true, true, [5, '12bis rue _TEST Comparable', '12 bis rue _TEST Comparable']]);
    expect(String(ecritures()[1].p[3])).toContain('une seule copropriété par adresse');
  });
  it('déjà l’adresse EXACTE d’une copropriété : rien ; aucune copropriété ne porte l’adresse : rien (aucune copropriété créée ici)', async () => {
    h.deja = 1;
    expect(await rattacherBienALaCoproprieteDeSonAdresse(q as never, 5, AUTEUR)).toBe(false);
    h.deja = 0; h.conflit = null;
    expect(await rattacherBienALaCoproprieteDeSonAdresse(q as never, 5, AUTEUR)).toBe(false);
    expect(ecritures()).toEqual([]);
  });
  it('un bien IMPORTÉ (WIPPIMMO) garde son « Immeuble » ; un bien inconnu : rien', async () => {
    h.lot = { ...h.lot!, wippimmo_id: '12345' };
    expect(await rattacherBienALaCoproprieteDeSonAdresse(q as never, 5, AUTEUR)).toBe(false);
    h.lot = null;
    expect(await rattacherBienALaCoproprieteDeSonAdresse(q as never, 5, AUTEUR)).toBe(false);
    expect([ecritures(), conflit.mock.calls.length]).toEqual([[], 0]);
  });
  it('tous les parcours passent par là : création (logement et annexes), annexes ajoutées, écriture des digicodes d’un bien, changement d’adresse', async () => {
    const { readFileSync } = await import('node:fs');
    const creation = readFileSync('app/lib/location/creationBienRepo.ts', 'utf8');
    expect(creation.match(/await rattacherBienALaCoproprieteDeSonAdresse\(q, /g)?.length).toBe(3);
    expect(readFileSync('app/lib/gestion/digicodesBienRepo.ts', 'utf8')).toContain('if (await rattacherBienALaCoproprieteDeSonAdresse(q, lotId, auteur) && compte !== undefined) compte.ecrit += 1;');
    const loc = readFileSync('app/lib/location/locationRepo.ts', 'utf8');
    expect(loc).toContain("await q('UPDATE gestion_annuaire_lot SET immeuble = $2 WHERE id = $1', [lotId, c.adresse]);");
    expect(loc).toContain('await rattacherBienALaCoproprieteDeSonAdresse(q, lotId, auteur);');
  });
});
