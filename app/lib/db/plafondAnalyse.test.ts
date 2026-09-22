import 'dotenv/config'; // charge .env (DATABASE_URL) AVANT d'importer les pools réels
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { pool, query } from './client';
import {
  poolAnalysePublique,
  poolContextuel,
  avecPlafondAnalyse,
  estPlafondAtteint,
  STATEMENT_TIMEOUT_ANALYSE_MS,
  CONNECT_TIMEOUT_ANALYSE_MS,
  POOL_MAX_ANALYSE,
} from './plafondAnalyse';

/**
 * Preuve que le plafond d'attente de la base est SCOPÉ au seul chemin de l'analyse publique.
 * AUCUNE connexion n'est ouverte : on inspecte la configuration et on espionne `query` des pools.
 */

/** Réponse `pg` minimale (le contenu n'a aucune importance : on n'observe QUE le pool appelé). */
const REPONSE_VIDE = { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };

afterEach(() => vi.restoreAllMocks());

describe('le pool du chemin public est une instance DISTINCTE et BORNÉE', () => {
  it('n’est jamais le pool applicatif', () => {
    expect(poolAnalysePublique).not.toBe(pool);
  });

  it('porte les deux plafonds demandés (requête 15 s, attente d’une connexion 10 s)', () => {
    expect(poolAnalysePublique.options.statement_timeout).toBe(STATEMENT_TIMEOUT_ANALYSE_MS);
    expect(STATEMENT_TIMEOUT_ANALYSE_MS).toBe(15_000);
    expect(poolAnalysePublique.options.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_ANALYSE_MS);
    expect(CONNECT_TIMEOUT_ANALYSE_MS).toBe(10_000);
    expect(poolAnalysePublique.options.max).toBe(POOL_MAX_ANALYSE);
  });

  it('porte un application_name distinct (isolation visible dans pg_stat_activity)', () => {
    expect(poolAnalysePublique.options.application_name).toBe('svav_analyse_publique');
  });

  it('LE TEST DU LOT — le pool applicatif reste SANS plafond : les usages longs (imports, veille, relève, scripts) sont intouchés', () => {
    expect(poolAnalysePublique.options.statement_timeout).toBeGreaterThan(0);
    // Ni plafond de requête, ni attente de connexion bornée sur le pool partagé : exactement l'état d'avant.
    expect(pool.options.statement_timeout ?? 0).toBe(0);
    expect(pool.options.connectionTimeoutMillis ?? 0).toBe(0);
  });
});

describe('le routage de query() suit le contexte, et rien d’autre', () => {
  it('HORS analyse publique, query() part sur le pool applicatif (aucun plafond)', async () => {
    const applicatif = vi.spyOn(pool, 'query').mockResolvedValue(REPONSE_VIDE as never);
    const public_ = vi.spyOn(poolAnalysePublique, 'query').mockResolvedValue(REPONSE_VIDE as never);
    await query('SELECT 1');
    expect(applicatif).toHaveBeenCalledTimes(1);
    expect(public_).not.toHaveBeenCalled();
    expect(poolContextuel()).toBeUndefined();
  });

  it('DANS avecPlafondAnalyse, query() part sur le pool borné — y compris après un await', async () => {
    const applicatif = vi.spyOn(pool, 'query').mockResolvedValue(REPONSE_VIDE as never);
    const public_ = vi.spyOn(poolAnalysePublique, 'query').mockResolvedValue(REPONSE_VIDE as never);
    await avecPlafondAnalyse(async () => {
      await query('SELECT 1'); // 1re requête (validerOrigine)
      await new Promise((r) => setTimeout(r, 0)); // le contexte doit survivre aux frontières asynchrones
      await query('SELECT 2'); // requête postérieure (faisceaux, paysage…)
      expect(poolContextuel()).toBe(poolAnalysePublique);
    });
    expect(public_).toHaveBeenCalledTimes(2);
    expect(applicatif).not.toHaveBeenCalled();
  });

  it('le contexte est RENDU à la sortie : la requête suivante repart sur le pool applicatif', async () => {
    const applicatif = vi.spyOn(pool, 'query').mockResolvedValue(REPONSE_VIDE as never);
    vi.spyOn(poolAnalysePublique, 'query').mockResolvedValue(REPONSE_VIDE as never);
    await avecPlafondAnalyse(async () => { await query('SELECT 1'); });
    await query('SELECT 2');
    expect(applicatif).toHaveBeenCalledTimes(1);
    expect(applicatif).toHaveBeenCalledWith('SELECT 2', undefined);
    expect(poolContextuel()).toBeUndefined();
  });

  it('le contexte est rendu MÊME si l’analyse lève (pas de fuite de contexte)', async () => {
    const applicatif = vi.spyOn(pool, 'query').mockResolvedValue(REPONSE_VIDE as never);
    await expect(avecPlafondAnalyse(async () => { throw new Error('boum'); })).rejects.toThrow('boum');
    await query('SELECT 1');
    expect(applicatif).toHaveBeenCalledTimes(1);
  });

  it('avecPlafondAnalyse rend la valeur du calcul telle quelle (enveloppe transparente)', async () => {
    await expect(avecPlafondAnalyse(async () => ({ verdict: 'SANS_VIS_A_VIS' }))).resolves.toEqual({
      verdict: 'SANS_VIS_A_VIS',
    });
  });
});

describe('estPlafondAtteint ne reconnaît QUE les deux manifestations d’un plafond', () => {
  it('SQLSTATE 57014 (statement_timeout annulé par Postgres)', () => {
    expect(estPlafondAtteint(Object.assign(new Error('canceling statement'), { code: '57014' }))).toBe(true);
  });

  it('attente d’une connexion dépassée (message pg)', () => {
    expect(estPlafondAtteint(new Error('timeout exceeded when trying to connect'))).toBe(true);
  });

  it('toute autre erreur suit le chemin d’erreur habituel (500)', () => {
    expect(estPlafondAtteint(new Error('colonne inconnue'))).toBe(false);
    expect(estPlafondAtteint(Object.assign(new Error('deadlock'), { code: '40P01' }))).toBe(false);
    expect(estPlafondAtteint(null)).toBe(false);
    expect(estPlafondAtteint('57014')).toBe(false); // une chaîne n'est pas une erreur pg
  });
});

afterAll(async () => {
  // Ferme les pools ouverts par ce fichier (évite les handles pendants). Isolation par fichier vitest.
  await Promise.allSettled([poolAnalysePublique.end(), pool.end()]);
});
