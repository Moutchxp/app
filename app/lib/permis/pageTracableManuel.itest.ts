import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { lireDeblocagesTracable, estPageDebloquee, debloquerPageTracable, reverrouillerPageTracable } from './pageTracableManuelRepo';

/**
 * 🔴 TEST DE LIVRAISON (vraie base) du DÉBLOCAGE MANUEL de la traçabilité d'une page (3e miroir des exclusions/inclusions best-of). On PROUVE :
 *   ① un déblocage est PERSISTÉ (survit à un rechargement), l'écriture est idempotente, et `estPageDebloquee` le voit ;
 *   ② le retrait l'annule (réversible), sans toucher le document ni la page en GED ;
 *   ③ SANS OBJET : si la pièce quitte la GED (dossier_document supprimé), le déblocage disparaît par CASCADE (jamais bloquer une autre page).
 * Aucun appel API. Fixtures isolées + nettoyage afterAll (patron `bestOfExclusion.itest.ts`).
 */
const dossierIds: number[] = [];
let seq = 0;

async function seed(): Promise<{ dossierId: number; pieceId: number }> {
  seq += 1;
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TESTDBLK${970000 + seq}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, note) VALUES ($1, 'plan-dblk.pdf', $2, 'test déblocage') RETURNING id::int AS id`,
    [dossierId, `dossiers/${dossierId}/plan-dblk.pdf`]);
  return { dossierId, pieceId: d[0].id };
}

afterAll(async () => {
  // CASCADE depuis sitadel_dossier : supprime dossier_document ET permis_page_tracable_manuel.
  for (const id of dossierIds) { try { await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]); } catch { /* best-effort */ } }
});

describe('Déblocage manuel de traçabilité : persisté, vu par estPageDebloquee, réversible, sans objet si la pièce quitte la GED', () => {
  it('① déblocage PERSISTÉ et idempotent ; estPageDebloquee le voit', async () => {
    const { dossierId, pieceId } = await seed();
    expect(await lireDeblocagesTracable(dossierId)).toEqual([]);
    expect(await estPageDebloquee(pieceId, 6)).toBe(false);
    expect(await debloquerPageTracable(dossierId, pieceId, 6, 'admin')).toBe(true);
    expect(await debloquerPageTracable(dossierId, pieceId, 6, 'admin')).toBe(true); // idempotent (ON CONFLICT DO NOTHING)
    // relecture « fraîche » = comme après un rechargement de page
    expect(await lireDeblocagesTracable(dossierId)).toEqual([{ pieceId, page: 6 }]);
    expect(await estPageDebloquee(pieceId, 6)).toBe(true); // lue par la route /emprise pour lever son verrou métier
    expect(await estPageDebloquee(pieceId, 7)).toBe(false); // grain = LA page : une autre page reste verrouillée
  });

  it('② retrait réversible ; le document et la page RESTENT en GED (aucune emprise touchée ici)', async () => {
    const { dossierId, pieceId } = await seed();
    await debloquerPageTracable(dossierId, pieceId, 4, 'admin');
    expect(await reverrouillerPageTracable(pieceId, 4)).toBe(true);
    expect(await lireDeblocagesTracable(dossierId)).toEqual([]);
    expect(await estPageDebloquee(pieceId, 4)).toBe(false);
    // le document est toujours là (le retrait n'a jamais touché la GED)
    const { rows } = await query(`SELECT 1 FROM dossier_document WHERE id = $1`, [pieceId]);
    expect(rows).toHaveLength(1);
  });

  it('③ SANS OBJET : pièce retirée de la GED → le déblocage disparaît par CASCADE', async () => {
    const { dossierId, pieceId } = await seed();
    await debloquerPageTracable(dossierId, pieceId, 2, 'admin');
    expect(await lireDeblocagesTracable(dossierId)).toEqual([{ pieceId, page: 2 }]);
    await query(`DELETE FROM dossier_document WHERE id = $1`, [pieceId]); // la pièce quitte la GED
    expect(await lireDeblocagesTracable(dossierId)).toEqual([]); // déblocage sans objet, jamais orphelin
  });
});
