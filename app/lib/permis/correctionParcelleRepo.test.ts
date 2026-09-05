import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 101 → PL-C5 — le chemin MUTANT (candidatsCorrectionParcelle / corrigerParcelle, qui gelait la ligne en origine='saisie') est
 * RETIRÉ ; seule subsiste `annulerCorrectionParcelle` (dégeler une ligne héritée). `db/client` mocké (routé par fragment SQL),
 * `parcellesRepo` (figerEmpreinte/lecture) mocké : on prouve la restauration de la référence d'origine + le recompute.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { correction: null as unknown }; // valeur de la colonne correction lue avant annulation
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = norm(sql); appels.push({ sql: s, params: params ?? [] });
    if (/SELECT correction FROM permis_parcelle/i.test(s)) return { rows: [{ correction: state.correction }], rowCount: 1 };
    if (/UPDATE permis_parcelle/i.test(s)) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));
vi.mock('./parcellesRepo', () => ({
  figerEmpreinte: vi.fn(async () => ({ surfaceM2: null, nbParcelles: 1, complete: false, motif: 'x', millesime: null, aGeometrie: false })),
  lireParcellesPermis: vi.fn(async () => []),
  lireEmpreintePermis: vi.fn(async () => null),
}));

import { annulerCorrectionParcelle } from './correctionParcelleRepo';
import { figerEmpreinte } from './parcellesRepo';

const up = () => H.appels.filter((a) => /UPDATE permis_parcelle/i.test(a.sql));
beforeEach(() => { H.appels.length = 0; H.queryMock.mockClear(); vi.mocked(figerEmpreinte).mockClear(); H.state.correction = null; });

describe('annulerCorrectionParcelle — DÉGÈLE une ligne héritée (restaure la référence d’origine)', () => {
  it('correction présente → restaure DK 649, origine=extraite (DÉGELÉE), vide le snapshot + recompute', async () => {
    H.state.correction = { refOrigine: { prefixe: '000', section: 'DK', numero: '649', idu: '75119000DK0649' } };
    const r = await annulerCorrectionParcelle(468, 25052, 'arno');
    expect(r.annule).toBe(true);
    const u = up()[0];
    expect(u.sql).toContain("origine = 'extraite'");   // 🔑 la ligne se DÉGÈLE (plus 'saisie' → re-purgeable/re-dérivable)
    expect(u.sql).toContain('geom_snapshot = NULL');
    expect(u.sql).toContain('correction = NULL');
    expect(u.params).toContain('75119000DK0649');       // référence d'origine restaurée
    expect(vi.mocked(figerEmpreinte)).toHaveBeenCalledWith(468, 'arno');
  });
  it('aucune correction → annule:false (rien à annuler), jamais un état vide inventé', async () => {
    H.state.correction = null;
    expect(await annulerCorrectionParcelle(468, 25052, 'arno')).toEqual({ ok: true, annule: false });
    expect(up()).toHaveLength(0);
  });
  it('migration `correction` absente (42703) → « rien à annuler », jamais une exception', async () => {
    H.queryMock.mockImplementationOnce(async () => { const e = new Error('42703') as Error & { code: string }; e.code = '42703'; throw e; });
    expect(await annulerCorrectionParcelle(468, 25052, 'arno')).toEqual({ ok: true, annule: false });
  });
});
