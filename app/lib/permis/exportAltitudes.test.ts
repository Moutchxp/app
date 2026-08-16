import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * FUS-3f — EXPORT du registre : rendu texte PUR (sans base) + adaptateurs par polygone / par parcelle (`db/client` mocké).
 */
const H = vi.hoisted(() => {
  const state = { present: true, cur: null as null | { alt: number; origine: string }, hist: [] as Record<string, unknown>[], cleabsParcelle: [] as string[] };
  const queryMock = async (sql: string) => {
    if (/to_regclass/i.test(sql)) return { rows: state.present ? [{ t: 'permis_altitude_journal' }] : [{ t: null }] };
    if (/FROM permis_polygone_altitude WHERE cleabs/i.test(sql)) return { rows: state.cur ? [{ alt: state.cur.alt, origine: state.cur.origine }] : [] };
    if (/FROM permis_altitude_journal WHERE cleabs/i.test(sql)) return { rows: state.hist };
    if (/SELECT DISTINCT b\.cleabs[\s\S]*permis_parcelle/i.test(sql)) return { rows: state.cleabsParcelle.map((c) => ({ cleabs: c })) };
    return { rows: [] };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { exporterParPolygone, exporterParParcelle, rendreTextePiece, type PieceExport } from './exportAltitudes';

beforeEach(() => { Object.assign(H.state, { present: true, cur: null, hist: [], cleabsParcelle: [] }); });

describe('rendreTextePiece (PUR)', () => {
  const piece: PieceExport = {
    cle: { type: 'polygone', valeur: 'BAT_A' }, genereLe: '2026-08-16T10:00:00.000Z',
    polygones: [{
      cleabs: 'BAT_A', altitudeCourante: 88.9, origineCourante: 'permis',
      historique: [
        { enregistreLe: '2026-03-20T00:00:00.000Z', origine: 'lidar', cause: 'import', altitudeNgf: 42, sourceType: 'bdtopo', sourceMillesime: 'inconnu', sourceDate: '2026-03-20', dossierId: null, note: 'départ' },
        { enregistreLe: '2026-08-16T09:00:00.000Z', origine: 'permis', cause: 'injection', altitudeNgf: 88.9, sourceType: 'permis', sourceMillesime: null, sourceDate: null, dossierId: 11434, note: 'inj' },
      ],
    }],
  };
  it('rend une attestation lisible avec provenance et millésime inconnu explicite', () => {
    const t = rendreTextePiece(piece);
    expect(t).toContain('polygone BAT_A');
    expect(t).toContain('88.9 NGF');
    expect(t).toContain('import BD TOPO');
    expect(t).toContain('injection permis');
    expect(t).toContain('millésime inconnu'); // jamais une date supposée
  });
  it('clé sans polygone → message explicite, pas de crash', () => {
    expect(rendreTextePiece({ cle: { type: 'parcelle', valeur: 'X' }, genereLe: null, polygones: [] })).toContain('Aucun polygone');
  });
});

describe('exporterParPolygone', () => {
  it('registre absent → avertissement, aucune donnée', async () => {
    H.state.present = false;
    const p = await exporterParPolygone('BAT_A');
    expect(p.avertissement).toMatch(/migration 118/i);
    expect(p.polygones).toEqual([]);
  });
  it('registre présent → état courant + historique numérisé', async () => {
    H.state.cur = { alt: 88.9, origine: 'permis' };
    H.state.hist = [{ enregistre_le: '2026-03-20', origine: 'lidar', cause: 'import', altitude_ngf: '42', source_type: 'bdtopo', source_millesime: 'inconnu', source_date: '2026-03-20', dossier_id: null, note: null }];
    const p = await exporterParPolygone('BAT_A', '2026-08-16T10:00:00.000Z');
    expect(p.polygones).toHaveLength(1);
    expect(p.polygones[0].altitudeCourante).toBe(88.9);
    expect(p.polygones[0].historique[0].altitudeNgf).toBe(42); // string → number
    expect(p.polygones[0].historique[0].sourceMillesime).toBe('inconnu');
  });
});

describe('exporterParParcelle', () => {
  it('résout les cleabs intersectant l’empreinte, puis exporte chacun', async () => {
    H.state.cleabsParcelle = ['BAT_A', 'BAT_B'];
    const p = await exporterParParcelle('75120000AB0042', '2026-08-16T10:00:00.000Z');
    expect(p.cle).toEqual({ type: 'parcelle', valeur: '75120000AB0042' });
    expect(p.polygones.map((x) => x.cleabs)).toEqual(['BAT_A', 'BAT_B']);
  });
});
