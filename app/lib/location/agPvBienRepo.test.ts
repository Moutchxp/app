import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026) — « un PV saisi avant l'enregistrement du bien est rattaché à la copropriété à l'enregistrement » : à l'enregistrement, DANS la
 * transaction du bien, les PV vont dans la base officielle des PV de SA copropriété ; sans copropriété : la clé de son immeuble et le bien (« à rattacher
 * à une copropriété »), qui rejoignent d'eux-mêmes la copropriété. Base simulée ; données fictives « _TEST AG ».
 */
const h = vi.hoisted(() => ({ copro: true, sql: [] as { s: string; p: unknown[] }[] }));
const rep = async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT immeuble, adresse, code_postal, commune, adresse_normalisee, categorie')) return { rows: [{ immeuble: 'Résidence _TEST AG', adresse: '1 rue _TEST AG', code_postal: '75011', commune: 'PARIS', adresse_normalisee: null, categorie: 'appartement', copropriete: true }] };
  if (s.startsWith('SELECT c.id::text, c.libelle, c.cle_immeuble AS cle FROM gestion_copropriete c')) return { rows: h.copro ? [{ id: '5', libelle: 'Résidence _TEST AG', cle: 'residence test ag' }] : [] };
  return { rows: [] };
};
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => rep(s, p), withTransaction: (fn: (q: unknown) => Promise<unknown>) => fn((s: string, p?: unknown[]) => rep(s, p)) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nomFamille: 'Jorel' }) }));
const { ajouterPvsDuBien } = await import('./agCoproprieteRepo');
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const q = (s: string, p?: unknown[]) => rep(s, p);
const insertions = () => h.sql.filter((x) => x.s.startsWith('INSERT'));
beforeEach(() => { h.copro = true; h.sql = []; });

describe('🔴🔴 à l’enregistrement du bien', () => {
  it('le bien a une copropriété : ses PV y vont (dernière AG tenue, officielle, AGO / AGE, note, QUI) — ajout seul', async () => {
    expect(await ajouterPvsDuBien(q as never, 77, [{ date: '2024-03-12', nature: 'ago', note: null }, { date: '2025-06-01', nature: 'age', note: '_TEST AG' }], AUTEUR)).toBe(2);
    expect(insertions().map((x) => x.p)).toEqual([[5, null, null, '2024-03-12', 2, 'Arnaud JOREL', 'ago', null], [5, null, null, '2025-06-01', 2, 'Arnaud JOREL', 'age', '_TEST AG']]);
    expect(insertions()[0].s).toContain("VALUES ($1, $2, $3, 'derniere', 'officielle', $4::date, 'fiche_copropriete', $5, $6, $7, $8)");
    expect(h.sql.some((x) => /^(UPDATE|DELETE)\b/.test(x.s))).toBe(false);
  });
  it('aucune copropriété : la clé de son immeuble et le bien (« à rattacher à une copropriété ») ; rien saisi : rien écrit', async () => {
    h.copro = false;
    await ajouterPvsDuBien(q as never, 77, [{ date: '2024-03-12', nature: 'ago', note: null }], AUTEUR);
    expect(insertions()[0].p.slice(0, 3)).toEqual([null, 'residence test ag', 77]);
    h.sql = [];
    expect(await ajouterPvsDuBien(q as never, 77, [], AUTEUR)).toBe(0);
    expect(insertions()).toEqual([]);
  });
});
