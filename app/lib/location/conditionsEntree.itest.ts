/**
 * ══ 🔴🔴 TUILE LOCATION — « CONDITIONS D'ENTRÉE » D'UN BAIL (Arno, 20/10/2026), SUR UNE BASE JETABLE ══════════════════════
 *
 *   ① AVANT la migration 391 : un locataire se crée EXACTEMENT comme avant (sans conditions) ; avec des conditions, refus
 *      `sans_schema` et RIEN n'est écrit (ni fiche, ni occupation) ; la fiche du locataire le dit ;
 *   ② APRÈS : une entrée (2 locataires × logement + cave) = UN jeu de conditions, porté par ses 4 occupations, écrit dans
 *      la même transaction ; montants en centimes ; une trace au journal par locataire ; l'entretien est posé sur le BIEN ;
 *   ③ « Modifier » ajoute une ligne (la précédente reste), la fiche relit la plus récente ; le verrou refuse UPDATE/DELETE ;
 *   ④ des conditions incomplètes sont refusées AVANT toute écriture ;
 *   ⑤ 🔴 Arno (25/10/2026) — le dossier COMPLET : un montant VIDE (loyer, dépôt, honoraires agence) ou des honoraires propriétaire sans
 *      montant (aucun barème à la date) sont refusés par le SERVEUR, rien n'est écrit ; « 0 » est accepté.
 *
 * VRAIES fonctions, VRAIE base : schéma de `svav_recette` copié, vide, SANS la table de la migration 391.
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou `svav_test…` (elle y applique la migration 391).
 *   (sans la table de la 391, que la recette a déjà : l'épreuve rejoue « avant », puis 391, puis 392)
 *   createdb svav_jetable_conditions && pg_dump -s -O -x -T mns_lidar_brut -T mnt_lidar_brut -T rge_alti \
 *     -T analyse_sans_lidar -T gestion_location_conditions_entree svav_recette | psql -q -d svav_jetable_conditions
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
import { ajouterBareme, calculHonorairesDuBien } from './honorairesProprietaireRepo';
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
  // 🔴 Arno (25/10/2026) — le dossier COMPLET : loyer (dans les conditions, comme l'écran l'envoie), paiement des charges, indice.
  loyer: { principal: '1 180,10', provisions: '90' }, chargesCopro: 'agence', indice: { type: 'irl', reference: '2026-2', revision: '2027-11-01' },
};
const tableLa = async (): Promise<boolean> => (await query<{ t: string | null }>(`SELECT to_regclass('gestion_location_conditions_entree')::text AS t`)).rows[0].t !== null;

describe.skipIf(!baseEssai)('🔴 conditions d’entrée — enregistrées sur le bail, avant et après la migration 391', () => {
  let logement = 0;
  let cave = 0;
  let proprietaire = 0;

  it('⓪ la base d’essai n’a pas encore la table ; un bien (logement + cave) dans le portefeuille', async () => {
    expect(await tableLa()).toBe(false);
    oublierSchemaLocation();
    const proprio = ok(await creerProprietaires({ cartes: [carte(`PROPRIO${S}`, 1)], enGestion: true, numeroMandat: `MG-${S}` }, AUTEUR)).ids[0];
    const b = ok(await creerBienComplet({ proprietaireIds: [proprio], annexes: [{ categorie: 'cave', etage: '-1' }],
      logement: { adresse: `9 rue Entree${S}`, codePostal: '75011', commune: 'PARIS', surfaceCarrezM2: '41,8', famille: 'logement', typeLogement: 'appartement',
        dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false } }, AUTEUR));
    logement = b.logementId; cave = b.annexes[0];
    proprietaire = proprio;
    // La table des zones (383) : la règle « Paris » de l'amorce, telle qu'en recette (le schéma copié est vide).
    await query(`INSERT INTO gestion_zone_tendue (portee, code, libelle, source) VALUES ('departement', '75', 'Paris', 'itest')`);
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
    // 391 seule : les conditions ne s'enregistrent pas encore (il faut aussi la 392) — refus, rien d'écrit.
    oublierSchemaLocation();
    expect((await creerLocatairesSurBien({ cartes: [carte(`ENTRE${S}`, 6)], existants: [], contacts: [], lotId: logement, entree: '2026-11-01',
      lotIds: [logement, cave], conditions: CONDITIONS }, AUTEUR)).etat).toBe('sans_schema');
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/392_location_honoraires_proprietaire.sql'), 'utf8'));
    /* 🔴 25/10/2026 — la base d'essai est le schéma de la recette d'AUJOURD'HUI (le bail, 393, y est déjà) : la table recréée par 391-392
       reçoit ce que les migrations suivantes lui ont ajouté — le bail (les seules instructions de la 393 sur cette table), le montant
       saisi à la main (402), l'indice des loyers (423 : rejouable). */
    await query(`ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail(id);
      ALTER TABLE gestion_location_conditions_entree ALTER COLUMN occupation_ids DROP NOT NULL;
      ALTER TABLE gestion_location_conditions_entree DROP CONSTRAINT IF EXISTS gestion_location_conditions_entree_occupation_ids_check;
      ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_date_bareme date;
      ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_date_supposee boolean;`);
    for (const m of ['402_location_honoraires_saisis.sql', '423_location_indices_loyers.sql']) await query(readFileSync(path.join(process.cwd(), 'db/migrations', m), 'utf8'));
    oublierSchemaLocation();
    // L'amorce « très tendue » a été posée sur la règle de Paris, « à vérifier ».
    expect((await query<{ t: boolean; s: string }>(`SELECT tres_tendue AS t, tres_tendue_source AS s FROM gestion_zone_tendue WHERE code = '75'`)).rows[0])
      .toEqual({ t: true, s: 'Zone très tendue (décret n° 2014-890, honoraires de location) — amorce, à vérifier' });
    expect(await tableLa()).toBe(true);
    const r = ok(await creerLocatairesSurBien({ cartes: [carte(`UN${S}`, 3), carte(`DEUX${S}`, 4)], existants: [], contacts: [], lotId: logement,
      entree: '2026-11-01', lotIds: [logement, cave], conditions: CONDITIONS,
      entretien: { aPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-12-01' }] },
      loyer: { principal: '1 180,10', provisions: '90' } }, AUTEUR));
    // LE LOYER MENSUEL (Arno, 20/10/2026) : le loyer de départ (370) — depuis la 393, porté par LE BAIL (une ligne, aucune occupation).
    const { rows: loy } = await query<{ occupation_id: string | null; bail_id: string; loyer_hc: string; provisions: string }>(
      `SELECT c.occupation_id::text, c.bail_id::text, c.loyer_hc::text, c.provisions::text FROM gestion_location_conditions c WHERE c.bail_id = $1`, [r.bailId]);
    expect(loy).toEqual([{ occupation_id: null, bail_id: String(r.bailId), loyer_hc: '1180.1', provisions: '90' }]);
    expect(r.entretienRefus).toBeNull();
    const { rows: occ } = await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_occupation WHERE locataire_id = ANY($1::bigint[]) ORDER BY id', [r.locataireIds]);
    expect(occ).toHaveLength(4);
    const { rows } = await query<Record<string, unknown>>('SELECT * FROM gestion_location_conditions_entree');
    expect(rows).toHaveLength(1);
    // Depuis la 393 : les conditions sont portées par le BAIL (ses 4 occupations le rejoignent), plus par une liste d'occupations.
    expect([rows[0].occupation_ids, String(rows[0].bail_id)]).toEqual([null, String(r.bailId)]);
    const { rows: duBail } = await query<{ id: string }>('SELECT id::text FROM gestion_annuaire_occupation WHERE bail_id = $1 ORDER BY id', [r.bailId]);
    expect(duBail.map((o) => o.id)).toEqual(occ.map((o) => o.id));
    // 🔴 423 — l'indice du bail, sur ses conditions.
    expect(rows[0]).toMatchObject({ indice_type: 'irl', indice_annee: 2026, indice_trimestre: 2 });
    expect(rows[0]).toMatchObject({ lot_id: String(logement), depot_garantie: 'bailleur', prelevement: true, prelevement_jour: 10, garant_physique: false,
      assurance_loyers: 'gli', assurance_precision: 'Assureur fictif', honoraires_locataire: 'agence', honoraires_proprietaire: 'gestion',
      prorata_loyer_centimes: '41226', prorata_charges_centimes: null, depot_garantie_centimes: '118000', honoraires_agence_centimes: '10',
      mode_reglement: 'autre', mode_reglement_precision: 'espèces', commentaire: 'clés remises', saisi_par_libelle: AUTEUR.libelle,
      // La TRACE des honoraires propriétaire : 41,8 m² × 12,10 (très tendue) + 41,8 × 3,03, au barème du 01/01/2026, exacts.
      hono_surface_m2: '41.8', hono_zone: 'tres_tendue', hono_tarif_zone_m2: '12.1', hono_tarif_edl_m2: '3.03',
      hono_visite_bail: '505.78', hono_etat_des_lieux: '126.654', hono_total_proprietaire: '632.434', hono_motif: null });
    const { rows: bar } = await query<{ id: string; depuis: string }>('SELECT id::text, depuis::text FROM gestion_bareme_honoraires_location');
    expect(bar).toEqual([{ id: String(rows[0].hono_bareme_id), depuis: '2026-01-01' }]);
    const { rows: j } = await query<{ entite_id: string; commentaire: string }>(
      `SELECT entite_id::text, commentaire FROM gestion_journal WHERE entite = 'annuaire' AND action = 'location_conditions_entree' ORDER BY entite_id`);
    expect(j.map((x) => Number(x.entite_id)).sort()).toEqual([...r.locataireIds].sort());
    expect(j[0].commentaire).toContain('Total dû à l’entrée : 1');
    // L'entretien : la donnée du BIEN (la même que sa fiche).
    const { rows: e } = await query<{ a: boolean; n: number }>(
      `SELECT lo.entretien_a_prevoir AS a, (SELECT count(*)::int FROM gestion_lot_entretien x WHERE x.lot_id = lo.id AND x.retire_le IS NULL AND x.sorte = 'chaudiere') AS n
         FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [logement]);
    expect(e[0]).toEqual({ a: true, n: 1 });
    // 🔴 Le paiement des charges : la donnée du BIEN (400), écrite sur lui et à son Historique.
    expect((await query<{ c: string }>('SELECT charges_copro AS c FROM gestion_annuaire_lot WHERE id = $1', [logement])).rows[0].c).toBe('agence');
    expect((await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND commentaire LIKE '%Paiement des charges%'`, [logement])).rows[0].n).toBe(1);
    // La fiche de chacun des deux locataires montre LE bail (une seule fois, malgré la cave).
    for (const id of r.locataireIds) {
      const f = ok(await ficheLocataireLocation(id));
      expect(f.conditionsEntree).toHaveLength(1);
      expect(f.conditionsEntree?.[0].lignes.find((l) => l.mot === 'Total dû à l’entrée')?.valeur.replace(/\s/g, ' ')).toBe('1 592,36 €');
    }

    // ③ « Modifier » : une ligne de plus, la plus récente fait foi ; le verrou refuse toute réécriture.
    // Le loyer relu dans l'encart (même donnée que la carte « Location »).
    const avant = ok(await ficheLocataireLocation(r.locataireIds[1]));
    expect(avant.conditionsEntree?.[0].loyer).toEqual({ principal: 118010, provisions: 9000 });
    expect(avant.conditionsEntree?.[0].lignes.find((l) => l.mot === 'Total loyer charges comprises / mois')?.valeur.replace(/\s/g, ' ')).toBe('1 270,10 €');
    ok(await modifierConditionsEntree(Number(occ[1].id), { ...CONDITIONS, prelevement: false, jour: null, loyer: { principal: '1 200', provisions: '90' } }, AUTEUR));
    // Un loyer CHANGÉ : une ligne de plus sur le MÊME bail (jamais un second porteur).
    const { rows: loy2 } = await query<{ bail_id: string; loyer_hc: string }>(
      `SELECT bail_id::text, loyer_hc::text FROM gestion_location_conditions WHERE bail_id = $1 ORDER BY id`, [r.bailId]);
    expect(loy2.map((x) => x.loyer_hc)).toEqual(['1180.1', '1200']);
    expect(new Set(loy2.map((x) => x.bail_id)).size).toBe(1);
    expect(await compter('gestion_location_conditions_entree')).toBe(2);
    const apres = ok(await ficheLocataireLocation(r.locataireIds[0]));
    expect(apres.conditionsEntree?.[0]).toMatchObject({ modifiees: true, conditions: { prelevement: false, jour: null },
      honoraires: { etat: 'ok', total: '632.434', zone: 'tres_tendue' } });
    expect(apres.conditionsEntree?.[0].lignes.find((l) => l.mot === 'Total des honoraires')?.valeur.replace(/\s/g, ' ')).toBe('632,53 €');
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

  it('⑤ champ VIDE refusé par le serveur (0 accepté) ; barème PAR DATE : avant 2026 → pas de montant → refusé ; un barème 2027 sert en 2027', async () => {
    const bien = async (n: number) => ok(await creerBienComplet({ proprietaireIds: [proprietaire], annexes: [], logement: {
      adresse: `${n} rue Bareme${S}`, codePostal: '69001', commune: 'LYON', surfaceCarrezM2: '50', famille: 'logement', typeLogement: 'studio',
      dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false } }, AUTEUR)).logementId;
    const ancien = await bien(1);
    const compte = async () => [await compter('gestion_annuaire_locataire'), await compter('gestion_annuaire_occupation'), await compter('gestion_location_conditions_entree')];
    const avant = await compte();
    const essai = (conditions: Record<string, unknown>, entree = '2026-06-01') => creerLocatairesSurBien({ cartes: [carte(`VIDE${S}`, 7)], existants: [], contacts: [],
      lotId: ancien, entree, lotIds: [ancien], conditions }, AUTEUR);
    // Un champ VIDE (même un seul) : refus explicite du serveur, rien d'écrit.
    expect(await essai({ ...CONDITIONS, loyer: { principal: '', provisions: '90' } })).toEqual({ etat: 'refus', motif: 'Loyer mensuel : le loyer principal (0 si aucun).' });
    expect(await essai({ ...CONDITIONS, sommes: { ...CONDITIONS.sommes, depotGarantie: '' } })).toEqual({ etat: 'refus', motif: 'Sommes dues à l’entrée : le dépôt de garantie (0 si aucun).' });
    expect(await essai({ ...CONDITIONS, sommes: { ...CONDITIONS.sommes, honorairesAgence: ' ' } })).toEqual({ etat: 'refus', motif: 'Sommes dues à l’entrée : les honoraires agence (0 si aucun).' });
    expect(await essai({ ...CONDITIONS, chargesCopro: null })).toEqual({ etat: 'refus', motif: 'Paiement des charges : payées par l’agence ou par le propriétaire ?' });
    // Aucun barème au 01/06/2025 : pas de montant d'honoraires propriétaire → refusé (il se saisit, migration 402).
    expect(await essai({ ...CONDITIONS, jour: '15' }, '2025-06-01')).toEqual({ etat: 'refus',
      motif: 'Honoraires propriétaire : le montant (€ HT) est obligatoire (Aucun barème d’honoraires en vigueur au 01/06/2025) — saisissez-le (0 si aucun).' });
    expect(await compte()).toEqual(avant);
    // « 0 » est une valeur : accepté.
    const r0 = ok(await essai({ ...CONDITIONS, jour: '15', loyer: { principal: '0', provisions: '0' }, sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '0', honorairesAgence: '0' } }));
    expect(ok(await ficheLocataireLocation(r0.locataireIds[0])).conditionsEntree?.[0]).toMatchObject({ conditions: { jour: 15, sommes: { depotGarantie: 0, honorairesAgence: 0 } } });

    ok(await ajouterBareme({ depuis: '2027-01-01', tresTendue: '12,50', tendue: '10,40', autre: '8,30', etatDesLieux: '3,10', source: 'barème d’essai' }, AUTEUR));
    expect(await compter('gestion_bareme_honoraires_location')).toBe(2);
    await expect(query('UPDATE gestion_bareme_honoraires_location SET autre_m2 = 0')).rejects.toThrow(/ajout seul/);
    const nouveau = await bien(2);
    expect(await calculHonorairesDuBien(nouveau, '2026-12-31')).toMatchObject({ etat: 'ok', zone: 'autre', tarifZone: '8.07', total: '555' });
    expect(await calculHonorairesDuBien(nouveau, '2027-02-01')).toMatchObject({ etat: 'ok', zone: 'autre', tarifZone: '8.3', visiteBail: '415', etatDesLieux: '155', total: '570' });
    const { rows: j } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_journal WHERE action = 'honoraires_location_bareme'`);
    expect(j[0].n).toBe(1);
  });
});
