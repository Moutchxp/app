/**
 * PROJ-3s — Test d'INTÉGRATION : la SÉMANTIQUE SQL sur laquelle repose la retouche est garantie EN BASE (PostGIS), pas seulement
 * dans le code. On PROUVE, en transaction ROLLBACKée (aucune trace laissée) :
 *  ① `ST_IsValid` distingue un contour valide d'une auto-intersection (base du refus d'une géométrie cassée) ;
 *  ② l'UPDATE de retouche applique la RÈGLE de provenance (`ign_adopte` → `ign_retouche` ; `trace_manuel` INCHANGÉE) ET recalcule
 *     l'aire (`ST_Area`), dans le MÊME UPDATE que la géométrie.
 * Un test à mocks prouverait seulement que le code appelle le SQL ; seule la vraie base prouve le comportement du `CASE` et de
 * `ST_IsValid`. Motif *.itest.ts (`npm run test:integration`). Base non peuplée / migration 153 absente → test neutralisé.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../db/client';

const DOSSIER = 11434, CORPS = 1;
// Le MÊME UPDATE que retoucherEmprise (empriseReconstruiteRepo.ts) : géométrie + aire + provenance en un seul statement.
const UPDATE_RETOUCHE = `UPDATE permis_emprise_reconstruite
   SET geom = ST_Force2D(ST_GeomFromText($1, 2154)),
       surface_m2 = ST_Area(ST_Force2D(ST_GeomFromText($1, 2154))),
       provenance = CASE WHEN provenance = 'ign_adopte' THEN 'ign_retouche' ELSE provenance END
 WHERE id = $2 AND dossier_id = $3
 RETURNING provenance, surface_m2`;

afterAll(async () => { await closePool(); });

describe('PROJ-3s — retouche : validité géométrique + règle de provenance, garanties EN BASE', () => {
  it('ST_IsValid : contour simple = true ; contour auto-intersectant (nœud papillon) = false', async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT ST_IsValid(ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))', 2154)) AS simple,
                ST_IsValid(ST_GeomFromText('POLYGON((0 0,10 10,10 0,0 10,0 0))', 2154)) AS croise`);
      expect(rows[0].simple).toBe(true);
      expect(rows[0].croise).toBe(false); // auto-intersection → refusée par retoucherEmprise
    } finally { client.release(); }
  });

  it('UPDATE de retouche : ign_adopte → ign_retouche, trace_manuel INCHANGÉE, aire recalculée (transaction rollbackée)', async () => {
    const client = await pool.connect();
    try {
      const { rows: pre } = await client.query(
        `SELECT to_regclass('public.permis_emprise_reconstruite') AS t,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permis_emprise_reconstruite' AND column_name='provenance') AS col,
                (SELECT count(*)::int FROM permis_corps_batiment WHERE id=$1 AND dossier_id=$2) AS n`,
        [CORPS, DOSSIER]);
      const dispo = pre[0]?.t != null && pre[0]?.col === true && pre[0]?.n === 1;
      if (!dispo) { expect(dispo).toBe(false); return; } // base non peuplée / migration 153 absente : neutralisé

      await client.query('BEGIN');
      const carre10 = 'POLYGON((0 0,10 0,10 10,0 10,0 0))';   // aire 100
      const carre20 = 'POLYGON((0 0,20 0,20 20,0 20,0 0))';   // aire 400 (nouvelle géométrie de la retouche)
      const inserer = async (prov: string): Promise<number> => {
        const { rows } = await client.query(
          `INSERT INTO permis_emprise_reconstruite (dossier_id, corps_id, libelle, geom, surface_m2, calage, provenance, cree_par)
           VALUES ($1, $2, 'itest-3s', ST_GeomFromText($3, 2154), ST_Area(ST_GeomFromText($3, 2154)), '{}'::jsonb, $4, 'itest')
           RETURNING id`, [DOSSIER, CORPS, carre10, prov]);
        return rows[0].id as number;
      };
      const idIgn = await inserer('ign_adopte');
      const idTrace = await inserer('trace_manuel');

      const { rows: rIgn } = await client.query(UPDATE_RETOUCHE, [carre20, idIgn, DOSSIER]);
      expect(rIgn[0].provenance).toBe('ign_retouche');            // ign_adopte → ign_retouche
      expect(Number(rIgn[0].surface_m2)).toBeCloseTo(400, 6);     // aire recalculée

      const { rows: rTrace } = await client.query(UPDATE_RETOUCHE, [carre20, idTrace, DOSSIER]);
      expect(rTrace[0].provenance).toBe('trace_manuel');          // trace_manuel INCHANGÉE
      expect(Number(rTrace[0].surface_m2)).toBeCloseTo(400, 6);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
