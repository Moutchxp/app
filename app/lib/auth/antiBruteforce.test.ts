import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryAnalytics } = vi.hoisted(() => ({ queryAnalytics: vi.fn() }));
vi.mock('../analytics/pool', () => ({ queryAnalytics }));

import { delaiPour, verifierThrottle, noterEchec, noterSucces } from './antiBruteforce';

const CFG_ROWS = {
  rows: [
    { cle: 'login_throttle_seuil', valeur: '5' },
    { cle: 'login_throttle_fenetre_s', valeur: '900' },
    { cle: 'login_throttle_base_s', valeur: '2' },
    { cle: 'login_throttle_max_s', valeur: '300' },
  ],
};

// ⚠️ CORPS DE BLOC (pas d'expression) : `() => queryAnalytics.mockReset()` RENVERRAIT le mock (une fonction),
// que vitest interpréterait comme un teardown et rappellerait après chaque test → dans les tests d'échec, ce
// rappel déclencherait le throw du mock. Le corps de bloc renvoie `undefined` → aucun teardown parasite.
beforeEach(() => {
  queryAnalytics.mockReset();
});

describe('delaiPour — backoff exponentiel PLAFONNÉ (pur)', () => {
  const cfg = { seuil: 5, baseS: 2, maxS: 300 };
  it('sous le seuil → 0 (aucun délai)', () => {
    expect(delaiPour(0, cfg)).toBe(0);
    expect(delaiPour(4, cfg)).toBe(0);
  });
  it('au seuil → base, puis DOUBLE à chaque échec', () => {
    expect(delaiPour(5, cfg)).toBe(2); // 2·2^0
    expect(delaiPour(6, cfg)).toBe(4); // 2·2^1
    expect(delaiPour(7, cfg)).toBe(8);
    expect(delaiPour(8, cfg)).toBe(16);
  });
  it('PLAFONNÉ à maxS — jamais un lockout ; borné même pour un `echecs` absurde (pas d’overflow)', () => {
    expect(delaiPour(100, cfg)).toBe(300);
    expect(delaiPour(1e9, cfg)).toBe(300);
  });
});

describe('verifierThrottle — lecture des échecs récents + calcul du délai', () => {
  it('sous le seuil → non bloqué', async () => {
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValueOnce({ rows: [{ n: 3, dernier: new Date().toISOString() }] });
    expect(await verifierThrottle('id')).toEqual({ bloque: false, retryAfter: 0 });
  });
  it('au-dessus du seuil + dernier échec RÉCENT → bloqué, retryAfter borné par le délai requis', async () => {
    const dernier = new Date(Date.now() - 1000).toISOString(); // il y a ~1 s ; requis = 8 s (n=7)
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValueOnce({ rows: [{ n: 7, dernier }] });
    const v = await verifierThrottle('id');
    expect(v.bloque).toBe(true);
    expect(v.retryAfter).toBeGreaterThan(0);
    expect(v.retryAfter).toBeLessThanOrEqual(8);
  });
  it('au-dessus du seuil mais délai ÉCOULÉ → non bloqué (THROTTLE, pas LOCKOUT)', async () => {
    const dernier = new Date(Date.now() - 60_000).toISOString(); // il y a 60 s > 8 s requis
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValueOnce({ rows: [{ n: 7, dernier }] });
    expect(await verifierThrottle('id')).toEqual({ bloque: false, retryAfter: 0 });
  });
  it('FAIL-SAFE : erreur DB → non bloqué (jamais de blocage d’un login légitime si l’état est indisponible)', async () => {
    // Échec SYNCHRONE de queryAnalytics (aucune promesse rejetée créée → pas de faux positif « unhandled »
    // du harnais ; le `try/catch` autour de `await` l'avale de la même façon qu'un rejet async). Cf. writer.test.
    queryAnalytics.mockImplementation(() => {
      throw new Error('DB down');
    });
    expect(await verifierThrottle('id')).toEqual({ bloque: false, retryAfter: 0 });
  });
});

describe('noterEchec / noterSucces — best-effort, ne throw JAMAIS', () => {
  it('noterEchec : INSERT login_echec + compteur AGRÉGÉ admin_connexion_echec', async () => {
    queryAnalytics.mockResolvedValue({ rows: [] });
    await expect(noterEchec('id')).resolves.toBeUndefined();
    expect(queryAnalytics).toHaveBeenCalledTimes(2);
    expect(queryAnalytics.mock.calls[0][0]).toMatch(/INSERT INTO login_echec/);
    expect(queryAnalytics.mock.calls[1][0]).toMatch(/analytics_admin_jour/);
    expect(queryAnalytics.mock.calls[1][1]).toContain('admin_connexion_echec');
  });
  it('noterEchec ne throw pas même si les DEUX requêtes échouent', async () => {
    // Échec SYNCHRONE de queryAnalytics (aucune promesse rejetée créée → pas de faux positif « unhandled »
    // du harnais ; le `try/catch` autour de `await` l'avale de la même façon qu'un rejet async). Cf. writer.test.
    queryAnalytics.mockImplementation(() => {
      throw new Error('DB down');
    });
    await expect(noterEchec('id')).resolves.toBeUndefined();
  });
  it('noterSucces : DELETE login_echec (RESET) + compteur AGRÉGÉ admin_connexion', async () => {
    queryAnalytics.mockResolvedValue({ rows: [] });
    await noterSucces('id');
    expect(queryAnalytics.mock.calls[0][0]).toMatch(/DELETE FROM login_echec/);
    expect(queryAnalytics.mock.calls[1][1]).toContain('admin_connexion');
  });
  it('noterSucces ne throw pas si la DB échoue', async () => {
    // Échec SYNCHRONE de queryAnalytics (aucune promesse rejetée créée → pas de faux positif « unhandled »
    // du harnais ; le `try/catch` autour de `await` l'avale de la même façon qu'un rejet async). Cf. writer.test.
    queryAnalytics.mockImplementation(() => {
      throw new Error('DB down');
    });
    await expect(noterSucces('id')).resolves.toBeUndefined();
  });
});
