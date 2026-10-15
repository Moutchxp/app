import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryAnalytics } = vi.hoisted(() => ({ queryAnalytics: vi.fn() }));
vi.mock('../analytics/pool', () => ({ queryAnalytics }));

import { delaiPour, verifierThrottle, noterEchec, noterSucces, cleThrottleIp, lireConfigIp, verifierThrottleIp, noterEchecIp, DEFAUTS_IP } from './antiBruteforce';

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

// ══ AUDIT POINT 3 (15/10/2026) — limite par ADRESSE IP, en empreinte seulement ══════════════════════════════════════════
describe('cleThrottleIp — empreinte de l’adresse, jamais l’adresse', () => {
  const requete = (ip?: string) => new Request('http://x/api/admin/session', { method: 'POST', headers: ip ? { 'X-Forwarded-For': ip } : {} });
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
    process.env.CADENCE_ENTETE_IP = 'x-forwarded-for';
  });

  it('« ip: » + HMAC-SHA256 hexadécimal (64 car.) ; stable pour une même adresse ; l’adresse n’y figure pas', () => {
    const a = cleThrottleIp(requete('203.0.113.7'));
    expect(a).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(cleThrottleIp(requete('203.0.113.7'))).toBe(a);
    expect(cleThrottleIp(requete('203.0.113.8'))).not.toBe(a);
    expect(a).not.toContain('203');
  });

  it('dépend du SECRET serveur : sans lui, l’empreinte ne se recalcule pas d’une liste d’adresses', () => {
    const a = cleThrottleIp(requete('203.0.113.7'));
    process.env.ADMIN_SESSION_SECRET = 'un-autre-secret-tout-aussi-long-pour-hs256-9876543210';
    expect(cleThrottleIp(requete('203.0.113.7'))).not.toBe(a);
  });

  it('null (aucune limite par IP) si aucun mandataire de confiance, si l’en-tête manque, ou si le secret manque', () => {
    expect(cleThrottleIp(requete())).toBeNull();
    delete process.env.CADENCE_ENTETE_IP;
    expect(cleThrottleIp(requete('203.0.113.7'))).toBeNull();
    process.env.CADENCE_ENTETE_IP = 'x-forwarded-for';
    delete process.env.ADMIN_SESSION_SECRET;
    expect(cleThrottleIp(requete('203.0.113.7'))).toBeNull();
  });
});

describe('lireConfigIp — réglables avec défaut ET plage', () => {
  const ligne = (cle: string, valeur: string) => ({ cle, valeur });

  it('migration 355 non appliquée (aucune ligne) → défauts 20 échecs / 900 s ; délai = base et plafond du throttle', async () => {
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS);
    expect(await lireConfigIp()).toEqual({ seuil: DEFAUTS_IP.seuil, fenetreS: DEFAUTS_IP.fenetreS, baseS: 2, maxS: 300 });
    expect(DEFAUTS_IP).toEqual({ seuil: 20, fenetreS: 900 });
  });

  it('valeurs DANS la plage → appliquées', async () => {
    queryAnalytics.mockResolvedValueOnce({ rows: [...CFG_ROWS.rows, ligne('login_throttle_ip_seuil', '50'), ligne('login_throttle_ip_fenetre_s', '3600')] });
    expect(await lireConfigIp()).toMatchObject({ seuil: 50, fenetreS: 3600 });
  });

  it('valeurs HORS plage (seuil [5 ; 1000], fenêtre [60 ; 86 400] s) ou illisibles → ignorées, défaut', async () => {
    queryAnalytics.mockResolvedValueOnce({ rows: [ligne('login_throttle_ip_seuil', '2'), ligne('login_throttle_ip_fenetre_s', '999999')] });
    expect(await lireConfigIp()).toMatchObject({ seuil: 20, fenetreS: 900 });
    queryAnalytics.mockResolvedValueOnce({ rows: [ligne('login_throttle_ip_seuil', 'beaucoup')] });
    expect(await lireConfigIp()).toMatchObject({ seuil: 20 });
  });

  it('base indisponible → défauts (repli sûr)', async () => {
    queryAnalytics.mockRejectedValueOnce(new Error('down'));
    expect(await lireConfigIp()).toEqual({ seuil: 20, fenetreS: 900, baseS: 2, maxS: 300 });
  });
});

describe('verifierThrottleIp / noterEchecIp', () => {
  const CLE = `ip:${'a'.repeat(64)}`;

  it('sous le seuil par IP (19 échecs) → non bloqué ; au seuil (20) avec un échec récent → bloqué', async () => {
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValueOnce({ rows: [{ n: 19, dernier: new Date().toISOString() }] });
    expect((await verifierThrottleIp(CLE)).bloque).toBe(false);
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValueOnce({ rows: [{ n: 20, dernier: new Date().toISOString() }] });
    expect((await verifierThrottleIp(CLE)).bloque).toBe(true);
    expect(queryAnalytics.mock.calls[3][1]).toEqual([CLE, 900]); // lu dans la fenêtre PAR IP
  });

  it('FAIL-SAFE : erreur base → non bloqué', async () => {
    queryAnalytics.mockRejectedValue(new Error('down'));
    expect(await verifierThrottleIp(CLE)).toEqual({ bloque: false, retryAfter: 0 });
  });

  it('noterEchecIp : enregistre l’empreinte, puis EFFACE les empreintes sorties de la fenêtre', async () => {
    queryAnalytics.mockResolvedValueOnce(CFG_ROWS).mockResolvedValue({ rows: [] });
    await noterEchecIp(CLE);
    expect(queryAnalytics.mock.calls[1]).toEqual([`INSERT INTO login_echec (identifiant, ts) VALUES ($1, now())`, [CLE]]);
    const [sql, params] = queryAnalytics.mock.calls[2];
    expect(String(sql).replace(/\s+/g, ' ')).toContain("DELETE FROM login_echec WHERE identifiant LIKE 'ip:%' AND ts <= now() -");
    expect(params).toEqual([900]);
  });

  it('noterEchecIp ne throw jamais', async () => {
    queryAnalytics.mockRejectedValue(new Error('down'));
    await expect(noterEchecIp(CLE)).resolves.toBeUndefined();
  });
});
