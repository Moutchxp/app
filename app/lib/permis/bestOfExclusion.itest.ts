import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { lireExclusionsBestOf, exclurePageBestOf, reintegrerPageBestOf } from './bestOfExclusionRepo';

/**
 * 🔴 LOT 61 — TEST DE LIVRAISON (vraie base) des EXCLUSIONS du best-of. On PROUVE que :
 *   ① une page retirée est PERSISTÉE (survit à un rechargement) et l'écriture est idempotente ;
 *   ② la réintégration l'annule (réversible), sans toucher le document ni la page en GED ;
 *   ③ SANS OBJET : si la pièce quitte la GED (dossier_document supprimé), l'exclusion disparaît par CASCADE (jamais bloquer une autre page).
 * Aucun appel API. Fixtures isolées + nettoyage afterAll (patron `saisissableEnCours.itest.ts`).
 */
const dossierIds: number[] = [];
let seq = 0;

async function seed(): Promise<{ dossierId: number; pieceId: number }> {
  seq += 1;
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TEST61${970000 + seq}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, note) VALUES ($1, 'plan-61.pdf', $2, 'test 61') RETURNING id::int AS id`,
    [dossierId, `dossiers/${dossierId}/plan-61.pdf`]);
  return { dossierId, pieceId: d[0].id };
}

afterAll(async () => {
  // CASCADE depuis sitadel_dossier : supprime dossier_document ET permis_best_of_exclusion.
  for (const id of dossierIds) { try { await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]); } catch { /* best-effort */ } }
});

describe('LOT 61 — exclusions du best-of : persistées, réversibles, sans objet si la pièce quitte la GED', () => {
  it('① retrait PERSISTÉ et idempotent (survit au rechargement)', async () => {
    const { dossierId, pieceId } = await seed();
    expect(await lireExclusionsBestOf(dossierId)).toEqual([]);
    expect(await exclurePageBestOf(dossierId, pieceId, 3, 'admin')).toBe(true);
    expect(await exclurePageBestOf(dossierId, pieceId, 3, 'admin')).toBe(true); // idempotent (ON CONFLICT DO NOTHING)
    // relecture « fraîche » = comme après un rechargement de page
    expect(await lireExclusionsBestOf(dossierId)).toEqual([{ pieceId, page: 3 }]);
  });

  it('② réintégration réversible ; le document et la page RESTENT en GED', async () => {
    const { dossierId, pieceId } = await seed();
    await exclurePageBestOf(dossierId, pieceId, 5, 'admin');
    expect(await reintegrerPageBestOf(pieceId, 5)).toBe(true);
    expect(await lireExclusionsBestOf(dossierId)).toEqual([]);
    // le document est toujours là (le retrait n'a jamais touché la GED)
    const { rows } = await query(`SELECT 1 FROM dossier_document WHERE id = $1`, [pieceId]);
    expect(rows).toHaveLength(1);
  });

  it('③ SANS OBJET : pièce retirée de la GED → l’exclusion disparaît par CASCADE', async () => {
    const { dossierId, pieceId } = await seed();
    await exclurePageBestOf(dossierId, pieceId, 2, 'admin');
    expect(await lireExclusionsBestOf(dossierId)).toEqual([{ pieceId, page: 2 }]);
    await query(`DELETE FROM dossier_document WHERE id = $1`, [pieceId]); // la pièce quitte la GED
    expect(await lireExclusionsBestOf(dossierId)).toEqual([]); // exclusion sans objet, jamais orpheline
  });
});
