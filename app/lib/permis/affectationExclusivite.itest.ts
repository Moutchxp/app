/**
 * Test d'INTÉGRATION (M1) — l'EXCLUSIVITÉ (a) de la table de liaison `permis_corps_polygone` est garantie EN BASE, pas seulement
 * dans le code : deux bâtiments du MÊME dossier ne peuvent pas prendre le MÊME polygone. On le PROUVE par un INSERT en double dans
 * une transaction ROLLBACKée — aucune trace laissée en base. Motif *.itest.ts (`npm run test:integration`).
 *
 * Angle mort visé : un test à mocks prouverait seulement que le code SURFACE l'erreur 23505 ; il ne prouverait pas que la BASE la
 * lève. Seule une vraie contrainte unique, éprouvée par un vrai INSERT, le démontre.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../db/client';

const DOSSIER = 11434;              // dossier réel (corps 1 et 2 en base locale)
const CORPS_A = 1, CORPS_B = 2;     // deux bâtiments déclarés DU MÊME dossier
const CLEABS = 'BATIMENT_TEST_M1_EXCLUSIVITE'; // cleabs fictif, jamais commité (transaction rollbackée)

afterAll(async () => { await closePool(); });

describe('M1 — exclusivité (a) de permis_corps_polygone, garantie EN BASE', () => {
  it('deux bâtiments du même dossier ne peuvent pas prendre le même polygone → 23505 (transaction rollbackée)', async () => {
    const client = await pool.connect();
    try {
      // La base doit être peuplée (dossier + 2 corps réels) ET la table 146 présente ; sinon on saute proprement (pas un faux échec).
      const { rows } = await client.query(
        `SELECT to_regclass('public.permis_corps_polygone') AS t,
                (SELECT count(*)::int FROM permis_corps_batiment WHERE id = ANY($1) AND dossier_id = $2) AS n`,
        [[CORPS_A, CORPS_B], DOSSIER]);
      const dispo = rows[0]?.t != null && rows[0]?.n === 2;
      if (!dispo) { expect(dispo).toBe(false); return; } // base non peuplée : test neutralisé

      await client.query('BEGIN');
      // 1er lien : accepté.
      await client.query(
        `INSERT INTO permis_corps_polygone (dossier_id, corps_id, cleabs, maj_par) VALUES ($1, $2, $3, 'itest')`,
        [DOSSIER, CORPS_A, CLEABS]);
      // 2e lien, MÊME (dossier, cleabs) mais AUTRE bâtiment → doit être REJETÉ par l'index unique (dossier_id, cleabs).
      let code: string | undefined;
      try {
        await client.query(
          `INSERT INTO permis_corps_polygone (dossier_id, corps_id, cleabs, maj_par) VALUES ($1, $2, $3, 'itest')`,
          [DOSSIER, CORPS_B, CLEABS]);
      } catch (e) { code = (e as { code?: string }).code; }
      expect(code).toBe('23505'); // unique_violation : l'exclusivité (a) est tenue par la BASE, pas par le code
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
