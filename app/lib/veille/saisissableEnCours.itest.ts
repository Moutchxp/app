import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../db/client';
import { chargerDemandesSuivi } from './reponsesSuivi';
import { lireSaisinesEligibles } from './saisineCadaRepo';
import { estEnCoursAffichee } from '../sitadel/demandesListe';
import { marquerDossierPartiel } from '../permis/dossierPartielRepo';

/**
 * 🔴 LOT-10 — une demande dont la saisine CADA devient POSSIBLE QUITTE « En cours » pour « Saisines CADA » (invariant « jamais dans deux
 * onglets »), et la bascule est RÉVERSIBLE (l'éligibilité est dérivée, jamais écrite : si elle retombe, la demande revient). Vraie base.
 * Le foyer est UNIQUE : `lireSaisinesEligibles.saisissables`, surfacé sur DemandeSuivi.saisissable, lu par la liste, le compteur ET
 * estEnCoursAffichee. Sans le correctif (`&& d.saisissable !== true` retiré), estEnCoursAffichee garde la demande en En cours → l'assertion échoue.
 */
const demandeIds: number[] = [];
const dossierIds: number[] = [];

async function codeInseeExistant(): Promise<string> {
  const { rows } = await query<{ code_insee: string }>(`SELECT code_insee FROM demande LIMIT 1`);
  if (!rows[0]) throw new Error('aucune demande existante pour emprunter un code_insee');
  return rows[0].code_insee;
}

/** Demande SAISISSABLE : envoyée il y a 46 j (refus tacite acquis, non forclos) + 1 dossier DÛ + aucune saisine + aucun marqueur partiel.
 *  (La relève de la base de dev est fraîche → releveEstFraiche vrai ; pas besoin de la simuler.) */
async function seedSaisissable(): Promise<number> {
  const ref = `SVAV-DEM-2099-${String(910001 + demandeIds.length).slice(0, 6)}`;
  const { rows: d } = await query<{ id: number }>(
    `INSERT INTO demande (reference, code_insee, statut) VALUES ($1, $2, 'envoyee') RETURNING id::int AS id`, [ref, await codeInseeExistant()]);
  const id = d[0].id; demandeIds.push(id);
  await query(`INSERT INTO demande_acheminement (demande_id, canal, statut, envoye_le) VALUES ($1, 'email', 'envoye', now() - interval '46 days')`, [id]);
  const suffixe = String(910001 + dossierIds.length);
  const { rows: s } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`, [`TESTSAIS${suffixe}`]);
  const dossierId = s[0].id; dossierIds.push(dossierId);
  await query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif) VALUES ($1, $2, true)`, [id, dossierId]); // satisfait_le NULL → dû
  return id;
}

afterAll(async () => {
  for (const id of demandeIds) {
    await query(`DELETE FROM demande_journal WHERE demande_id = $1`, [id]);
    await query(`DELETE FROM demande_acheminement WHERE demande_id = $1`, [id]);
    await query(`DELETE FROM demande_dossier WHERE demande_id = $1`, [id]);
    await query(`DELETE FROM demande WHERE id = $1`, [id]);
  }
  for (const id of dossierIds) await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [id]);
});

const richDe = async (id: number) => (await chargerDemandesSuivi()).demandes.find((d) => d.demandeId === id);

describe('LOT-10 — saisissable quitte En cours pour Saisines CADA (réversible, foyer unique)', () => {
  it('devient saisissable → hors En cours ET dans la liste Saisines (même foyer)', async () => {
    const id = await seedSaisissable();
    const rich = await richDe(id);
    expect(rich, 'la demande doit être dans le suivi').toBeDefined();
    expect(rich!.saisissable, 'saisine CADA possible → saisissable').toBe(true);
    expect(estEnCoursAffichee(rich!), '🔴 saisissable → n’est PLUS affichée en En cours').toBe(false);
    const elig = await lireSaisinesEligibles();
    expect(elig.saisissables.some((s) => s.demandeId === id), 'MÊME foyer : présente dans la liste Saisines').toBe(true);
  });

  it('éligibilité retirée (marqueur partiel → butoir CASC-2 futur) → RÉVERSIBLE : revient en En cours, sort de Saisines', async () => {
    const id = await seedSaisissable();
    // marqueur partiel actif : partiel_le = maintenant → butoir prolongé (≈ +1 mois +4 j) NON atteint → lireSaisinesEligibles l'écarte.
    await marquerDossierPartiel(id, ['cerfa'], 'declaree');
    const rich = await richDe(id);
    expect(rich!.saisissable, 'butoir partiel non atteint → plus saisissable').toBe(false);
    expect(estEnCoursAffichee(rich!), 'réversible : de retour en En cours (dérivé, aucun état figé)').toBe(true);
    expect((await lireSaisinesEligibles()).saisissables.some((s) => s.demandeId === id), 'plus dans la liste Saisines').toBe(false);
  });
});
