import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * C4 — APRÈS suppression, la session ne passe PLUS la garde. On exerce le VRAI `exigerInternaute` (non modifié) : le
 * jeton reste cryptographiquement valide (`verifierSessionDetail` OK), mais la relecture base renvoie 0 ligne — état
 * post-suppression (`efface_a` posé ET `internaute_auth` supprimée par `anonymiserEnPlace`) → la requête fusionnée
 * `WHERE efface_a IS NULL AND JOIN internaute_auth` ne matche plus → REFUS 401.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { verifierSessionDetail } = vi.hoisted(() => ({ verifierSessionDetail: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/db/client', () => ({ query }));
vi.mock('../../../../../lib/internaute/authSession', () => ({ NOM_COOKIE_CLIENT: 'svv_client_session', verifierSessionDetail }));

import { exigerInternaute } from '../../../../../lib/internaute/authGarde';

const req = () => new Request('http://localhost/x', { headers: { cookie: 'svv_client_session=jeton' } });

describe('exigerInternaute — refuse une session dont le compte a été supprimé', () => {
  beforeEach(() => {
    query.mockReset();
    verifierSessionDetail.mockReset();
  });

  it('jeton valide MAIS 0 ligne (compte anonymisé + credential supprimé) → refus 401', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: '2026-07-25 10:00:00+00' }); // JWS encore valide
    query.mockResolvedValue({ rows: [] }); // post-suppression : efface_a posé / internaute_auth supprimée → 0 ligne
    const g = await exigerInternaute(req());
    expect('refus' in g && g.refus.status).toBe(401);
  });
});
