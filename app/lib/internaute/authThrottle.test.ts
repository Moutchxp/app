import { describe, it, expect, beforeEach, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { delaiPour, verifierThrottle, cleThrottle, noterEchec } from './authThrottle';

describe('authThrottle — backoff + fail-safe (état séparé, clé HACHÉE)', () => {
  // ⚠️ CORPS DE BLOC (pas d'expression) : `() => query.mockReset()` RENVERRAIT le mock, que vitest prendrait pour un
  // teardown et rappellerait après chaque test → dans le test d'échec, ce rappel déclencherait le throw. (Cf. antiBruteforce.test.)
  beforeEach(() => { query.mockReset(); });

  it('cleThrottle : SHA-256 hex, insensible casse/espaces, JAMAIS l’e-mail en clair', () => {
    const c = cleThrottle('  A.Jorel@Example.com ');
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(c).toBe(cleThrottle('a.jorel@example.com')); // normalisé
    expect(c).not.toContain('@');
  });

  it('delaiPour : 0 sous le seuil, backoff exponentiel plafonné à MAX_S', () => {
    expect(delaiPour(4)).toBe(0);
    expect(delaiPour(5)).toBe(2); // base
    expect(delaiPour(6)).toBe(4);
    expect(delaiPour(7)).toBe(8);
    expect(delaiPour(1000)).toBe(300); // plafond
  });

  it('verifierThrottle : BLOQUE après ≥ seuil échecs récents (Retry-After > 0)', async () => {
    query.mockResolvedValue({ rows: [{ n: 6, dernier: new Date().toISOString() }] });
    const v = await verifierThrottle('cle');
    expect(v.bloque).toBe(true);
    expect(v.retryAfter).toBeGreaterThan(0);
  });

  it('verifierThrottle : sous le seuil → ne bloque pas', async () => {
    query.mockResolvedValue({ rows: [{ n: 2, dernier: new Date().toISOString() }] });
    expect((await verifierThrottle('cle')).bloque).toBe(false);
  });

  it('FAIL-SAFE : erreur DB → verifierThrottle ne bloque pas ET noterEchec ne throw pas', async () => {
    // Throw SYNCHRONE : catché par le try/catch de chaque fonction, SANS créer de promesse rejetée (évite le
    // faux positif « unhandled rejection » de vitest sur les résultats de mock). Le catch couvre les deux cas.
    query.mockImplementation(() => { throw new Error('db down'); });
    expect((await verifierThrottle('cle')).bloque).toBe(false);
    await expect(noterEchec('cle')).resolves.toBeUndefined();
  });
});
