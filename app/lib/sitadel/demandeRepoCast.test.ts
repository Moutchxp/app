import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * S14e — verrou du CAST int8→int sur les identifiants de demande renvoyés au client. `demande.id` est un bigint que
 * node-postgres rend en CHAÎNE ; sans `d.id::int AS id`, l'id part au client en string et la PATCH groupée (filtre
 * Number.isInteger) l'écarte en silence. On capture le SQL émis via un mock de `../db/client`.
 */
const { sqls, queryMock } = vi.hoisted(() => {
  const sqls: string[] = [];
  return {
    sqls,
    queryMock: async (text: string) => { sqls.push(text); return { rows: [] as unknown[] }; },
  };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: async () => undefined,
  pool: {},
  closePool: async () => undefined,
}));

import { listerDemandes, lireDemande } from './demandeRepo';

beforeEach(() => { sqls.length = 0; });

describe('S14e — cast int8 des id de demande (round-trip client → PATCH groupée)', () => {
  it('listerDemandes caste d.id::int AS id', async () => {
    await listerDemandes();
    expect(sqls.some((s) => /d\.id::int\s+AS\s+id/.test(s))).toBe(true);
  });

  it('lireDemande caste d.id::int AS id', async () => {
    await lireDemande(1);
    expect(sqls.some((s) => /d\.id::int\s+AS\s+id/.test(s))).toBe(true);
  });
});
