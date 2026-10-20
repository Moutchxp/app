import type { QueryResult, QueryResultRow } from 'pg';
import { pool } from './client';

/**
 * ══ 🔴🔴 L'ESSAI DANS UNE TRANSACTION ANNULÉE (Arno, 20/10/2026, option B de la migration 393) — POUR LES ITESTS SEULEMENT ══
 *
 * Depuis la 393, l'annuaire, les baux, les cartes et les garants refusent DELETE et TRUNCATE SANS EXCEPTION, même sur une
 * base d'essai : un itest ne « nettoie » donc plus derrière lui, il ne laisse RIEN. Tout l'essai court dans UNE transaction,
 * annulée à la fin (`annuler`) ; `point`/`revenir` isolent chaque cas (SAVEPOINT / ROLLBACK TO).
 *
 * Le montage (celui de la technique « parcours en transaction annulée ») : `pool.query` et `pool.connect` passent par UN
 * client ; dans un `withTransaction`, BEGIN / COMMIT / ROLLBACK deviennent SAVEPOINT / RELEASE / ROLLBACK TO. Chaque requête
 * isolée a son propre point de reprise : une requête REFUSÉE (c'est ce qu'éprouvent les essais d'intrusion) n'interrompt pas
 * la transaction de l'essai. Les requêtes passent une à une (file), jamais en parallèle sur le client.
 */
export interface EssaiAnnule {
  /** Pose le point de reprise d'un cas. */
  point: () => Promise<void>;
  /** Revient au point de reprise : ce que le cas a écrit disparaît. */
  revenir: () => Promise<void>;
  /** Annule TOUT l'essai et rend le pool à son état d'origine. */
  annuler: () => Promise<void>;
}

type Requete = <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;

export async function ouvrirEssaiAnnule(): Promise<EssaiAnnule> {
  const client = await pool.connect();
  await client.query('BEGIN');
  const origine = { query: pool.query, connect: pool.connect };
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(f: () => Promise<T>): Promise<T> => {
    const r = file.then(f, f);
    file = r.catch(() => undefined);
    return r;
  };
  let n = 0;
  const brute: Requete = (text, params) => client.query(text, params as never);
  /** Une requête isolée, avec son point de reprise : refusée, elle est défaite seule. */
  const isolee: Requete = (text, params) => enFile(async () => {
    const nom = `q_${(n += 1)}`;
    await client.query(`SAVEPOINT ${nom}`);
    try {
      const r = await brute(text, params);
      await client.query(`RELEASE SAVEPOINT ${nom}`);
      return r;
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT ${nom}`);
      await client.query(`RELEASE SAVEPOINT ${nom}`);
      throw e;
    }
  }) as never;
  const pile: string[] = [];
  // Dans la file, elle aussi : jamais un point de reprise d'une requête isolée au milieu de ceux d'une transaction.
  const dansTransaction = (text: unknown, params?: unknown[]): Promise<unknown> => enFile(() => {
    const t = typeof text === 'string' ? text.trim().replace(/;$/, '').toUpperCase() : '';
    if (t === 'BEGIN') { const nom = `tx_${(n += 1)}`; pile.push(nom); return brute(`SAVEPOINT ${nom}`); }
    if (t === 'COMMIT') { const nom = pile.pop(); return brute(`RELEASE SAVEPOINT ${nom}`); }
    if (t === 'ROLLBACK') { const nom = pile.pop(); return brute(`ROLLBACK TO SAVEPOINT ${nom}`).then(() => brute(`RELEASE SAVEPOINT ${nom}`)); }
    return brute(text as string, params);
  });
  (pool as unknown as { query: unknown }).query = isolee;
  (pool as unknown as { connect: unknown }).connect = async () => ({ query: dansTransaction, release: () => undefined });
  return {
    point: () => enFile(() => client.query('SAVEPOINT cas').then(() => undefined)),
    revenir: () => enFile(() => client.query('ROLLBACK TO SAVEPOINT cas').then(() => undefined)),
    annuler: async () => {
      await enFile(() => client.query('ROLLBACK'));
      (pool as unknown as { query: unknown }).query = origine.query;
      (pool as unknown as { connect: unknown }).connect = origine.connect;
      client.release();
    },
  };
}
