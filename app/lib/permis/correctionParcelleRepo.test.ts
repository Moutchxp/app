import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 101 — correction manuelle de parcelle. `db/client` mocké (routé par fragment SQL), `parcellesRepo` (figerEmpreinte/…) mocké
 * (on éprouve le COMPORTEMENT, pas le recompute). On prouve : candidates proposées avec contenance ; correction validée contre le
 * cadastre (refus si inexistante) + trace 'saisie'/correction + recompute déclenché ; migration absente → repli ; annulation restaure.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    row: { prefixe: '000', section: 'DK', numero: '649', idu: '75119000DK0649', superficie: null as number | null },
    candidats: [
      { id: '75119000DI0649', section: 'DI', numero: '649', contenance: 76, motif: 'meme-numero-autre-section' },
      { id: '75119000DK0648', section: 'DK', numero: '648', contenance: 117, motif: 'meme-section-numero-proche' },
    ],
    existe: true,                              // la référence choisie existe au cadastre
    migrationAbsente: false,                   // true → l'UPDATE avec `correction` jette 42703
    correction: null as unknown,               // valeur de la colonne correction (annulation)
  };
  const err = (code: string) => { const e = new Error(code) as Error & { code: string }; e.code = code; throw e; };
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
    const s = norm(sql); appels.push({ sql: s, params: params ?? [] });
    if (/SELECT prefixe, section, numero, idu, superficie_declaree_m2/i.test(s)) return { rows: [state.row], rowCount: 1 };
    if (/SELECT prefixe, section, numero, idu FROM permis_parcelle/i.test(s)) return { rows: [state.row], rowCount: 1 };
    if (/FROM parcelle WHERE commune/i.test(s)) return { rows: state.candidats, rowCount: state.candidats.length }; // candidates
    if (/EXISTS\(SELECT 1 FROM parcelle WHERE id/i.test(s)) return { rows: [{ ok: state.existe }], rowCount: 1 };
    if (/SELECT correction FROM permis_parcelle/i.test(s)) return { rows: [{ correction: state.correction }], rowCount: 1 };
    if (/UPDATE permis_parcelle/i.test(s)) { if (state.migrationAbsente && /correction = jsonb_build_object/i.test(s)) err('42703'); return { rows: [], rowCount: 1 }; }
    return { rows: [], rowCount: 0 };
  });
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));
vi.mock('./parcellesRepo', () => ({
  figerEmpreinte: vi.fn(async () => ({ surfaceM2: 76.8, nbParcelles: 1, complete: true, motif: null, millesime: null, aGeometrie: true })),
  figerBatiSnapshot: vi.fn(async () => ({ capture: true, nbBatiments: 0, motif: null, sourceMillesime: null, batiments: [] })),
  lireParcellesPermis: vi.fn(async () => []),
  lireEmpreintePermis: vi.fn(async () => ({ surfaceM2: 76.8, nbParcelles: 1, complete: true, motif: null, millesime: null, aGeometrie: true })),
}));

import { candidatsCorrectionParcelle, corrigerParcelle, annulerCorrectionParcelle } from './correctionParcelleRepo';
import { figerEmpreinte } from './parcellesRepo';

const up = () => H.appels.filter((a) => /UPDATE permis_parcelle/i.test(a.sql));
beforeEach(() => {
  H.appels.length = 0; H.queryMock.mockClear(); vi.mocked(figerEmpreinte).mockClear();
  Object.assign(H.state, { row: { prefixe: '000', section: 'DK', numero: '649', idu: '75119000DK0649', superficie: null }, existe: true, migrationAbsente: false, correction: null });
});

describe('candidatsCorrectionParcelle — candidates AVEC contenance, deux stratégies', () => {
  it('propose les candidates du cadastre avec leur contenance + la référence courante', async () => {
    const r = await candidatsCorrectionParcelle(468, 25052);
    expect(r?.commune).toBe('75119');                    // dérivée de l'IDU
    expect(r?.candidats.map((c) => `${c.section} ${c.numero} ${c.contenance}`)).toContain('DI 649 76');
    // les deux stratégies SQL sont émises (même numéro autre section ; même section numéro proche).
    const sql = H.appels.find((a) => /FROM parcelle WHERE commune/i.test(a.sql))!.sql;
    expect(sql).toContain('numero = $2 AND section <> $3');
    expect(sql).toContain('section = $3 AND numero');
  });
});

describe('corrigerParcelle — validée contre le cadastre, tracée « saisie », recompute', () => {
  it('référence existante → UPDATE origine=saisie + correction jsonb + figerEmpreinte appelé', async () => {
    const r = await corrigerParcelle(468, 25052, { section: 'DI', numero: '649', prefixe: null }, 'arno');
    expect(r.ok).toBe(true);
    const u = up()[0];
    expect(u.sql).toContain("origine = 'saisie'");
    expect(u.sql).toContain('correction = jsonb_build_object');
    expect(u.params).toContain('75119000DI0649');        // nouvel IDU validé, lié
    expect(vi.mocked(figerEmpreinte)).toHaveBeenCalledWith(468, 'arno'); // empreinte RECALCULÉE
  });
  it('référence INEXISTANTE au cadastre → refus explicite, aucun UPDATE, aucun recompute', async () => {
    H.state.existe = false;
    const r = await corrigerParcelle(468, 25052, { section: 'ZZ', numero: '9999', prefixe: null }, 'arno');
    expect(r).toEqual({ ok: false, motif: 'reference_inexistante' });
    expect(up()).toHaveLength(0);
    expect(vi.mocked(figerEmpreinte)).not.toHaveBeenCalled();
  });
  it('migration 197 absente (42703) → repli propre « migration_requise », jamais une exception', async () => {
    H.state.migrationAbsente = true;
    const r = await corrigerParcelle(468, 25052, { section: 'DI', numero: '649', prefixe: null }, 'arno');
    expect(r).toEqual({ ok: false, motif: 'migration_requise' });
  });
});

describe('annulerCorrectionParcelle — restaure la référence d’origine (état d’avant)', () => {
  it('correction présente → restaure DK 649, origine extraite, vide le snapshot + recompute', async () => {
    H.state.correction = { refOrigine: { prefixe: '000', section: 'DK', numero: '649', idu: '75119000DK0649' } };
    const r = await annulerCorrectionParcelle(468, 25052, 'arno');
    expect(r.annule).toBe(true);
    const u = up()[0];
    expect(u.sql).toContain("origine = 'extraite'");
    expect(u.sql).toContain('geom_snapshot = NULL');
    expect(u.params).toContain('75119000DK0649');        // référence d'origine restaurée
    expect(vi.mocked(figerEmpreinte)).toHaveBeenCalledWith(468, 'arno');
  });
  it('aucune correction → annule:false (rien à annuler), jamais un état vide inventé', async () => {
    H.state.correction = null;
    expect(await annulerCorrectionParcelle(468, 25052, 'arno')).toEqual({ ok: true, annule: false });
    expect(up()).toHaveLength(0);
  });
});
