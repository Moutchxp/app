import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { avecVerrouDossier } from './verrouExtraction';

/**
 * 🔴 LOT 58 — TEST DE LIVRAISON (vraie base) du verrou d'idempotence PAR DOSSIER. On PROUVE que :
 *   ① deux passes CONCURRENTES sur le MÊME dossier → une seule s'exécute, l'autre est refusée (occupe), et l'état final est celui
 *      d'UNE passe unique et complète (aucune ligne orpheline : la purge de la passe refusée n'a JAMAIS tourné) ;
 *   ② deux passes sur deux dossiers DIFFÉRENTS → les DEUX s'exécutent (verrou par dossier) ;
 *   ③ LIBÉRATION : après une passe, le verrou du dossier est de nouveau disponible (aucun verrou orphelin).
 * Aucun appel API. Fixtures isolées + nettoyage afterAll (patron `saisissableEnCours.itest.ts`).
 */
const dossierIds: number[] = [];
let seq = 0;

async function seedDossier(): Promise<number> {
  seq += 1;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TEST58${960000 + seq}`]);
  dossierIds.push(rows[0].id);
  return rows[0].id;
}

/** Simule une passe « purge-puis-réécrit » d'un writer : DELETE le marqueur, PAUSE (fenêtre de concurrence), puis INSERT une ligne. */
const passe = (dossierId: number, marque: string) => async (): Promise<string> => {
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND champ = 'verrou58'`, [dossierId]);
  await new Promise((r) => setTimeout(r, 150)); // tient le verrou assez longtemps pour que la 2e passe le tente pendant ce temps
  await query(
    `INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode, extrait) VALUES ($1, 'verrou58', 'retenue', 'motifs', $2)`,
    [dossierId, marque]);
  return marque;
};

afterAll(async () => {
  const del = async (sql: string, id: number) => { try { await query(sql, [id]); } catch { /* best-effort */ } };
  for (const id of dossierIds) {
    await del(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1`, id);
    await del(`DELETE FROM sitadel_dossier WHERE id = $1`, id);
  }
});

describe('LOT 58 — avecVerrouDossier : une seule analyse à la fois par permis', () => {
  it('① même dossier, deux passes concurrentes → une refusée, état final = UNE passe unique', async () => {
    const d = await seedDossier();
    const [r1, r2] = await Promise.all([avecVerrouDossier(d, passe(d, 'A')), avecVerrouDossier(d, passe(d, 'B'))]);
    const oks = [r1, r2].filter((r) => r.ok);
    const occupes = [r1, r2].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);                                   // exactement UNE passe s'exécute
    expect(occupes).toHaveLength(1);                              // l'autre est REFUSÉE, pas mise en file
    expect(occupes[0]).toMatchObject({ ok: false, occupe: true });
    // état final : UNE seule ligne (la purge de la passe refusée n'a jamais tourné → aucune valeur orpheline)
    const { rows } = await query<{ extrait: string }>(`SELECT extrait FROM permis_extraction_journal WHERE dossier_id = $1 AND champ = 'verrou58'`, [d]);
    expect(rows).toHaveLength(1);
    expect(['A', 'B']).toContain(rows[0].extrait);
  });

  it('② dossiers DIFFÉRENTS, deux passes concurrentes → les DEUX s’exécutent (verrou par dossier)', async () => {
    const d1 = await seedDossier();
    const d2 = await seedDossier();
    const [r1, r2] = await Promise.all([avecVerrouDossier(d1, passe(d1, '1')), avecVerrouDossier(d2, passe(d2, '2'))]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const n1 = await query(`SELECT 1 FROM permis_extraction_journal WHERE dossier_id = $1 AND champ = 'verrou58'`, [d1]);
    const n2 = await query(`SELECT 1 FROM permis_extraction_journal WHERE dossier_id = $1 AND champ = 'verrou58'`, [d2]);
    expect(n1.rows).toHaveLength(1);
    expect(n2.rows).toHaveLength(1);
  });

  it('③ libération : après une passe, le verrou du dossier est de nouveau disponible', async () => {
    const d = await seedDossier();
    const premier = await avecVerrouDossier(d, async () => 'x');
    expect(premier).toMatchObject({ ok: true, valeur: 'x' });
    const second = await avecVerrouDossier(d, async () => 'y'); // réussit → le verrou précédent a bien été relâché (pas d'orphelin)
    expect(second).toMatchObject({ ok: true, valeur: 'y' });
  });
});
