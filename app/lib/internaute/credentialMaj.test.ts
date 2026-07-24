import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Lecture de `internaute_auth.maj_a` en pleine précision (`::text`). On MOCKE `query` : aucune base réelle. */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { lireMajCredential } from './credentialMaj';

describe('lireMajCredential', () => {
  beforeEach(() => { query.mockReset(); });

  it('SELECT maj_a::text WHERE internaute_id = $1 → renvoie la valeur pleine précision', async () => {
    query.mockResolvedValue({ rows: [{ maj_a: '2026-07-24 21:00:00.123456+00' }] });
    const r = await lireMajCredential('A');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/SELECT maj_a::text AS maj_a FROM internaute_auth/);
    expect(sql).toMatch(/WHERE internaute_id = \$1/);
    expect(params).toEqual(['A']);
    expect(r).toBe('2026-07-24 21:00:00.123456+00'); // microsecondes conservées
  });

  it('aucune ligne (pas de credential) → null', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await lireMajCredential('A')).toBeNull();
  });
});
