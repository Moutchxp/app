import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { enregistrerReperage, lireReperagePlanchesOui, lireRunsReperage } from './reperePlanchesRepo';
import type { ResultatReperage } from './reperePlanches';

/**
 * 🔴 LOT 62 — TEST DE LIVRAISON (vraie base) de la persistance du repérage : PRÉSENCE par page + audit, REJOUABLE (2e clic remplace,
 * ne double pas), et SANS OBJET par CASCADE si la pièce quitte la GED. Aucun appel API. Fixtures isolées + nettoyage afterAll.
 */
const dossierIds: number[] = [];
let seq = 0;

async function seed(): Promise<{ dossierId: number; pieceId: number }> {
  seq += 1;
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TEST62${980000 + seq}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage, note) VALUES ($1, 'notice-62.pdf', $2, 'test 62') RETURNING id::int AS id`,
    [dossierId, `dossiers/${dossierId}/notice-62.pdf`]);
  return { dossierId, pieceId: d[0].id };
}

const resultat = (verdicts: ResultatReperage['verdicts'], ecartees: ResultatReperage['pagesEcartees']): ResultatReperage => ({
  pagesEnvoyees: verdicts.map((v) => v.page), pagesEcartees: ecartees, verdicts,
});
const audit = { modele: 'mistral-medium-latest', modeleResolu: 'mistral-medium-2505', tokensIn: 2400, tokensOut: 16, coutUsd: 0.001, par: 'admin' };

afterAll(async () => {
  for (const id of dossierIds) { try { await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]); } catch { /* CASCADE */ } }
});

describe('LOT 62 — persistance du repérage : oui pour le best-of, audit visible, rejouable, sans objet par cascade', () => {
  it('① persiste les verdicts + l’audit ; le best-of lit les « oui »', async () => {
    const { dossierId, pieceId } = await seed();
    const ok = await enregistrerReperage(dossierId, pieceId, resultat(
      [{ page: 6, verdict: 'oui', categorie: 'plan' }, { page: 9, verdict: 'incertain', categorie: 'aucune' }, { page: 2, verdict: 'non', categorie: 'aucune' }],
      [{ page: 1, motif: 'cartouche émetteur (rédaction/vérification/validation) nommant des personnes' }],
    ), audit);
    expect(ok).toBe(true);
    // best-of : seules les pages « oui »
    expect((await lireReperagePlanchesOui(dossierId)).get(pieceId)).toEqual([{ page: 6, categorie: 'plan' }]);
    // audit : planches / incertaines / écartées + coût
    const run = (await lireRunsReperage(dossierId)).get(pieceId)!;
    expect(run.nbPlanches).toBe(1);
    expect(run.incertaines).toEqual([9]);
    expect(run.pagesEcartees).toEqual([{ page: 1, motif: expect.stringMatching(/cartouche émetteur/i) }]);
    expect(run.coutUsd).toBeCloseTo(0.001, 6);
    expect(run.modele).toBe('mistral-medium-2505');
  });

  it('② REJOUABLE : un second enregistrement REMPLACE (ne double pas)', async () => {
    const { dossierId, pieceId } = await seed();
    await enregistrerReperage(dossierId, pieceId, resultat([{ page: 6, verdict: 'oui', categorie: 'plan' }, { page: 7, verdict: 'oui', categorie: 'facade' }], []), audit);
    await enregistrerReperage(dossierId, pieceId, resultat([{ page: 10, verdict: 'oui', categorie: 'plan' }], [{ page: 1, motif: 'signature de personne détectée' }]), audit);
    expect((await lireReperagePlanchesOui(dossierId)).get(pieceId)).toEqual([{ page: 10, categorie: 'plan' }]); // ni 6 ni 7 : remplacé
    const { rows } = await query(`SELECT count(*)::int AS n FROM permis_planche_vision_run WHERE piece_id = $1`, [pieceId]);
    expect(rows[0].n).toBe(1); // une seule ligne d'audit (pas de doublon)
  });

  it('③ SANS OBJET : la pièce quitte la GED → verdicts ET audit disparaissent (cascade)', async () => {
    const { dossierId, pieceId } = await seed();
    await enregistrerReperage(dossierId, pieceId, resultat([{ page: 6, verdict: 'oui', categorie: 'plan' }], []), audit);
    await query(`DELETE FROM dossier_document WHERE id = $1`, [pieceId]);
    expect((await lireReperagePlanchesOui(dossierId)).size).toBe(0);
    expect((await lireRunsReperage(dossierId)).size).toBe(0);
  });
});
