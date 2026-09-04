import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { query } from '../db/client';
import { reporterDeclarationsCerfa } from './cerfaRecapRepo';
import { lirePermisCaracteristiques, ecrireCaracteristiquesGlobales } from './caracteristiquesRepo';
import type { DeclarationsRecapCerfa } from './recapCerfa';

/**
 * LOT 70 — TEST DE LIVRAISON (vraie base) : le report des déclarations dans les champs REMPLIT les vides, N'ÉCRASE JAMAIS une saisie,
 * et les valeurs SURVIVENT AU RECHARGEMENT (relecture indépendante depuis la base — le piège N10-L : un bouton qui pose sans
 * enregistrer). Fixtures isolées + nettoyage afterAll.
 */
const DECL = (o: Partial<DeclarationsRecapCerfa> = {}): DeclarationsRecapCerfa => ({
  dateDepot: '04/11/2025', superficieTerrainM2: 5015, logementsTotal: 67, logementsIndividuels: 0, logementsCollectifs: 67,
  niveauxDessusSol: 5, niveauxDessousSol: 1, stationnementAvant: 0, stationnementApres: 49, empriseAuSolCreeeM2: 1354,
  surfacePlancherTotaleM2: 4994, descriptionProjet: null, decompte: null, absents: [], ambigus: [], present: true, ...o,
});

let dossierId = 0;
let recapAutorise = false;
let seq = 0;

async function creerDossier(): Promise<number> {
  seq += 1;
  const { rows } = await query<{ id: number }>(
    `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
       VALUES ('PC', $1, '99999', '99', '2099-01', '2099-01') RETURNING id::int AS id`,
    [`TEST70R${Date.now()}${seq}`]);
  return rows[0].id;
}

beforeAll(async () => {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='permis_extraction_journal'::regclass AND conname='permis_journal_methode_chk'`);
  recapAutorise = rows[0]?.def?.includes("'recap'") ?? false; // migration 193 appliquée ?
});

afterAll(async () => {
  const del = async (sql: string) => { try { await query(sql, [dossierId]); } catch { /* best-effort */ } };
  await del(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1`);
  await del(`DELETE FROM permis_caracteristique WHERE dossier_id = $1`);
  await del(`DELETE FROM sitadel_dossier WHERE id = $1`);
});

describe('reporterDeclarationsCerfa — report réel dans les champs', () => {
  it('remplit les 3 champs VIDES ; les valeurs SURVIVENT à une relecture indépendante (anti N10-L)', async () => {
    dossierId = await creerDossier();
    const colonnes = await reporterDeclarationsCerfa(dossierId, DECL(), 'Recapitulatif de la demande-19.pdf', 'itest');
    expect(colonnes.sort()).toEqual(['nb_logements', 'nb_places_stationnement', 'surface_plancher_m2']);

    // RELECTURE INDÉPENDANTE (comme un rechargement de page : nouvelle requête, aucun état en mémoire).
    const relu = await lirePermisCaracteristiques(dossierId);
    expect(relu.global?.nbLogements).toBe(67);
    expect(relu.global?.nbPlacesStationnement).toBe(49);
    expect(relu.global?.surfacePlancherM2).toBe(4994);
    expect(relu.global?.nbLogementsOrigine).toBe('extraite');

    if (recapAutorise) {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap' AND role = 'retenue' AND confiance = 'a_verifier'`, [dossierId]);
      expect(rows[0].n).toBe(3); // provenance journalisée, confiance jamais 'confirmee'
    }
  });

  it('🔴 un champ SAISIE n’est JAMAIS écrasé (invariant 103)', async () => {
    // La main pose nb_logements = 12 (saisie). Le report ne doit pas y toucher.
    await ecrireCaracteristiquesGlobales(dossierId, { nbLogements: 12 }, 'saisie', 'humain');
    const colonnes = await reporterDeclarationsCerfa(dossierId, DECL({ logementsTotal: 67 }), 'Recap.pdf', 'itest');
    expect(colonnes).not.toContain('nb_logements');

    const relu = await lirePermisCaracteristiques(dossierId);
    expect(relu.global?.nbLogements).toBe(12);              // valeur saisie intacte
    expect(relu.global?.nbLogementsOrigine).toBe('saisie'); // origine intacte
  });

  it('un champ détenu par une méthode SUPÉRIEURE (cerfa) n’est pas écrasé par recap', async () => {
    const d2 = await creerDossier();
    try {
      // Simule un champ écrit par 'cerfa' : valeur + une ligne de journal 'retenue' methode='cerfa' (propriétaire de précédence).
      await ecrireCaracteristiquesGlobales(d2, { surfacePlancherM2: 3000 }, 'extraite', 'cerfa-sim');
      await query(
        `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, role, methode, confiance, extrait_le)
           VALUES ($1, NULL, 'surface_plancher_m2', 'retenue', 'cerfa', 'a_verifier', now())`, [d2]);
      const colonnes = await reporterDeclarationsCerfa(d2, DECL({ surfacePlancherTotaleM2: 4994 }), 'Recap.pdf', 'itest');
      expect(colonnes).not.toContain('surface_plancher_m2');
      const relu = await lirePermisCaracteristiques(d2);
      expect(relu.global?.surfacePlancherM2).toBe(3000); // la valeur cerfa reste
    } finally {
      await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1`, [d2]).catch(() => undefined);
      await query(`DELETE FROM permis_caracteristique WHERE dossier_id = $1`, [d2]).catch(() => undefined);
      await query(`DELETE FROM sitadel_dossier WHERE id = $1`, [d2]).catch(() => undefined);
    }
  });
});
