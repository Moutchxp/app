/**
 * ══ 🔴🔴 TUILE LOCATION — « CONDITIONS D'ENTRÉE » D'UN BAIL (Arno, 20/10/2026), SUR UNE BASE JETABLE ══════════════════════
 *
 *   ① AVANT la migration 391 : un locataire se crée EXACTEMENT comme avant (sans conditions) ; avec des conditions, refus
 *      `sans_schema` et RIEN n'est écrit (ni fiche, ni occupation) ; la fiche du locataire le dit ;
 *   ② APRÈS : une entrée (2 locataires × logement + cave) = UN jeu de conditions, porté par ses 4 occupations, écrit dans
 *      la même transaction ; montants en centimes ; une trace au journal par locataire ; l'entretien est posé sur le BIEN ;
 *   ③ « Modifier » ajoute une ligne (la précédente reste), la fiche relit la plus récente ; le verrou refuse UPDATE/DELETE ;
 *   ④ des conditions incomplètes sont refusées AVANT toute écriture.
 *
 * VRAIES fonctions, VRAIE base : schéma de `svav_recette` copié, vide, SANS la table de la migration 391.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…` (elle y applique la migration 391).
 *   createdb svav_jetable_conditions && pg_dump -s -O -x -T mns_lidar_brut -T mnt_lidar_brut -T rge_alti \
 *     -T analyse_sans_lidar svav_recette | psql -q -d svav_jetable_conditions
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_conditions \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/conditionsEntree.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBien } from './portefeuilleRepo';
import { ficheLocataireLocation } from './locationRepo';
import { modifierConditionsEntree } from './conditionsEntreeRepo';
import { oublierSchemaLocation } from './sondeLocation';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest conditions entrée' };
const S = `e${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const compter = async (table: string): Promise<number> => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);
const carte = (nom: string, n: number) => ({ nom, coordonnees: [{ sorte: 'telephone' as const, valeur: `06 40 50 60 ${String(n).padStart(2, '0')}`, libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase()}.${S}@exemple.test`, libelle: 'E-mail' }] });
const CONDITIONS = {
  depot: 'bailleur', prelevement: true, jour: '10', garant: false, assurance: 'gli', assurancePrecision: 'Assureur fictif',
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: '412,26', prorataCharges: '', depotGarantie: '1 180', honorairesAgence: '0,1' },
  reglement: 'autre', reglementPrecision: 'espèces', commentaire: 'clés remises',
};
const tableLa = async (): Promise<boolean> => (await query<{ t: string | null }>(`SELECT to_regclass('gestion_location_conditions_entree')::text AS t`)).rows[0].t !== null;

describe.skipIf(!baseEssai)('🔴 conditions d’entrée — enregistrées sur le bail, avant et après la migration 391', () => {
  let logement = 0;
  let cave = 0;

  it('⓪ la base d’essai n’a pas encore la table ; un bien (logement + cave) dans le portefeuille', async () => {
    expect(await tableLa()).toBe(false);
    oublierSchemaLocation();
    const proprio = ok(await creerProprietaires({ cartes: [carte(`PROPRIO${S}`, 1)], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    const b = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [{ categorie: 'cave', etage: '-1' }],
      logement: { adresse: `9 rue Entree${S}`, famille: 'logement', typeLogement: 'appartement', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false } }, AUTEUR));
    logement = b.logementId; cave = b.annexes[0];
  });

  it('① AVANT : avec des conditions → refus, RIEN d’écrit ; sans → le locataire se crée comme avant ; la fiche le dit', async () => {
    const [fiches, occ] = [await compter('gestion_annuaire_locataire'), await compter('gestion_annuaire_occupation')];
    const refus = await creerLocatairesSurBien({ cartes: [carte(`AVANT${S}`, 2)], existants: [], contacts: [], lotId: logement, entree: '2026-10-20',
      lotIds: [logement, cave], conditions: CONDITIONS }, AUTEUR);
    expect(refus.etat).toBe('sans_schema');
    expect([await compter('gestion_annuaire_locataire'), await compter('gestion_annuaire_occupation')]).toEqual([fiches, occ]);
    const r = ok(await creerLocatairesSurBien({ cartes: [carte(`AVANT${S}`, 2)], existants: [], contacts: [], lotId: logement, entree: '2026-10-20', lotIds: [logement, cave] }, AUTEUR));
    expect(r.locataireIds).toHaveLength(1);
    const f = ok(await ficheLocataireLocation(r.locataireIds[0]));
    expect(f.conditionsEntreeDisponible).toBe(false);
    expect(f.conditionsEntree).toEqual([]);
    // Le bail d'essai se clôt par une sortie DATÉE (jamais effacée) pour libérer le logement.
    await query(`UPDATE gestion_annuaire_occupation SET sortie = '2026-10-20' WHERE locataire_id = $1`, [r.locataireIds[0]]);
  });

  it('② la migration 391, puis UNE entrée = UN jeu de conditions sur ses occupations ; journal ; entretien posé sur le bien', async () => {
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/391_location_conditions_entree.sql'), 'utf8'));
    oublierSchemaLocation();
    expect(await tableLa()).toBe(true);
    const r = ok(await creerLocatairesSurBien({ cartes: [carte(`UN${S}`, 3), carte(`DEUX${S}`, 4)], existants: [], contacts: [], lotId: logement,
      entree: '2026-11-01', lotIds: [logement, cave], conditions: CONDITIONS,
      entretien: { aPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-12-01' }] } }, AUTEUR));
    expect(r.entretienRefus).toBeNull();
    const { rows: occ } = await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_occupation WHERE locataire_id = ANY($1::bigint[]) ORDER BY id', [r.locataireIds]);
    expect(occ).toHaveLength(4);
    const { rows } = await query<Record<string, unknown>>('SELECT * FROM gestion_location_conditions_entree');
    expect(rows).toHaveLength(1);
    expect((rows[0].occupation_ids as string[]).map(String).sort()).toEqual(occ.map((o) => o.id).sort());
    expect(rows[0]).toMatchObject({ lot_id: String(logement), depot_garantie: 'bailleur', prelevement: true, prelevement_jour: 10, garant_physique: false,
      assurance_loyers: 'gli', assurance_precision: 'Assureur fictif', honoraires_locataire: 'agence', honoraires_proprietaire: 'gestion',
      prorata_loyer_centimes: '41226', prorata_charges_centimes: null, depot_garantie_centimes: '118000', honoraires_agence_centimes: '10',
      mode_reglement: 'autre', mode_reglement_precision: 'espèces', commentaire: 'clés remises', saisi_par_libelle: AUTEUR.libelle });
    const { rows: j } = await query<{ entite_id: string; commentaire: string }>(
      `SELECT entite_id::text, commentaire FROM gestion_journal WHERE entite = 'annuaire' AND action = 'location_conditions_entree' ORDER BY entite_id`);
    expect(j.map((x) => Number(x.entite_id)).sort()).toEqual([...r.locataireIds].sort());
    expect(j[0].commentaire).toContain('Total dû à l’entrée : 1');
    // L'entretien : la donnée du BIEN (la même que sa fiche).
    const { rows: e } = await query<{ a: boolean; n: number }>(
      `SELECT lo.entretien_a_prevoir AS a, (SELECT count(*)::int FROM gestion_lot_entretien x WHERE x.lot_id = lo.id AND x.retire_le IS NULL AND x.sorte = 'chaudiere') AS n
         FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [logement]);
    expect(e[0]).toEqual({ a: true, n: 1 });
    // La fiche de chacun des deux locataires montre LE bail (une seule fois, malgré la cave).
    for (const id of r.locataireIds) {
      const f = ok(await ficheLocataireLocation(id));
      expect(f.conditionsEntree).toHaveLength(1);
      expect(f.conditionsEntree?.[0].lignes.find((l) => l.mot === 'Total dû à l’entrée')?.valeur.replace(/\s/g, ' ')).toBe('1 592,36 €');
    }

    // ③ « Modifier » : une ligne de plus, la plus récente fait foi ; le verrou refuse toute réécriture.
    ok(await modifierConditionsEntree(Number(occ[1].id), { ...CONDITIONS, prelevement: false, jour: null }, AUTEUR));
    expect(await compter('gestion_location_conditions_entree')).toBe(2);
    const apres = ok(await ficheLocataireLocation(r.locataireIds[0]));
    expect(apres.conditionsEntree?.[0]).toMatchObject({ modifiees: true, conditions: { prelevement: false, jour: null } });
    await expect(query('UPDATE gestion_location_conditions_entree SET commentaire = NULL')).rejects.toThrow(/ajout seul/);
    await expect(query('DELETE FROM gestion_location_conditions_entree')).rejects.toThrow(/ajout seul/);
    expect((await modifierConditionsEntree(Number(occ[0].id), { ...CONDITIONS, depot: null }, AUTEUR)).etat).toBe('refus');
  });

  it('④ conditions incomplètes à l’entrée : refus AVANT toute écriture (ni fiche, ni occupation, ni conditions)', async () => {
    const avant = [await compter('gestion_annuaire_locataire'), await compter('gestion_annuaire_occupation'), await compter('gestion_location_conditions_entree')];
    const r = await creerLocatairesSurBien({ cartes: [carte(`TROIS${S}`, 5)], existants: [], contacts: [], lotId: logement, entree: '2026-12-01',
      lotIds: [logement], conditions: { ...CONDITIONS, assurance: 'autre', assurancePrecision: '' } }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Autre assurance : précisez laquelle.' });
    expect([await compter('gestion_annuaire_locataire'), await compter('gestion_annuaire_occupation'), await compter('gestion_location_conditions_entree')]).toEqual(avant);
  });
});
