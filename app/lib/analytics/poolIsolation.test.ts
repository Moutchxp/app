import 'dotenv/config'; // charge .env (DATABASE_URL) AVANT d'importer les pools réels
import { describe, it, expect, afterAll } from 'vitest';
import { poolAnalytics } from './pool';
import { pool } from '../db/client';
import { POOL_MAX, STATEMENT_TIMEOUT_MS, CONNECT_TIMEOUT_MS } from './config';

/**
 * M2 — LOT 1. Preuve RUNTIME que le pool analytique est une instance DISTINCTE et BORNÉE, jamais le
 * pool applicatif (non configuré). Aucune connexion n'est ouverte (on n'inspecte que la config).
 */

describe('isolation du pool (runtime)', () => {
  it('poolAnalytics est une instance DIFFÉRENTE du pool applicatif', () => {
    expect(poolAnalytics).not.toBe(pool);
  });

  it('poolAnalytics est BORNÉ (max bas, timeouts courts) — contrairement au pool applicatif', () => {
    expect(poolAnalytics.options.max).toBe(POOL_MAX);
    expect(poolAnalytics.options.max).toBeLessThan((pool.options.max as number | undefined) ?? 10);
    expect(poolAnalytics.options.statement_timeout).toBe(STATEMENT_TIMEOUT_MS);
    expect(poolAnalytics.options.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_MS);
    // Le pool applicatif attend une connexion indéfiniment (0/undefined) ; le pool analytique, non.
    expect(poolAnalytics.options.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it('poolAnalytics porte un application_name distinct (visible dans pg_stat_activity)', () => {
    expect(poolAnalytics.options.application_name).toBe('svav_analytics');
  });
});

afterAll(async () => {
  // Ferme les pools ouverts par ce fichier (évite les handles pendants). Isolation par fichier vitest.
  await Promise.allSettled([poolAnalytics.end(), pool.end()]);
});
