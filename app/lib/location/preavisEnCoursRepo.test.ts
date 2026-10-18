import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Qui est en préavis ? — lecture seule, base simulée ; sans la migration 383, rien. */
const query = vi.fn(async (..._a: unknown[]) => ({ rows: [{ locataire_id: '92', date_max: '2026-11-30' }] }));
let schema = true;
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => schema }));

import { locatairesEnPreavis } from './preavisEnCoursRepo';

beforeEach(() => { query.mockClear(); schema = true; });

describe('locatairesEnPreavis', () => {
  it('préavis OUVERT sur une occupation EN COURS ; filtré par bien si demandé ; paramètres liés', async () => {
    expect(await locatairesEnPreavis([92, 93, 92], { lotId: 25 })).toEqual({ 92: '2026-11-30' });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    const s = sql.replace(/\s+/g, ' ');
    expect(s).toContain('p.remplace_le IS NULL AND p.annule_le IS NULL AND o.sortie IS NULL');
    expect(s).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(params).toEqual([[92, 93], 25]);
  });

  it('sans personne, ou sans la migration 383 : aucune lecture, rien', async () => {
    expect(await locatairesEnPreavis([])).toEqual({});
    schema = false;
    expect(await locatairesEnPreavis([92])).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});
