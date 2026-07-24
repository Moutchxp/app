import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Garde `exigerInternaute` — F2 (ENFORCEMENT). On mocke `verifierSessionDetail` (pour piloter `{sub, cev}`) et le pool
 * `pg`. On PROUVE : la garde relit la base en fusionnant existence + non-effacé + `a.maj_a <= cev` (révocation des
 * sessions antérieures à un reset), refuse un jeton legacy (cev absent), et est FAIL-CLOSED (panne DB → 401, pas 500).
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { verifierSessionDetail } = vi.hoisted(() => ({ verifierSessionDetail: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));
vi.mock('./authSession', () => ({ NOM_COOKIE_CLIENT: 'svv_client_session', verifierSessionDetail }));

import { exigerInternaute } from './authGarde';

function req(cookie?: string): Request {
  return new Request('http://localhost/api/internaute/x', { headers: cookie ? { cookie } : {} });
}
const COOKIE = 'svv_client_session=jeton';
const MAJ = '2026-07-24 21:00:00.123456+00'; // maj_a courant du credential

describe('authGarde — exigerInternaute (F2 : enforcement de la révocation)', () => {
  beforeEach(() => {
    query.mockReset();
    verifierSessionDetail.mockReset();
  });

  it('session FRAÎCHE (cev = maj_a courant) → PASSE, requête fusionnée avec [sub, cev]', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: MAJ });
    query.mockResolvedValue({ rows: [{ un: 1 }] }); // maj_a <= cev vrai côté DB
    const g = await exigerInternaute(req(COOKIE));
    expect(g).toEqual({ internauteId: 'uuid-1' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/JOIN internaute_auth a ON a\.internaute_id = i\.id/);
    expect(sql).toMatch(/i\.efface_a IS NULL AND a\.maj_a <= \$2::timestamptz/);
    expect(params).toEqual(['uuid-1', MAJ]);
  });

  it('session ANTÉRIEURE à un reset (cev < maj_a → 0 ligne) → REFUS 401', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: '2026-07-24 20:00:00.000000+00' }); // plus vieux
    query.mockResolvedValue({ rows: [] }); // a.maj_a (récent) <= cev (ancien) = faux → 0 ligne
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
  });

  it('jeton LEGACY (cev absent = null) → $2 NULL → REFUS 401 (fail-closed, déconnexion voulue)', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: null });
    query.mockResolvedValue({ rows: [] }); // maj_a <= NULL = NULL → 0 ligne
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
    expect(query.mock.calls[0][1]).toEqual(['uuid-1', null]); // cev null bien transmis au comparateur SQL
  });

  it('internaute EFFACÉ (WHERE efface_a IS NULL → 0 ligne) → REFUS 401', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: MAJ });
    query.mockResolvedValue({ rows: [] });
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
  });

  it('CREDENTIAL SUPPRIMÉ (droit à l’oubli → JOIN internaute_auth vide → 0 ligne) → REFUS 401', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: MAJ });
    query.mockResolvedValue({ rows: [] }); // la jointure ne trouve plus de credential
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
  });

  it('ERREUR DB → REFUS 401 (FAIL-CLOSED : pas de 500, pas de fuite, pas de fail-open)', async () => {
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: MAJ });
    query.mockImplementation(() => { throw new Error('db down'); }); // throw synchrone (catché par le try)
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
    expect('refus' in g && (await g.refus.json())).toEqual({ erreur: 'non authentifié' }); // message générique, aucune cause
  });

  it('aucun cookie → REFUS 401 SANS requête base', async () => {
    const g = await exigerInternaute(req());
    expect('refus' in g && g.refus.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('JWS invalide (verifierSessionDetail → null) → REFUS 401 SANS requête base', async () => {
    verifierSessionDetail.mockResolvedValue(null);
    const g = await exigerInternaute(req('svv_client_session=faux'));
    expect('refus' in g && g.refus.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  // ── SCÉNARIO CIBLE bout-en-bout : reset depuis une session → l'autre est coupée, celle du reset survit ──
  it('deux sessions du même internaute ; reset depuis l’une → l’AUTRE refusée, celle du RESET préservée', async () => {
    const T0 = '2026-07-24 21:00:00.000000+00'; // maj_a avant le reset (session « tierce » ancienne)
    const T1 = '2026-07-24 22:00:00.000000+00'; // maj_a APRÈS le reset (= maj_a courant du credential)
    // Émule fidèlement `a.maj_a <= cev` avec a.maj_a = T1 (état DB après reset) : comparaison lexicographique monotone.
    query.mockImplementation((_sql: string, params: unknown[]) => {
      const cev = params[1] as string | null;
      return Promise.resolve({ rows: cev !== null && cev >= T1 ? [{ un: 1 }] : [] });
    });

    // Session du RESET (cev = T1 = maj_a courant) → survit.
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: T1 });
    expect(await exigerInternaute(req(COOKIE))).toEqual({ internauteId: 'uuid-1' });

    // Session TIERCE ouverte avant le reset (cev = T0 < T1) → coupée à sa requête suivante.
    verifierSessionDetail.mockResolvedValue({ sub: 'uuid-1', cev: T0 });
    const g = await exigerInternaute(req(COOKIE));
    expect('refus' in g && g.refus.status).toBe(401);
  });
});
