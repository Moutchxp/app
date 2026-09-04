import type { PoolClient } from 'pg';
import { pool } from '../db/client';

/**
 * LOT 58 — VERROU d'idempotence PAR DOSSIER autour d'une analyse de permis (extraction / cerfa-scan). Empêche deux passes
 * CONCURRENTES sur le MÊME dossier de s'entrelacer (purge A → purge B → écriture A → écriture B, états intermédiaires incohérents).
 *
 * Mécanisme : `pg_try_advisory_lock(namespace, dossierId)` — verrou consultatif PostgreSQL, forme à DEUX entiers (espace de clés
 * DISTINCT des verrous `bigint` de la veille, aucune collision). NON BLOQUANT : si le verrou est déjà pris (même dans un AUTRE
 * processus — la CLI et le serveur web sont deux processus), on renvoie `{ ok:false, occupe:true }` SANS attendre, SANS file.
 *
 * LIBÉRATION GARANTIE : le verrou est SESSION-scoped, pris sur une connexion DÉDIÉE (`pool.connect()`), et relâché de DEUX façons —
 *   (1) `pg_advisory_unlock` en `finally`, que `fn` réussisse ou échoue ;
 *   (2) si le processus est TUÉ au milieu, la connexion tombe → PostgreSQL relâche AUTOMATIQUEMENT tous les verrous consultatifs de
 *       cette session. Aucun verrou orphelin ne peut donc bloquer une analyse future.
 *
 * PAR DOSSIER : la clé inclut `dossierId` → deux permis DIFFÉRENTS s'analysent en parallèle (clés distinctes).
 */

/** Namespace des verrous d'analyse (forme int4,int4). Constante ≠ des clés de verrou de la veille (bigint, autre espace). */
export const NS_VERROU_EXTRACTION = 58;

export type ResultatVerrou<T> = { ok: true; valeur: T } | { ok: false; occupe: true };

/** Exécute `fn` sous le verrou du dossier. Verrou déjà pris → `fn` N'EST PAS exécutée, `{ ok:false, occupe:true }`. */
export async function avecVerrouDossier<T>(dossierId: number, fn: () => Promise<T>): Promise<ResultatVerrou<T>> {
  const client: PoolClient = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS ok', [NS_VERROU_EXTRACTION, dossierId]);
    if (!rows[0]?.ok) return { ok: false, occupe: true }; // une analyse de ce dossier tourne déjà (autre onglet / autre processus)
    try {
      return { ok: true, valeur: await fn() };
    } finally {
      // Libération explicite (succès OU échec de fn). Si la connexion est déjà tombée, PG a déjà relâché le verrou → on avale l'erreur.
      try { await client.query('SELECT pg_advisory_unlock($1, $2)', [NS_VERROU_EXTRACTION, dossierId]); } catch { /* connexion perdue → déjà relâché par PG */ }
    }
  } finally {
    client.release();
  }
}
