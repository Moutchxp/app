import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GET /api/internaute/espace (Commit C) — PROUVE (a) : la route scope par l'internaute_id de SESSION (garde), JAMAIS par
 * un id de l'URL/corps. Une session A ne lit que les données de A même si l'URL tente d'injecter l'id de B ; une session
 * B ne voit que B ; sans session, 401 et aucune lecture. On mocke la garde et les accès données.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
const { listerAnalyses, listerCertificats } = vi.hoisted(() => ({ listerAnalyses: vi.fn(), listerCertificats: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../lib/internaute/espace', () => ({ listerAnalyses, listerCertificats }));

import { GET } from './route';

const req = (url = 'http://localhost/api/internaute/espace') => new Request(url);

describe('GET /api/internaute/espace — scope par SESSION (anti-IDOR)', () => {
  beforeEach(() => {
    exigerInternaute.mockReset();
    listerAnalyses.mockReset();
    listerCertificats.mockReset();
  });

  it('non authentifié → 401 (refus de la garde), AUCUNE lecture', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listerAnalyses).not.toHaveBeenCalled();
    expect(listerCertificats).not.toHaveBeenCalled();
  });

  it('(a) session A → lit UNIQUEMENT les données de A, même si l’URL tente d’injecter l’id de B', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'A' });
    listerAnalyses.mockResolvedValue([{ id: 1 }]);
    listerCertificats.mockResolvedValue([{ id: 2 }]);
    const res = await GET(req('http://localhost/api/internaute/espace?internauteId=B&id=B'));
    expect(res.status).toBe(200);
    expect(listerAnalyses).toHaveBeenCalledWith('A'); // id de SESSION, jamais de l'URL
    expect(listerCertificats).toHaveBeenCalledWith('A');
    expect(listerAnalyses).not.toHaveBeenCalledWith('B');
    expect(listerCertificats).not.toHaveBeenCalledWith('B');
  });

  it('session B → voit les données de B (jamais celles de A)', async () => {
    exigerInternaute.mockResolvedValue({ internauteId: 'B' });
    listerAnalyses.mockResolvedValue([]);
    listerCertificats.mockResolvedValue([]);
    await GET(req());
    expect(listerAnalyses).toHaveBeenCalledWith('B');
    expect(listerCertificats).toHaveBeenCalledWith('B');
  });
});
