import { describe, it, expect, beforeEach, vi } from 'vitest';

// On mocke la vérification JWS (pour piloter le `sub`) et le pool `pg`. But : PROUVER que la garde RELIT la base et
// refuse un internaute EFFACÉ, et court-circuite sans requête quand le cookie est absent/invalide.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { verifierSession } = vi.hoisted(() => ({ verifierSession: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));
vi.mock('./authSession', () => ({ NOM_COOKIE_CLIENT: 'svv_client_session', verifierSession }));

import { exigerInternaute } from './authGarde';

function req(cookie?: string): Request {
  return new Request('http://localhost/api/internaute/x', { headers: cookie ? { cookie } : {} });
}

describe('authGarde — exigerInternaute (relit la DB, refuse un effacé)', () => {
  beforeEach(() => {
    query.mockReset();
    verifierSession.mockReset();
  });

  it('cookie valide + internaute présent NON effacé → { internauteId }', async () => {
    verifierSession.mockResolvedValue('uuid-1');
    query.mockResolvedValue({ rows: [{ un: 1 }] });
    const g = await exigerInternaute(req('svv_client_session=jeton'));
    expect(g).toEqual({ internauteId: 'uuid-1' });
  });

  it('internaute EFFACÉ (0 ligne car WHERE efface_a IS NULL) → refus 401', async () => {
    verifierSession.mockResolvedValue('uuid-1');
    query.mockResolvedValue({ rows: [] });
    const g = await exigerInternaute(req('svv_client_session=jeton'));
    expect('refus' in g && g.refus.status).toBe(401);
  });

  it('aucun cookie → refus 401 SANS requête base', async () => {
    const g = await exigerInternaute(req());
    expect('refus' in g && g.refus.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('jeton invalide (verifierSession → null) → refus 401 SANS requête base', async () => {
    verifierSession.mockResolvedValue(null);
    const g = await exigerInternaute(req('svv_client_session=faux'));
    expect('refus' in g && g.refus.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
