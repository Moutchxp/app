import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GET /api/internaute/session — réutilise `exigerInternaute` (mocké). PROUVE : toujours 200, `{connecte}` seul (aucune
 * PII), refus → false, succès → true, erreur → false (fail-closed), `Cache-Control: no-store`.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/internaute/authGarde', () => ({ exigerInternaute }));

import { GET } from './route';

const req = () => new Request('http://localhost/api/internaute/session');

describe('GET /api/internaute/session', () => {
  beforeEach(() => { exigerInternaute.mockReset(); });

  it('connecté → 200 { connecte: true } + no-store, AUCUNE autre donnée', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'uuid-1' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ connecte: true }); // strictement le booléen, jamais l'id
  });

  it('non connecté (refus) → 200 { connecte: false }', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await GET(req());
    expect(res.status).toBe(200); // jamais 401
    expect(await res.json()).toEqual({ connecte: false });
  });

  it('erreur base (garde qui lève) → 200 { connecte: false } (fail-closed)', async () => {
    exigerInternaute.mockImplementation(() => { throw new Error('db down'); });
    const res = await GET(req());
    expect(res.status).toBe(200); // jamais 500
    expect(await res.json()).toEqual({ connecte: false });
  });
});
