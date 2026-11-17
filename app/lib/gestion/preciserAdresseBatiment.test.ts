import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété ») — « 1. Bâtiment dont l'adresse n'est pas déductible → « adresse à préciser » sur la
 * fiche Copropriété, choix par Arno ; jamais deviné. » 🔒 Base simulée : rien n'est écrit en base réelle.
 */
const h = vi.hoisted(() => ({ avec490: true, deja: 0, maj: 1, sql: [] as { s: string; p: unknown[] }[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT count(*)::int AS n FROM gestion_copropriete_batiment x')) return { rows: [{ n: h.deja }] };
  if (s.startsWith('UPDATE gestion_copropriete_batiment SET adresse_cle')) return { rows: [], rowCount: h.maj };
  return { rows: [], rowCount: 0 };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (fn: (x: typeof q) => Promise<unknown>) => fn(q) }));
vi.mock('./batimentRetraitRepo', async (orig) => ({ ...(await orig<typeof import('./batimentRetraitRepo')>()), registreParAdresse: async () => h.avec490 }));
vi.mock('./coproprieteRepo', async (orig) => ({ ...(await orig<typeof import('./coproprieteRepo')>()), ficheCopropriete: async () => ({
  cle: '1 rue test deux adresses', id: 271, libelle: '1 rue _TEST Deux Adresses', batimentsAPreciser: [{ id: 40, libelle: 'D' }],
  adresses: [{ cle: '1 rue test deux adresses', libelle: '1 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine' },
    { cle: '3 rue test deux adresses', libelle: '3 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine' }] }) }));
const { preciserAdresseBatiment } = await import('./coproprieteEcritureRepo');
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const CORPS = { immeuble: '1 rue _TEST Deux Adresses', batimentId: 40, adresseCle: '3 rue test deux adresses' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
beforeEach(() => { h.avec490 = true; h.deja = 0; h.maj = 1; h.sql = []; });

describe('🔴 l’adresse d’un bâtiment « à préciser », choisie par Arno', () => {
  it('l’adresse choisie est notée — seulement si le bâtiment n’en avait pas (jamais réécrite)', async () => {
    expect((await preciserAdresseBatiment(CORPS, AUTEUR)).ok).toBe(true);
    expect(ecritures().map((x) => [x.s, x.p])).toEqual([['UPDATE gestion_copropriete_batiment SET adresse_cle = $3 WHERE id = $1 AND copropriete_id = $2 AND adresse_cle IS NULL', [40, 271, '3 rue test deux adresses']]]);
  });
  it('refus clairs, rien d’écrit : une adresse hors de la copropriété ; un bâtiment du même nom déjà à cette adresse (dit) ; pas « à préciser » ; déjà précisé ; sans la 490', async () => {
    expect(await preciserAdresseBatiment({ ...CORPS, adresseCle: '9 rue ailleurs' }, AUTEUR)).toEqual({ ok: false, motif: 'Choisissez une adresse de cette copropriété. Rien n’est enregistré.' });
    h.deja = 1;
    expect(await preciserAdresseBatiment(CORPS, AUTEUR)).toEqual({ ok: false, motif: 'Le bâtiment D existe déjà au 3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine : choisissez une autre adresse. Rien n’est enregistré.' });
    h.deja = 0;
    expect((await preciserAdresseBatiment({ ...CORPS, batimentId: 41 }, AUTEUR)).ok).toBe(false);
    h.maj = 0;
    expect(await preciserAdresseBatiment(CORPS, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('a déjà son adresse') });
    h.avec490 = false;
    expect(await preciserAdresseBatiment(CORPS, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 490') });
    expect(ecritures().filter((x) => x.s.startsWith('UPDATE') && h.maj === 1)).toEqual([]);
  });
});
