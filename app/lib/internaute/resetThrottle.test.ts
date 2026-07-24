import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Throttle des DEMANDES de reset. On MOCKE `query` (aucune base réelle). On PROUVE : (1) la clé est disjointe de la clé
 * de login pour le même e-mail ; (2) le backoff est plus permissif et démarre au seuil ; (3) le verdict est FAIL-SAFE ;
 * (4) chaque demande est comptée (INSERT), sans reset-sur-succès. Aucun e-mail ni empreinte loggés.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { cleThrottleReset, delaiPourReset, verifierThrottleReset, noterDemandeReset } from './resetThrottle';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('resetThrottle — throttle des demandes de réinitialisation', () => {
  // CORPS DE BLOC (pas d'expression) : `() => query.mockReset()` RENVERRAIT le mock, que vitest prendrait pour un
  // teardown et rappellerait après chaque test → dans le test d'erreur, ce rappel throw. (Cf. authThrottle.test.)
  beforeEach(() => { query.mockReset(); });

  describe('cleThrottleReset — clé DISJOINTE du login', () => {
    it('SHA-256 de « reset: » + e-mail normalisé (trim + minuscules)', () => {
      expect(cleThrottleReset('  Jean@Example.COM ')).toBe(sha('reset:jean@example.com'));
      expect(cleThrottleReset('a@b.co')).toMatch(/^[0-9a-f]{64}$/); // 64-hex, même forme qu'une clé de login
    });
    it('disjointe de la clé de login (sha256(email) sans préfixe) pour le MÊME e-mail', () => {
      const email = 'jean@example.com';
      const cleLogin = sha(email); // = cleThrottle(email) du module login
      expect(cleThrottleReset(email)).not.toBe(cleLogin);
    });
    it('normalisation cohérente : casse/espaces → même clé', () => {
      expect(cleThrottleReset('X@Y.Z')).toBe(cleThrottleReset('  x@y.z  '));
    });
  });

  describe('delaiPourReset — backoff permissif démarrant au seuil (3)', () => {
    it('0 sous le seuil (0, 1, 2 demandes → aucun délai)', () => {
      expect(delaiPourReset(0)).toBe(0);
      expect(delaiPourReset(2)).toBe(0);
    });
    it('au seuil et au-delà : 60 → 120 → 240 (doublement)', () => {
      expect(delaiPourReset(3)).toBe(60); // BASE·2^0
      expect(delaiPourReset(4)).toBe(120); // BASE·2^1
      expect(delaiPourReset(5)).toBe(240); // BASE·2^2
    });
    it('plafonné à 3600 s (1 h), même pour un grand nombre de demandes', () => {
      expect(delaiPourReset(100)).toBe(3600);
      expect(delaiPourReset(1e9)).toBe(3600); // pas d'overflow flottant
    });
  });

  describe('verifierThrottleReset', () => {
    it('sous le seuil → non bloqué ; interroge bien la fenêtre 1 h (3600 s)', async () => {
      query.mockResolvedValue({ rows: [{ n: 2, dernier: new Date().toISOString() }] });
      const v = await verifierThrottleReset('cle');
      expect(v).toEqual({ bloque: false, retryAfter: 0 });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/FROM internaute_login_echec/);
      expect(sql).toMatch(/count\(\*\)::int AS n, max\(ts\) AS dernier/);
      expect(params).toEqual(['cle', 3600]);
    });
    it('au seuil, demande récente → bloqué, retryAfter ∈ ]0 ; 60]', async () => {
      query.mockResolvedValue({ rows: [{ n: 3, dernier: new Date().toISOString() }] });
      const v = await verifierThrottleReset('cle');
      expect(v.bloque).toBe(true);
      expect(v.retryAfter).toBeGreaterThan(0);
      expect(v.retryAfter).toBeLessThanOrEqual(60);
    });
    it('au seuil mais dernière demande ANCIENNE (délai écoulé) → non bloqué', async () => {
      const vieux = new Date(Date.now() - 3600_000).toISOString(); // 1 h
      query.mockResolvedValue({ rows: [{ n: 3, dernier: vieux }] });
      expect(await verifierThrottleReset('cle')).toEqual({ bloque: false, retryAfter: 0 });
    });
    it('FAIL-SAFE : erreur DB → non bloqué (jamais d’enfermement)', async () => {
      // Throw SYNCHRONE (catché par le try/catch) : évite le faux positif « unhandled rejection » de vitest sur un
      // `mockRejectedValue`. Même pattern que authThrottle.test.
      query.mockImplementation(() => { throw new Error('db down'); });
      expect(await verifierThrottleReset('cle')).toEqual({ bloque: false, retryAfter: 0 });
    });
  });

  describe('noterDemandeReset', () => {
    it('INSERT une ligne (compte la demande) avec la clé', async () => {
      query.mockResolvedValue({ rows: [] });
      await noterDemandeReset('cle');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO internaute_login_echec \(cle_hachee, ts\)/);
      expect(params).toEqual(['cle']);
    });
    it('best-effort : erreur DB → ne throw PAS', async () => {
      query.mockImplementation(() => { throw new Error('db down'); }); // throw synchrone (cf. FAIL-SAFE ci-dessus)
      await expect(noterDemandeReset('cle')).resolves.toBeUndefined();
    });
    it('aucune fonction de reset-sur-succès n’existe (une demande réussie compte comme les autres)', async () => {
      const mod = await import('./resetThrottle');
      expect((mod as Record<string, unknown>).noterSucces).toBeUndefined();
    });
  });

  it('ne logge JAMAIS (ni e-mail, ni empreinte)', async () => {
    const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockResolvedValue({ rows: [{ n: 0, dernier: null }] });
    await verifierThrottleReset(cleThrottleReset('a@b.co'));
    await noterDemandeReset(cleThrottleReset('a@b.co'));
    expect(spyLog).not.toHaveBeenCalled();
    expect(spyErr).not.toHaveBeenCalled();
    spyLog.mockRestore();
    spyErr.mockRestore();
  });
});
