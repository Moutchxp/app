/**
 * ══ 🔴🔴 « SUPPRIMER UN DES BIENS D'UN PROPRIÉTAIRE » (Arno, 18/10/2026), SUR UNE BASE JETABLE ══════════════════════════
 *
 *   ① la liste des biens actifs (annexes détachées comprises, locataires, autre propriétaire) ; refus sans sélection,
 *      sans origine, ou avec un bien qui n'est pas à lui — rien n'est écrit ;
 *   ② un bien occupé : refus sans confirmation ; confirmé : le bien et TOUTES ses annexes sortent (même instant), la
 *      location est close aujourd'hui, le locataire archivé sauf s'il loue ailleurs, l'origine enregistrée sur chaque
 *      bien, le propriétaire reste actif ; la Gestion le montre « Ancien » ; aucune ligne effacée ;
 *   ③ un bien partagé avec un autre propriétaire actif : il sort pour tous ;
 *   ④ réactiver le bien : ses annexes (détachées comprises) reviennent ; l'origine reste dans l'historique ;
 *   ⑤ TOUS les biens actifs choisis : c'est l'archivage du propriétaire (archivé aussi dans la Gestion).
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide). 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou
 * `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l23 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/sortieBiens.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ajouterProprietaireAuLot, creerPersonne } from '../gestion/annuaireEditionRepo';
import { ficheProprietaire } from '../gestion/annuaireRepo';
import { ajouterAnnexe, creerProprietaireEtBiens } from './locationRepo';
import { detacherAnnexe } from './entretienAnnexeRepo';
import {
  apercuSortieBiens, biensPourSortie, creerLocataireSurBien, reactiverDansPortefeuille, sortieDe, sortirBiensDuPortefeuille,
} from './portefeuilleRepo';
import { MOTIF_BIEN_HORS_SELECTION, MOTIF_OCCUPATION_A_CONFIRMER, MOTIF_ORIGINE_REQUISE, MOTIF_SELECTION_VIDE } from './archivage';

/** Arno (18/10/2026) : DPE et « Entretien à prévoir » obligatoires à la création d'un logement — l'ancienne voie aussi. */
const DPE_ENTRETIEN = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest sortie de biens' };
const S = `s${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const compter = async (table: string): Promise<number> => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);
const sorti = async (table: string, id: number): Promise<string | null> =>
  (await query<{ le: string | null }>(`SELECT sorti_portefeuille_le::text AS le FROM ${table} WHERE id = $1`, [id])).rows[0].le;
const VENTE = { origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: null };

describe.skipIf(!baseEssai)('🔴 sortir des biens d’un propriétaire (jamais d’effacement)', () => {
  let proprio = 0; let autre = 0; let tiers = 0;
  let loue = 0; let cave = 0; let parking = 0; let libre = 0; let partage = 0; let ailleurs = 0;
  let locSeul = 0; let locMulti = 0;

  it('① la liste des biens ; refus sans sélection, sans origine, ou avec un bien d’un autre — rien n’est écrit', async () => {
    const a = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `BIENS${S}`, telephone: '06 51 51 51 51', email: `biens.${S}@exemple.test` },
      logement: { ...DPE_ENTRETIEN, adresse: `1 rue Louee${S}`, codePostal: '75011', commune: 'Paris' }, annexes: [{ categorie: 'cave', porte: '1' }] }, AUTEUR));
    proprio = a.proprietaireId; loue = a.logementId;
    cave = (await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe WHERE parent_id = $1', [loue])).rows[0].id as unknown as number;
    cave = Number(cave);
    parking = ok(await ajouterAnnexe(loue, { categorie: 'parking', porte: '7' }, AUTEUR)).id;
    ok(await detacherAnnexe(parking, true, AUTEUR));
    libre = ok(await creerProprietaireEtBiens({ proprietaireId: proprio, proprietaire: {}, logement: { ...DPE_ENTRETIEN, adresse: `2 rue Libre${S}` }, annexes: [] }, AUTEUR)).logementId;
    const b = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `COPROP${S}`, telephone: '06 52 52 52 52', email: `coprop.${S}@exemple.test` },
      logement: { ...DPE_ENTRETIEN, adresse: `3 rue Partagee${S}` }, annexes: [] }, AUTEUR));
    autre = b.proprietaireId; partage = b.logementId;
    ok(await ajouterProprietaireAuLot(partage, proprio, null, AUTEUR));
    const c = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `TIERS${S}`, telephone: '06 53 53 53 53', email: `tiers.${S}@exemple.test` },
      logement: { ...DPE_ENTRETIEN, adresse: `4 rue Ailleurs${S}` }, annexes: [] }, AUTEUR));
    tiers = c.proprietaireId; ailleurs = c.logementId;
    locSeul = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `LSEUL${S}` }, lotId: loue, entree: '2025-01-01' }, AUTEUR)).locataireId;
    locMulti = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `LMULTI${S}` }, lotId: loue, entree: '2025-01-01' }, AUTEUR)).locataireId;
    ok(await creerLocataireSurBien({ locataireId: locMulti, locataire: {}, lotId: ailleurs, entree: '2024-06-01' }, AUTEUR));

    const liste = await biensPourSortie(proprio);
    expect(liste?.map((x) => x.lotId).sort()).toEqual([loue, libre, partage].sort());
    const l = liste?.find((x) => x.lotId === loue);
    expect(l?.annexes.map((x) => [x.lotId, x.detachee]).sort()).toEqual([[cave, false], [parking, true]].sort());
    expect(l?.locataires.sort()).toEqual([`LMULTI${S}`, `LSEUL${S}`].sort());
    expect(liste?.find((x) => x.lotId === partage)?.autresProprietaires).toEqual([`COPROP${S}`]);

    const avant = await compter('gestion_journal');
    expect(await sortirBiensDuPortefeuille(proprio, [], AUTEUR, { origine: VENTE })).toEqual({ etat: 'refus', motif: MOTIF_SELECTION_VIDE });
    expect(await sortirBiensDuPortefeuille(proprio, [libre], AUTEUR, {})).toEqual({ etat: 'refus', motif: MOTIF_ORIGINE_REQUISE });
    expect(await sortirBiensDuPortefeuille(proprio, [ailleurs], AUTEUR, { origine: VENTE })).toEqual({ etat: 'refus', motif: MOTIF_BIEN_HORS_SELECTION });
    expect(await compter('gestion_journal')).toBe(avant);
    expect(await sorti('gestion_annuaire_lot', libre)).toBeNull();
  });

  it('② un bien occupé : refus sans confirmation ; confirmé, le bien et toutes ses annexes sortent, location close, origine sur chaque bien', async () => {
    const ap = ok(await apercuSortieBiens(proprio, [loue]));
    expect(ap.biens.sort()).toEqual([loue, cave, parking].sort());
    expect(ap.occupees.map((o) => o.lotId)).toEqual([loue, loue]);
    expect(ap.locatairesArchives).toEqual([locSeul]);
    expect(ap.locatairesGardes.map((x) => x.id)).toEqual([locMulti]);
    expect(ap.tousLesBiens).toBe(false);
    expect(await sortirBiensDuPortefeuille(proprio, [loue], AUTEUR, { origine: VENTE })).toEqual({ etat: 'refus', motif: MOTIF_OCCUPATION_A_CONFIRMER });

    const lignes = await Promise.all(['gestion_annuaire_lot', 'gestion_annuaire_occupation', 'gestion_lot_annexe'].map(compter));
    expect(ok(await sortirBiensDuPortefeuille(proprio, [loue], AUTEUR, { origine: VENTE, confirmeOccupation: true })))
      .toMatchObject({ biens: 3, locations: 2, locataires: 1, proprietaireArchive: false });
    expect(await Promise.all(['gestion_annuaire_lot', 'gestion_annuaire_occupation', 'gestion_lot_annexe'].map(compter))).toEqual(lignes);
    const instant = await sorti('gestion_annuaire_lot', loue);
    expect(instant).not.toBeNull();
    for (const x of [cave, parking]) expect(await sorti('gestion_annuaire_lot', x)).toBe(instant);
    expect(await sorti('gestion_annuaire_lot', libre)).toBeNull();
    expect(await sorti('gestion_annuaire_proprietaire', proprio)).toBeNull();
    const { rows: occ } = await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_occupation WHERE lot_id = $1 AND sortie IS NULL', [loue]);
    expect(Number(occ[0].n)).toBe(0);
    expect(await sorti('gestion_annuaire_locataire', locSeul)).not.toBeNull();
    expect(await sorti('gestion_annuaire_locataire', locMulti)).toBeNull();
    const { rows: o } = await query<{ lot: string; origine: string; sous: string; par: string; le: string }>(
      `SELECT lot_id::text AS lot, origine, sous_origine AS sous, sorti_par_libelle AS par, sorti_le::text AS le FROM gestion_lot_sortie_origine WHERE lot_id = ANY($1::bigint[]) ORDER BY lot_id`, [[loue, cave, parking]]);
    expect(o.map((r) => [Number(r.lot), r.origine, r.sous, r.par, r.le === instant])).toEqual(
      [loue, cave, parking].sort((x, y) => x - y).map((l) => [l, 'mise_en_vente', 'autre_agence', 'itest sortie de biens', true]));
    expect((await sortieDe('bien', loue))?.origine).toBe('Mise en vente par une autre agence');
    // La Gestion le montre dans « Anciens biens » (même donnée).
    const f = await ficheProprietaire(proprio);
    if (f.etat !== 'ok') throw new Error(f.etat);
    expect(f.data.biens.find((x) => x.id === loue)?.fin).not.toBeNull();
    expect(f.data.biens.find((x) => x.id === libre)?.fin).toBeNull();
  });

  it('③ un bien partagé avec un autre propriétaire actif : il sort pour tous', async () => {
    const ap = ok(await apercuSortieBiens(proprio, [partage]));
    expect(ap.partages.map((p) => [p.lotId, p.autres])).toEqual([[partage, [`COPROP${S}`]]]);
    ok(await sortirBiensDuPortefeuille(proprio, [partage], AUTEUR, { origine: { origine: 'litige' } }));
    expect(await sorti('gestion_annuaire_lot', partage)).not.toBeNull();
    expect(await sorti('gestion_annuaire_proprietaire', autre)).toBeNull();
  });

  it('④ réactiver le bien : ses annexes, détachées comprises, reviennent ; l’origine reste dans l’historique', async () => {
    ok(await reactiverDansPortefeuille('bien', loue, AUTEUR));
    for (const x of [loue, cave, parking]) expect(await sorti('gestion_annuaire_lot', x)).toBeNull();
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_lot_sortie_origine WHERE lot_id = $1', [loue])).rows[0].n)).toBe(1);
    await expect(query('DELETE FROM gestion_lot_sortie_origine WHERE lot_id = $1', [loue])).rejects.toThrow();
  });

  it('⑤ TOUS les biens actifs choisis : archivage du propriétaire (archivé aussi dans la Gestion)', async () => {
    const tetes = (await biensPourSortie(proprio))?.map((x) => x.lotId) ?? [];
    expect(tetes.sort()).toEqual([loue, libre].sort());
    expect(ok(await apercuSortieBiens(proprio, tetes)).tousLesBiens).toBe(true);
    const r = ok(await sortirBiensDuPortefeuille(proprio, tetes, AUTEUR, { origine: { origine: 'deces_succession' }, confirmeOccupation: true }));
    expect(r.proprietaireArchive).toBe(true);
    const { rows } = await query<{ s: boolean; a: boolean }>('SELECT sorti_portefeuille_le IS NOT NULL AS s, archive_le IS NOT NULL AS a FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio]);
    expect(rows[0]).toEqual({ s: true, a: true });
    expect(await sorti('gestion_annuaire_lot', libre)).not.toBeNull();
    const { rows: or } = await query<{ origine: string }>('SELECT origine FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1', [proprio]);
    expect(or.map((x) => x.origine)).toEqual(['deces_succession']);
    expect(tiers).toBeGreaterThan(0);
    void creerPersonne;
  });
});
