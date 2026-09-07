import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../db/client';

/**
 * P-fond 4a — SOCLE GÉNÉRIQUE `permis_best_of_precalcul` (migration 209) : la clé est (dossier_id, type), le type est une LISTE FERMÉE
 * (GARDE) contrainte EN BASE. Ce test verrouille, sur la VRAIE base, que :
 *   ① un type HORS liste est REFUSÉ par la base (jamais une ligne fantôme sur une faute de frappe) ;
 *   ② une écriture SANS type est REFUSÉE (NOT NULL, sans DEFAULT → aucun appelant ne peut écrire sans type) ;
 *   ③ deux types coexistent pour un même dossier, mais un doublon (dossier × type) est refusé (PK composite).
 * Fixture isolée (un dossier jetable) + nettoyage afterAll (CASCADE efface les lignes de pré-calcul du test).
 */
const NUM_DAU = 'TESTTYPE4A';
let dossierId: number;

const insererPrecalc = (type: string | null) =>
  query(`INSERT INTO permis_best_of_precalcul (dossier_id, type, empreinte, resultat) VALUES ($1, $2, 'EMP', '{}'::jsonb)`, [dossierId, type]);

beforeAll(async () => {
  await query(`DELETE FROM sitadel_dossier WHERE type = 'PC' AND num_dau = $1`, [NUM_DAU]); // défensif : run précédent interrompu
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [NUM_DAU]);
  dossierId = rows[0].id;
});

afterAll(async () => {
  if (dossierId) await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [dossierId]); // CASCADE → efface les lignes permis_best_of_precalcul du test
});

describe('P-fond 4a — permis_best_of_precalcul : clé (dossier_id, type) + liste fermée', () => {
  it('🔴 REFUSE un type HORS liste (faute de frappe → jamais une ligne fantôme)', async () => {
    await expect(insererPrecalc('bogus')).rejects.toMatchObject({ code: '23514' });    // check_violation
    await expect(insererPrecalc('best-of')).rejects.toMatchObject({ code: '23514' });  // tiret ≠ underscore : refusé aussi
    await expect(insererPrecalc('BEST_OF')).rejects.toMatchObject({ code: '23514' });  // casse différente : refusée
  });

  it('🔴 REFUSE une écriture SANS type (NOT NULL, aucun DEFAULT → aucun appelant ne peut écrire sans type)', async () => {
    await expect(insererPrecalc(null)).rejects.toMatchObject({ code: '23502' }); // not_null_violation
  });

  it('accepte la LISTE FERMÉE (best_of ET completude coexistent) et impose la PK (dossier_id, type)', async () => {
    await expect(insererPrecalc('best_of')).resolves.toBeDefined();
    await expect(insererPrecalc('completude')).resolves.toBeDefined();          // composite PK → coexistence pour le MÊME dossier
    await expect(insererPrecalc('best_of')).rejects.toMatchObject({ code: '23505' }); // doublon (dossier, type) → PK violée (unique_violation)
    const { rows } = await query<{ type: string }>(`SELECT type FROM permis_best_of_precalcul WHERE dossier_id = $1 ORDER BY type`, [dossierId]);
    expect(rows.map((r) => r.type)).toEqual(['best_of', 'completude']);
  });
});
