import { query } from '../db/client';
import type { LigneTable } from './morphologieDisque';

/**
 * FRAÎCHEUR / F4 — MESURE de l'espace disque par table (server-only côté usage, mais SANS `server-only` : ce module n'est
 * atteint que par la route admin gardée, jamais par un CLI). LECTURE SEULE : deux SELECT sur les catalogues (pg_class /
 * pg_database_size), aucun DDL, aucune écriture. `pg_total_relation_size` lit des métadonnées → coût négligeable (< 1 s sur
 * ~110 relations). En cas d'échec : on JOURNALISE l'erreur pg COMPLÈTE et on renvoie null (la route affiche « indisponible »,
 * jamais des zéros).
 */

/** Requête injectable (défaut = pool réel) — permet de tester la mesure ET la sentinelle d'échec sans base. */
export type RequeteMorpho = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const requeteDefaut: RequeteMorpho = <R>(text: string, params?: unknown[]) =>
  query(text, params) as unknown as Promise<{ rows: R[] }>;

interface LigneBrute { table: string; total: string | number; donnees: string | number; idx: string | number; lignes: string | number }

/**
 * Mesure la taille de chaque table `public` (tables ordinaires, raster, partitions) + `pg_database_size`. Renvoie null si
 * la mesure échoue (erreur journalisée), pour que l'appelant affiche la sentinelle « indisponible ».
 */
export async function mesurerMorphologie(q: RequeteMorpho = requeteDefaut): Promise<{ tables: LigneTable[]; dbTotal: number } | null> {
  try {
    const t = await q<LigneBrute>(
      `SELECT c.relname AS table,
              pg_total_relation_size(c.oid) AS total,
              pg_relation_size(c.oid)       AS donnees,
              pg_indexes_size(c.oid)        AS idx,
              c.reltuples::bigint           AS lignes
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'm')`,
    );
    const d = await q<{ db: string | number }>(`SELECT pg_database_size(current_database()) AS db`);
    const dbTotal = Number(d.rows[0]?.db ?? NaN);
    if (!Number.isFinite(dbTotal)) throw new Error('pg_database_size illisible');
    const tables: LigneTable[] = t.rows.map((r) => ({
      table: r.table,
      total: Number(r.total),
      donnees: Number(r.donnees),
      index: Number(r.idx),
      lignes: Number(r.lignes),
    }));
    return { tables, dbTotal };
  } catch (e) {
    // PAS de catch muet : on trace l'erreur pg complète. L'appelant renverra la sentinelle « indisponible ».
    console.error('[morphologie] mesure disque impossible', e);
    return null;
  }
}
