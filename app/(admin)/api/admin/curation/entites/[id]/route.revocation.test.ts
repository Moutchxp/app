import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg : garde ET route partagent le MÊME module client → un seul mock couvre les deux.
const queryMock = vi.fn();
vi.mock('../../../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { DELETE } from './route';
import { signerJeton, permsToutes, permsAucune, NOM_COOKIE, type SessionAdmin } from '../../../../../../lib/admin/session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  queryMock.mockReset();
});

async function requeteDelete(session: SessionAdmin): Promise<Request> {
  const jeton = await signerJeton(session);
  return new Request('http://local/api/admin/curation/entites/1', {
    method: 'DELETE',
    headers: { cookie: `${NOM_COOKIE}=${jeton}` },
  });
}
const ctx = { params: Promise.resolve({ id: '1' }) };

describe('DELETE /api/admin/curation/entites/[id] — révocation avant destruction (bout en bout)', () => {
  it('collaborateur dont perm_curation a été retirée → 403 ACCES_REVOQUE et AUCUNE suppression', async () => {
    // Seule réponse mockée : le SELECT du garde. Toute écriture (DELETE) rappellerait query → non mocké.
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur', perm: false }] });

    const collab: SessionAdmin = { sub: 3, identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsAucune(), curation: true }, doitChanger: false };
    const res = await DELETE(await requeteDelete(collab), ctx);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'ACCES_REVOQUE' });
    // PREUVE de non-destruction : query appelé UNE seule fois (le SELECT du garde), jamais le DELETE.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(String(queryMock.mock.calls[0][0])).toContain('FROM admin_utilisateur WHERE id = $1');
  });

  it('compte désactivé → 403 et aucune suppression', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: false, role: 'administrateur', perm: true }] });
    const admin: SessionAdmin = { sub: 1, identifiant: 'a.jorel@sansvisavis.com', role: 'administrateur', perms: permsToutes(), doitChanger: false };
    const res = await DELETE(await requeteDelete(admin), ctx);
    expect(res.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
