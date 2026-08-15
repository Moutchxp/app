import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N3-E — dépôt des parcelles. `db/client` mocké (routé par fragment SQL). On éprouve : la purge CIBLÉE 'extraite' (recompute
 * idempotent, jamais la saisie), l'INSERT ON CONFLICT DO NOTHING (invariant : une saisie occupant la clé n'est pas écrasée), et
 * que les paramètres LIÉS portent l'IDU/confiance/réserve/provenance décidés.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { insertRowCount: 1 };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/INSERT\s+INTO\s+permis_parcelle/i.test(sql)) return { rows: [], rowCount: state.insertRowCount };
    return { rows: [], rowCount: 0 };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireParcelles } from './parcellesRepo';
import type { ParcelleDecision } from './decisionParcelles';

const p = (over: Partial<ParcelleDecision> = {}): ParcelleDecision => ({
  prefixe: '000', section: 'DZ', numero: '09', superficieDeclareeM2: 2631.5, role: 'origine',
  idu: '75120000DZ0009', confiance: 'confirmee', reserve: null, provenance: 'Cerfa', ...over,
});
const inserts = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_parcelle/i.test(a.sql));
const deletes = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_parcelle/i.test(a.sql));

beforeEach(() => { H.appels.length = 0; H.state.insertRowCount = 1; });

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
