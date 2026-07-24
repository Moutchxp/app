import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Couche données du jeton de reset (STATEFUL). On MOCKE `query`/`withTransaction` : aucune base réelle. On PROUVE que
 * seule l'EMPREINTE (SHA-256) touche la base (jamais le secret clair), que la création INVALIDE les précédents PUIS
 * insère, et que la consommation est un UPDATE atomique (non consommé + non expiré) qui collapse toutes les causes
 * d'échec vers `null`.
 */
const { query, withTransaction } = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query, withTransaction }));

import { creerJetonReset, consommerJetonReset } from './resetMotDePasse';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('resetMotDePasse — couche données du jeton de reset', () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
  });

  describe('creerJetonReset', () => {
    it('invalide les précédents PUIS insère l’EMPREINTE (expire ~1 h) ; renvoie le secret en clair', async () => {
      const q = vi.fn().mockResolvedValue({ rows: [] });
      withTransaction.mockImplementation(async (fn: (q: typeof query) => unknown) => fn(q));

      const secret = await creerJetonReset('A');
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(20); // 256 bits en base64url ≈ 43 caractères

      expect(q).toHaveBeenCalledTimes(2);
      const [sql1, p1] = q.mock.calls[0];
      const [sql2, p2] = q.mock.calls[1];
      // 1) invalidation des précédents non consommés
      expect(sql1).toMatch(/DELETE FROM internaute_reset_mot_de_passe/);
      expect(sql1).toMatch(/internaute_id = \$1 AND consomme_a IS NULL/);
      expect(p1).toEqual(['A']);
      // 2) insertion de la seule empreinte
      expect(sql2).toMatch(/INSERT INTO internaute_reset_mot_de_passe/);
      expect(sql2).toMatch(/now\(\) \+ \(\$3 \|\| ' seconds'\)::interval/);
      expect(p2[0]).toBe(sha(secret)); // EMPREINTE stockée, jamais le secret
      expect(p2[1]).toBe('A');
      expect(p2[2]).toBe(3600);
      // le secret EN CLAIR n'apparaît dans AUCUN paramètre SQL
      expect(JSON.stringify([...(p1 as unknown[]), ...(p2 as unknown[])])).not.toContain(secret);
    });

    it('deux appels → deux secrets différents (aléa fort)', async () => {
      const q = vi.fn().mockResolvedValue({ rows: [] });
      withTransaction.mockImplementation(async (fn: (q: typeof query) => unknown) => fn(q));
      const s1 = await creerJetonReset('A');
      const s2 = await creerJetonReset('A');
      expect(s1).not.toBe(s2);
      expect(sha(s1)).not.toBe(sha(s2));
    });

    it('propage l’atomicité : tout passe par withTransaction (pas de query hors transaction)', async () => {
      const q = vi.fn().mockResolvedValue({ rows: [] });
      withTransaction.mockImplementation(async (fn: (q: typeof query) => unknown) => fn(q));
      await creerJetonReset('A');
      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('consommerJetonReset', () => {
    it('UPDATE atomique (non consommé + non expiré), RETURNING internaute_id ; lookup par EMPREINTE', async () => {
      query.mockResolvedValue({ rows: [{ internaute_id: 'A' }] });
      const res = await consommerJetonReset('secret-xyz');
      expect(res).toBe('A');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/UPDATE internaute_reset_mot_de_passe/);
      expect(sql).toMatch(/SET consomme_a = now\(\)/);
      expect(sql).toMatch(/consomme_a IS NULL AND expire_a > now\(\)/);
      expect(sql).toMatch(/RETURNING internaute_id/);
      expect(params).toEqual([sha('secret-xyz')]); // empreinte, jamais le secret
    });

    it('jeton inconnu / expiré / déjà consommé → null (0 ligne, cause indistincte)', async () => {
      query.mockResolvedValue({ rows: [] });
      expect(await consommerJetonReset('peu-importe')).toBeNull();
    });

    it('entrée vide / non-string → null SANS requête', async () => {
      expect(await consommerJetonReset('')).toBeNull();
      // @ts-expect-error entrée non conforme testée défensivement
      expect(await consommerJetonReset(undefined)).toBeNull();
      // @ts-expect-error entrée non conforme testée défensivement
      expect(await consommerJetonReset(null)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });
  });

  it('ne logge JAMAIS le secret ni l’empreinte', async () => {
    const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = vi.fn().mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation(async (fn: (q: typeof query) => unknown) => fn(q));
    await creerJetonReset('A');
    query.mockResolvedValue({ rows: [] });
    await consommerJetonReset('x');
    expect(spyLog).not.toHaveBeenCalled();
    expect(spyErr).not.toHaveBeenCalled();
    spyLog.mockRestore();
    spyErr.mockRestore();
  });
});
