import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { doitLancerAnalyse } from './analysePassage';

/**
 * LOT 70 — GATE de l'analyse au passage (règle b, même logique que diagnosticsVague 56-C) : l'analyse complète (payante) ne part QUE
 * si aucune analyse n'a jamais tourné OU si la GED a changé. Prouvé sur la vraie base.
 */
const dossierIds: number[] = [];
let seq = 0;

async function creerDossier(): Promise<number> {
  seq += 1;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`,
    [`TEST70G${Date.now()}${seq}`]);
  const id = rows[0].id; dossierIds.push(id); return id;
}
const ajouterDoc = (id: number, n = 1) => Promise.all(Array.from({ length: n }, (_, i) =>
  query(`INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, note) VALUES ($1, $2, $3, 'itest')`, [id, `d${i}.pdf`, `k/${id}/${i}`])));
const ajouterJournal = (id: number) =>
  query(`INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, role, methode, extrait_le) VALUES ($1, NULL, 'x', 'ecartee', 'motifs', now())`, [id]);
const memoriser = (id: number, nb: number) =>
  query(`INSERT INTO permis_completude (dossier_id, classements, nb_pieces, calcule_le, calcule_par) VALUES ($1, '[]'::jsonb, $2, now(), 'itest')
           ON CONFLICT (dossier_id) DO UPDATE SET nb_pieces = $2`, [id, nb]);

afterAll(async () => {
  for (const id of dossierIds) {
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1`, [id]).catch(() => undefined);
    await query(`DELETE FROM permis_completude WHERE dossier_id = $1`, [id]).catch(() => undefined);
    await query(`DELETE FROM dossier_document WHERE dossier_id = $1`, [id]).catch(() => undefined);
    await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]).catch(() => undefined);
  }
});

describe('doitLancerAnalyse — règle (b)', () => {
  it('aucun document → ne lance pas (rien à analyser)', async () => {
    expect(await doitLancerAnalyse(await creerDossier())).toBe(false);
  });
  it('documents présents mais JAMAIS extrait (aucun journal) → lance', async () => {
    const id = await creerDossier(); await ajouterDoc(id, 2);
    expect(await doitLancerAnalyse(id)).toBe(true);
  });
  it('déjà extrait ET GED inchangée (complétude mémorisée = nb GED) → ne relance pas', async () => {
    const id = await creerDossier(); await ajouterDoc(id, 2); await ajouterJournal(id); await memoriser(id, 2);
    expect(await doitLancerAnalyse(id)).toBe(false);
  });
  it('déjà extrait mais GED CHANGÉE (nb GED ≠ mémorisé) → relance', async () => {
    const id = await creerDossier(); await ajouterDoc(id, 3); await ajouterJournal(id); await memoriser(id, 2);
    expect(await doitLancerAnalyse(id)).toBe(true);
  });
});
