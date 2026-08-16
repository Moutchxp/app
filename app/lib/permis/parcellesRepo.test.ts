import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N3-E — dépôt des parcelles. `db/client` mocké (routé par fragment SQL). On éprouve : la purge CIBLÉE 'extraite' (recompute
 * idempotent, jamais la saisie), l'INSERT ON CONFLICT DO NOTHING (invariant : une saisie occupant la clé n'est pas écrasée), et
 * que les paramètres LIÉS portent l'IDU/confiance/réserve/provenance décidés.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { insertRowCount: 1, total: 2, avec: 2, unionSurface: 2886.3, unionNb: 2, unionMill: '2026-06-01' };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT\s+count\(\*\)::int\s+AS\s+total/i.test(sql)) return { rows: [{ total: state.total, avec: state.avec }], rowCount: 1 };
    if (/INSERT\s+INTO\s+permis_empreinte[\s\S]*RETURNING/i.test(sql)) return { rows: [{ surface: state.unionSurface, nb: state.unionNb, mill: state.unionMill }], rowCount: 1 };
    if (/INSERT\s+INTO\s+permis_parcelle/i.test(sql)) return { rows: [], rowCount: state.insertRowCount };
    return { rows: [], rowCount: 0 };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireParcelles, figerEmpreinte } from './parcellesRepo';
import type { ParcelleDecision } from './decisionParcelles';

const p = (over: Partial<ParcelleDecision> = {}): ParcelleDecision => ({
  prefixe: '000', section: 'DZ', numero: '09', superficieDeclareeM2: 2631.5, role: 'origine',
  idu: '75120000DZ0009', confiance: 'confirmee', reserve: null, provenance: 'Cerfa', ...over,
});
const inserts = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_parcelle/i.test(a.sql));
const deletes = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_parcelle/i.test(a.sql));

const snapshots = () => H.appels.filter((a) => /UPDATE\s+permis_parcelle[\s\S]*geom_snapshot/i.test(a.sql));
const empreintes = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_empreinte/i.test(a.sql));

beforeEach(() => { H.appels.length = 0; H.state.insertRowCount = 1; H.state.total = 2; H.state.avec = 2; H.state.unionSurface = 2886.3; H.state.unionNb = 2; H.state.unionMill = '2026-06-01'; });

describe('ecrireParcelles', () => {
  it('purge CIBLÉE origine=extraite (jamais la saisie), puis insère chaque parcelle avec ses paramètres liés', async () => {
    const r = await ecrireParcelles(1, [p(), p({ section: 'DZ', numero: '10', idu: '75120000DZ0010', superficieDeclareeM2: 255 })], 'auto');
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].sql).toMatch(/origine\s*=\s*'extraite'/i);      // ne touche jamais la saisie
    expect(inserts()).toHaveLength(2);
    expect(inserts()[0].sql).toMatch(/ON CONFLICT[\s\S]*DO NOTHING/i);  // invariant saisie
    expect(inserts()[0].params).toContain('75120000DZ0009');            // IDU lié
    expect(r).toEqual({ ecrites: 2, ignorees: 0 });
  });
  it('conflit (une saisie occupe la clé) → DO NOTHING → comptée « ignorée », jamais écrasée', async () => {
    H.state.insertRowCount = 0; // ON CONFLICT DO NOTHING → 0 ligne affectée
    const r = await ecrireParcelles(1, [p()], 'auto');
    expect(r).toEqual({ ecrites: 0, ignorees: 1 });
  });
});

describe('figerEmpreinte (FUS-1)', () => {
  it('toutes les parcelles rattachées → snapshot figé PUIS union calculée (complète, surface + millésime)', async () => {
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    // 1) le snapshot est copié depuis parcelle.geom (survit au réimport du cadastre)
    expect(snapshots()).toHaveLength(1);
    expect(snapshots()[0].sql).toMatch(/geom_snapshot\s*=\s*par\.geom/i);
    expect(snapshots()[0].sql).toMatch(/cadastre_millesime/i);       // millésime cadastral courant du dept
    // 2) union via ST_Union sur les snapshots, upsert complète
    const ins = empreintes();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).toMatch(/ST_Union\(geom_snapshot\)/i);
    expect(ins[0].sql).toMatch(/ON CONFLICT[\s\S]*dossier_id[\s\S]*DO UPDATE/i);
    expect(e).toEqual({ surfaceM2: 2886.3, nbParcelles: 2, complete: true, motif: null, millesime: '2026-06-01', aGeometrie: true });
  });

  it('UNE parcelle non rattachée → empreinte INCOMPLÈTE avec motif, JAMAIS d’union sur un sous-ensemble', async () => {
    H.state.total = 2; H.state.avec = 1; // 1 parcelle sans snapshot
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    const ins = empreintes();
    expect(ins).toHaveLength(1);
    expect(ins[0].sql).not.toMatch(/ST_Union/i);                     // pas d'union muette
    expect(ins[0].sql).toMatch(/complete\s*=\s*false/i);
    expect(e.complete).toBe(false);
    expect(e.motif).toContain('1 parcelle(s) d’origine non rattachée');
    expect(e.surfaceM2).toBeNull();
  });

  it('aucune parcelle d’origine → empreinte non calculable (motif), pas d’union', async () => {
    H.state.total = 0; H.state.avec = 0;
    const e = await figerEmpreinte(7, 'cerfa:parcelles');
    expect(empreintes()[0].sql).not.toMatch(/ST_Union/i);
    expect(e).toMatchObject({ complete: false, surfaceM2: null });
    expect(e.motif).toContain('aucune parcelle');
  });
});
