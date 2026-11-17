import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété », lot 3) — « les écritures par adresse ; l'unicité (copropriété, nom) est remplacée par
 * (copropriété, adresse, nom) : un « A » est accepté à une autre adresse de la même copropriété, refusé une seconde fois à la même adresse. »
 * 🔒 Base simulée : un petit registre en mémoire, qui applique l'unicité (copropriété, adresse, nom) de la 489-490 ; rien n'est écrit en base réelle.
 */
const h = vi.hoisted(() => ({ avec490: true, registre: [] as { id: number; copro: string; cle: string; adresse: string | null }[], prochain: 1,
  sql: [] as { s: string; p: unknown[] }[], lot: { immeuble: '9 rue _TEST X' as string | null, adresse: '9 rue _TEST X' as string | null, bat: null as string | null } }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.includes("indexname = 'gestion_copropriete_batiment_sans_adresse_unique'")) return { rows: [{ ok: h.avec490 }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble')) return { rows: [{ id: '7' }] };
  if (s.startsWith('INSERT INTO gestion_copropriete_batiment ')) {
    const adresse = s.includes('adresse_cle) VALUES') ? String(p[6]) : null;
    if (h.registre.some((r) => r.copro === p[0] && r.cle === p[1] && r.adresse === adresse)) return { rows: [] }; // ON CONFLICT … DO NOTHING
    h.registre.push({ id: h.prochain++, copro: String(p[0]), cle: String(p[1]), adresse }); return { rows: [] };
  }
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2 AND adresse_cle = $3')) return { rows: [{ id: '99' }] };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_batiment WHERE copropriete_id = $1 AND batiment_cle = $2 AND adresse_cle IS NOT DISTINCT FROM $3')) {
    return { rows: h.registre.filter((r) => r.copro === p[0] && r.cle === p[1] && r.adresse === p[2]).map((r) => ({ id: String(r.id) })) };
  }
  if (s.startsWith('SELECT l.copropriete_batiment_id::text AS id')) return { rows: [{ id: h.lot.bat, libelle: null, immeuble: h.lot.immeuble, adresse: h.lot.adresse }] };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { inscrireBatiment, relierBienAuBatiment } = await import('./digicodesRepo');
const { cleBatimentAdresse, estRetire, oublierRegistreParAdresse } = await import('./batimentRetraitRepo');
const { appliquerPlanBatiments } = await import('./batimentsParAdresseRepo');
const { planBatimentsParAdresse } = await import('./batimentsParAdresse');
import type { RequeteTx } from '../db/client';
const tx = q as unknown as RequeteTx;
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const COPRO = { cle: '7 rue test x', libelle: '7 rue _TEST X', codePostal: '92600', commune: 'Asnières-sur-Seine' };
beforeEach(() => { h.avec490 = true; h.registre = []; h.prochain = 1; h.sql = []; h.lot = { immeuble: '9 rue _TEST X', adresse: '9 rue _TEST X', bat: null }; oublierRegistreParAdresse(); });

describe('🔴 un nom de bâtiment unique PAR ADRESSE', () => {
  it('« A » au 7 et « A » au 9 de la même copropriété : DEUX bâtiments distincts ; un second « A » au 7 : le même (jamais un doublon)', async () => {
    const a7 = await inscrireBatiment(tx, { ...COPRO, adresseCle: '7 rue test x' }, 'A', AUTEUR);
    const a9 = await inscrireBatiment(tx, { ...COPRO, adresseCle: '9 rue test x' }, 'A', AUTEUR);
    const encore = await inscrireBatiment(tx, { ...COPRO, adresseCle: '7 rue test x' }, 'a', AUTEUR);
    expect([a7, a9, encore]).toEqual([1, 2, 1]);
    expect(h.registre.map((r) => [r.cle, r.adresse])).toEqual([['a', '7 rue test x'], ['a', '9 rue test x']]);
    expect(h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment ')).every((x) => x.s.includes('ON CONFLICT (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL DO NOTHING'))).toBe(true);
  });
  it('le bien est relié au bâtiment de SON adresse (son « Immeuble ») ; le journal du bien le dit', async () => {
    expect(await relierBienAuBatiment(tx, 451, COPRO, 'A', AUTEUR)).toEqual({ ok: true, change: true });
    expect(h.registre.map((r) => [r.cle, r.adresse])).toEqual([['a', '9 rue test x']]);
    expect(h.sql.find((x) => x.s.startsWith('UPDATE gestion_annuaire_lot SET copropriete_batiment_id'))?.p).toEqual([451, 1]);
  });
  it('sans la 490 : comme avant (un nom unique dans toute la copropriété)', async () => {
    h.avec490 = false;
    await inscrireBatiment(tx, { ...COPRO, adresseCle: '9 rue test x' }, 'A', AUTEUR);
    expect(h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment '))?.s).toContain('ON CONFLICT (copropriete_id, batiment_cle) DO NOTHING');
    expect(h.registre.map((r) => r.adresse)).toEqual([null]);
  });
  it('retiré à SON adresse : le « A » retiré du 7 ne retire pas celui du 9 ; retiré sans adresse : partout (comme avant)', () => {
    const r = new Set([cleBatimentAdresse('7 rue test x', 'a'), cleBatimentAdresse(null, 'c')]);
    expect([estRetire(r, '7 rue test x', 'a'), estRetire(r, '9 rue test x', 'a'), estRetire(r, '9 rue test x', 'c')]).toEqual([true, false, true]);
  });
});

/** 🔴 Arno (17/11/2026) — « Lot 3 : la reprise réelle en recette selon le rapport (rien effacé) ». */
describe('🔴 la reprise réelle : le plan appliqué, rien effacé', () => {
  const COPROS = [{ id: 1, libelle: '7 rue _TEST Digicode', adresses: [{ cle: '7 rue test digicode', libelle: '7 rue _TEST Digicode' }] },
    { id: 2, libelle: '7 rue _TEST X', adresses: [{ cle: '7 rue test x', libelle: '7 rue _TEST X' }, { cle: '9 rue test x', libelle: '9 rue _TEST X' }] }];
  const plan = () => planBatimentsParAdresse(COPROS, [
    { id: 2, coproId: 1, cle: 'a', libelle: 'A', adresseCle: null },
    { id: 10, coproId: 2, cle: 'a', libelle: 'A', adresseCle: null },
    { id: 12, coproId: 2, cle: 'c', libelle: 'C', adresseCle: null }],
  [{ adresseCle: '9 rue test x', batimentCle: 'a' }], [{ lotId: 5, batimentId: 10, immeuble: '7 rue _TEST X', adresse: null }, { lotId: 6, batimentId: 10, immeuble: '9 rue _TEST X', adresse: null }]);
  it('les adresses notées (seulement si vides) ; la séparation : un nouveau bâtiment, le bien de l’autre adresse le suit (journal) ; « à préciser » intact ; aucun DELETE', async () => {
    await appliquerPlanBatiments(plan(), AUTEUR);
    const ecr = h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
    expect(ecr.filter((x) => x.s.startsWith('UPDATE gestion_copropriete_batiment SET adresse_cle')).map((x) => x.p)).toEqual([[2, '7 rue test digicode'], [10, '7 rue test x']]);
    expect(ecr.filter((x) => x.s.startsWith('UPDATE gestion_copropriete_batiment SET adresse_cle')).every((x) => x.s.endsWith('WHERE id = $1 AND adresse_cle IS NULL'))).toBe(true);
    expect(ecr.find((x) => x.s.startsWith('INSERT INTO gestion_copropriete_batiment '))?.p).toEqual([10, 2, 'a.jorel@sansvisavis.com', '9 rue test x']);
    expect(ecr.find((x) => x.s.startsWith('UPDATE gestion_annuaire_lot SET copropriete_batiment_id'))?.p).toEqual([6, '99', 10]);
    expect(ecr.some((x) => x.s.startsWith('INSERT INTO gestion_journal') && x.p[0] === 6)).toBe(true);
    expect(ecr.some((x) => x.p[0] === 12)).toBe(false); // « à préciser » : rien
    expect(ecr.some((x) => x.s.startsWith('DELETE'))).toBe(false);
  });
  it('sans la 490 : refus, rien n’est écrit', async () => {
    h.avec490 = false;
    await expect(appliquerPlanBatiments(plan(), AUTEUR)).rejects.toThrow('Migration 490 absente');
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s))).toBe(false);
  });
});

