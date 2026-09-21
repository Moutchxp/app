/**
 * RATT-EDIT (marqueur « à revalider » sans faux positif) — Test d'INTÉGRATION : la SÉMANTIQUE SQL sur laquelle repose le marqueur est
 * garantie EN BASE, pas seulement dans le code. Le marqueur s'allume ssi `cb.maj_le > ref_le` (modificationApresValidation.ts:55) ; tout
 * repose donc sur UN fait : `maj_le` ne bouge QUE si une valeur change réellement. On le PROUVE, en transaction ROLLBACKée (aucune trace) :
 *  ① un ré-enregistrement à l'IDENTIQUE (garde `maj_le = CASE WHEN col IS DISTINCT FROM $new THEN now() ELSE maj_le END`) laisse maj_le
 *     INCHANGÉ → `maj_le > ref` reste FAUX → le permis reste « Validé » (le test central) ;
 *  ② un VRAI changement (valeur différente) OU un NULL→valeur bumpe maj_le → `maj_le > ref` devient VRAI → « à revalider » ;
 *  ③ EXCEPTION C1 (restauration) : un `maj_le = now()` INCONDITIONNEL (comme restaurationGel.ts) bumpe TOUJOURS → « à revalider ».
 * Un test à mocks prouve que le code ÉMET la garde (caracteristiquesRepo.test.ts) ; seule la vraie base prouve que `IS DISTINCT FROM` lit
 * bien l'ANCIENNE valeur au grain d'un UPDATE. Motif *.itest.ts (`npm run test:integration`). Base non peuplée → test neutralisé.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../db/client';

const T0 = '2020-01-01T00:00:00Z'; // référence de validation simulée (dans le passé) : tout maj_le > T0 = « modifié depuis »

// La MÊME garde qu'ecrireCorps (caracteristiquesRepo.ts) : maj_le conditionné à un vrai changement de la valeur. $2 = nouvelle valeur.
const UPDATE_GARDE = `UPDATE permis_corps_batiment
   SET nb_etages = $2, nb_etages_origine = 'saisie',
       maj_le  = CASE WHEN nb_etages IS DISTINCT FROM $2 THEN now() ELSE maj_le END,
       maj_par = CASE WHEN nb_etages IS DISTINCT FROM $2 THEN 'itest' ELSE maj_par END
 WHERE id = $1`;
// La MÊME écriture INCONDITIONNELLE que la restauration C1 (restaurationGel.ts:110) : maj_le = now() quoi qu'il arrive.
const UPDATE_RESTAURATION = `UPDATE permis_corps_batiment SET maj_le = now(), maj_par = 'itest' WHERE id = $1`;

afterAll(async () => { await closePool(); });

describe('RATT-EDIT — marqueur « à revalider » : maj_le ne bouge que sur un changement réel, garanti EN BASE', () => {
  it('identique → maj_le INCHANGÉ ; vrai changement / NULL→valeur → bumpé ; restauration → bumpé (transaction rollbackée)', async () => {
    const client = await pool.connect();
    try {
      const { rows: dispoRows } = await client.query(
        `SELECT (SELECT count(*)::int FROM permis_corps_batiment) AS n,
                to_regclass('public.permis_corps_batiment') AS t`);
      const dispo = dispoRows[0]?.t != null && (dispoRows[0]?.n ?? 0) > 0;
      if (!dispo) { expect(dispo).toBe(false); return; } // base non peuplée : neutralisé (comme retoucheEmprise.itest)

      await client.query('BEGIN');
      // Un corps témoin quelconque, ramené à un état connu (nb_etages = 5, maj_le = T0 « validé »). ROLLBACK effacera tout.
      const { rows: cib } = await client.query(`SELECT id FROM permis_corps_batiment ORDER BY id LIMIT 1`);
      const id = cib[0].id as number;
      const lireMaj = async (): Promise<string> => (await client.query(`SELECT maj_le::text AS m FROM permis_corps_batiment WHERE id = $1`, [id])).rows[0].m;
      const bumpé = async (): Promise<boolean> => (await client.query(`SELECT (maj_le > $2::timestamptz) AS b FROM permis_corps_batiment WHERE id = $1`, [id, T0])).rows[0].b;

      await client.query(`UPDATE permis_corps_batiment SET nb_etages = 5, maj_le = $2 WHERE id = $1`, [id, T0]);
      const ref = await lireMaj();

      // ① IDENTIQUE (nb_etages: 5 → 5) : maj_le NE bouge PAS → « Validé »
      await client.query(UPDATE_GARDE, [id, 5]);
      expect(await lireMaj()).toBe(ref);   // strictement inchangé
      expect(await bumpé()).toBe(false);   // maj_le > ref = FAUX → marqueur ÉTEINT

      // ② VRAI CHANGEMENT (5 → 9) : maj_le bumpe → « à revalider »
      await client.query(UPDATE_GARDE, [id, 9]);
      expect(await bumpé()).toBe(true);

      // ② bis — NULL → valeur compte comme un changement (NULL-safe IS DISTINCT FROM)
      await client.query(`UPDATE permis_corps_batiment SET nb_etages = NULL, maj_le = $2 WHERE id = $1`, [id, T0]);
      await client.query(UPDATE_GARDE, [id, 7]);
      expect(await bumpé()).toBe(true);

      // ③ EXCEPTION C1 — restauration : maj_le = now() INCONDITIONNEL, même valeur identique → bumpe TOUJOURS → « à revalider »
      await client.query(`UPDATE permis_corps_batiment SET nb_etages = 7, maj_le = $2 WHERE id = $1`, [id, T0]);
      await client.query(UPDATE_RESTAURATION, [id]);
      expect(await bumpé()).toBe(true);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
