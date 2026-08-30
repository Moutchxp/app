import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PART-2 / PERF-2 — routes /permis/completude. On MOCKE la garde + le repo : ce fichier teste le COMPORTEMENT (garde admin,
 * validation dossierId, GET lecture, POST recalcul non bloquant, relais du diagnostic à jour, 503 → le client dira l'échec).
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/permis/completudeRepo', () => ({ lireCompletude: vi.fn(), recalculerCompletude: vi.fn() }));

import { GET, POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCompletude, recalculerCompletude } from '../../../../../lib/permis/completudeRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const lire = lireCompletude as unknown as ReturnType<typeof vi.fn>;
const recalc = recalculerCompletude as unknown as ReturnType<typeof vi.fn>;

const get = (id: unknown) => GET(new Request(`http://test/api/admin/permis/completude?dossierId=${id}`));
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/completude', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const DIAG = { diagnostic: { lignes: [{ presente: true }], desaccords: [], nonClassees: [] }, calculeLe: '2026-08-30T00:00:00.000Z', perime: false };

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  lire.mockResolvedValue(DIAG);
  recalc.mockResolvedValue(DIAG);
});

describe('PART-2 — GET /permis/completude', () => {
  it('non-administrateur → refus', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await get(7424)).status).toBe(403);
  });
  it('dossierId invalide → 400, aucune lecture', async () => {
    expect((await get('x')).status).toBe(400);
    expect(lire).not.toHaveBeenCalled();
  });
  it('lecture → { completude }', async () => {
    const res = await get(7424);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completude: DIAG });
  });
});

describe('PERF-2 — POST /permis/completude (recalcul auto non bloquant)', () => {
  it('non-administrateur → refus, aucun recalcul', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await post({ dossierId: 7424 })).status).toBe(403);
    expect(recalc).not.toHaveBeenCalled();
  });
  it('dossierId invalide → 400, aucun recalcul', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ dossierId: 0 })).status).toBe(400);
    expect(recalc).not.toHaveBeenCalled();
  });
  it('recalcul → diagnostic à jour relayé (calculePar « completude:auto »)', async () => {
    const res = await post({ dossierId: 7424 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completude: DIAG });
    expect(recalc).toHaveBeenCalledWith(7424, 'completude:auto');
  });
  it('recalcul en échec → 503 (le client dira l’échec, sans faux bilan ni boucle)', async () => {
    recalc.mockRejectedValueOnce(new Error('boom'));
    expect((await post({ dossierId: 7424 })).status).toBe(503);
  });
});
