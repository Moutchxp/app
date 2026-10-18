/**
 * ══ 🔴🔴 TUILE LOCATION — « SUPPRIMER UN PROPRIÉTAIRE » = ARCHIVER (Arno, 18/10/2026), SUR UNE BASE JETABLE ═══════════════
 *
 *   ① recherche SPÉCIALISÉE : seulement des propriétaires, par nom, téléphone, e-mail ou ADRESSE D'UN DE LEURS BIENS ;
 *   ② l'aperçu (ce que le gros bouton annonce) : biens occupés (adresse, lot, locataire, entrée), bien partagé gardé,
 *      locataire qui loue ailleurs gardé ; sans location en cours → bouton rouge, avec → orange ;
 *   ③ archiver SANS confirmer l'avertissement → refus, RIEN n'est écrit ;
 *   ④ archiver en confirmant : propriétaire, biens et annexes sortis (même instant, même auteur), propriétaire « archivé »
 *      dans la Gestion aussi (archive_le), locations closes à la date du jour, locataire archivé SAUF celui qui loue un
 *      autre bien, bien partagé PAS archivé ; aucune ligne effacée ; journal daté et signé ;
 *   ⑤ réactiver : propriétaire et biens reviennent, la Gestion aussi ; les locations closes restent closes (historique) ;
 *   ⑥ l'ORIGINE (Arno, 18/10/2026, migration 380) : refus sans origine (rien d'écrit), enregistrée (code, sous-origine,
 *      précision, date, auteur), affichée sur la fiche archivée, CONSERVÉE après réactivation, table en ajout seul.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide). 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou
 * `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l15 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/archivage.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ajouterProprietaireAuLot } from '../gestion/annuaireEditionRepo';
import { creerProprietaireEtBiens, ficheBienLocation } from './locationRepo';
import { apercuArchivage, creerLocataireSurBien, reactiverDansPortefeuille, rechercherPortefeuille, sortieDe, sortirDuPortefeuille } from './portefeuilleRepo';
import { etatBouton, MOTIF_OCCUPATION_A_CONFIRMER, MOTIF_ORIGINE_REQUISE } from './archivage';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest archivage' };
const S = `a${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const compter = async (table: string): Promise<number> => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);
const TABLES = ['gestion_annuaire_proprietaire', 'gestion_annuaire_locataire', 'gestion_annuaire_lot', 'gestion_annuaire_occupation', 'gestion_lot_annexe', 'gestion_annuaire_lot_proprietaire'];

describe.skipIf(!baseEssai)('🔴 archiver un propriétaire (sortie du portefeuille, jamais d’effacement)', () => {
  let proprio = 0; let autreProprio = 0;
  let loue = 0; let cave = 0; let libre = 0; let partage = 0; let ailleurs = 0;
  let locSeul = 0; let locMulti = 0; let locPartage = 0;

  it('① la recherche spécialisée : des propriétaires seulement, par nom, téléphone, e-mail ou adresse d’un de leurs biens', async () => {
    const a = ok(await creerProprietaireEtBiens({ proprietaireId: null,
      proprietaire: { nom: `ARCHIVE${S}`, prenom: 'Paul', telephone: '06 70 80 90 11', email: `paul.${S}@exemple.test`, adresse: `1 rue Perso${S}` },
      logement: { adresse: `21 rue des Tilleuls${S}`, codePostal: '75012', commune: 'Paris' }, annexes: [{ categorie: 'cave', porte: '7' }] }, AUTEUR));
    proprio = a.proprietaireId; loue = a.logementId;
    cave = ok(await ficheBienLocation(loue)).annexes[0].id;
    libre = ok(await creerProprietaireEtBiens({ proprietaireId: proprio, proprietaire: {}, logement: { adresse: `5 rue Libre${S}` }, annexes: [] }, AUTEUR)).logementId;
    // Un bien PARTAGÉ : détenu aussi par un autre propriétaire actif.
    const b = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `COINDIVIS${S}` }, logement: { adresse: `9 rue Partagee${S}` }, annexes: [] }, AUTEUR));
    autreProprio = b.proprietaireId; partage = b.logementId;
    ok(await ajouterProprietaireAuLot(partage, proprio, null, AUTEUR));
    // Un bien d'un TIERS, loué aussi par un des locataires (il loue donc ailleurs).
    ailleurs = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `TIERS${S}` }, logement: { adresse: `3 rue Ailleurs${S}` }, annexes: [] }, AUTEUR)).logementId;

    const r = async (t: string) => rechercherPortefeuille(t, { proprietairesSeuls: true });
    expect((await r(`ARCHIVE${S}`)).proprietaires.map((p) => p.id)).toEqual([proprio]);
    expect((await r('06 70 80 90 11')).proprietaires.map((p) => p.id)).toContain(proprio);
    expect((await r(`paul.${S}@`)).proprietaires.map((p) => p.id)).toEqual([proprio]);
    expect((await r(`Tilleuls${S}`)).proprietaires.map((p) => p.id)).toEqual([proprio]);
    expect((await r(`Partagee${S}`)).proprietaires.map((p) => p.id).sort()).toEqual([proprio, autreProprio].sort());
    // Jamais l'adresse personnelle ; jamais de locataire, de syndic ni de bien dans les résultats.
    expect((await r(`Perso${S}`)).proprietaires).toEqual([]);
    const tout = await r(`Tilleuls${S}`);
    expect([tout.locataires, tout.syndics, tout.biens]).toEqual([[], [], []]);
  });

  it('② l’aperçu : sans location en cours → bouton rouge ; avec → orange, biens occupés listés, partagé et multi-biens gardés', async () => {
    const vide = await apercuArchivage('proprietaire', proprio);
    expect(vide && etatBouton(vide)).toBe('archiver');
    locSeul = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `SEUL${S}` }, lotId: loue, entree: '2025-09-01' }, AUTEUR)).locataireId;
    locMulti = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `MULTI${S}` }, lotId: cave, entree: null }, AUTEUR)).locataireId;
    ok(await creerLocataireSurBien({ locataireId: locMulti, locataire: {}, lotId: ailleurs, entree: '2024-01-15' }, AUTEUR));
    locPartage = ok(await creerLocataireSurBien({ locataireId: null, locataire: { nom: `PARTAGE${S}` }, lotId: partage, entree: '2023-05-01' }, AUTEUR)).locataireId;

    const a = await apercuArchivage('proprietaire', proprio);
    if (a === null) throw new Error('aperçu absent');
    expect(etatBouton(a)).toBe('alerte');
    expect(a.biens.sort()).toEqual([loue, cave, libre].sort());
    expect(a.occupees.map((o) => [o.lotId, o.locataire, o.entree])).toEqual(expect.arrayContaining([[loue, `SEUL${S}`, '2025-09-01'], [cave, `MULTI${S}`, null]]));
    expect(a.occupees).toHaveLength(2);
    expect(a.occupees.find((o) => o.lotId === loue)?.adresse).toContain(`21 rue des Tilleuls${S}`);
    expect(a.partages).toEqual([expect.objectContaining({ lotId: partage, autres: [`COINDIVIS${S}`], occupe: true })]);
    expect(a.locatairesArchives).toEqual([locSeul]);
    expect(a.locatairesGardes).toEqual([expect.objectContaining({ id: locMulti, ailleurs: expect.stringContaining(`3 rue Ailleurs${S}`) })]);
  });

  it('③ sans confirmer l’avertissement : refus, rien n’est écrit', async () => {
    const avant = await Promise.all(TABLES.map(compter));
    const journal = await compter('gestion_journal');
    const VENTE = { origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: 'compromis signé' };
    expect(await sortirDuPortefeuille('proprietaire', proprio, AUTEUR, { origine: VENTE })).toEqual({ etat: 'refus', motif: MOTIF_OCCUPATION_A_CONFIRMER });
    // Sans origine, ou mise en vente sans « par qui » : refus, même confirmé.
    expect(await sortirDuPortefeuille('proprietaire', proprio, AUTEUR, { confirmeOccupation: true })).toEqual({ etat: 'refus', motif: MOTIF_ORIGINE_REQUISE });
    expect(await sortirDuPortefeuille('proprietaire', proprio, AUTEUR, { confirmeOccupation: true, origine: { origine: 'mise_en_vente' } })).toEqual({ etat: 'refus', motif: MOTIF_ORIGINE_REQUISE });
    expect((await query('SELECT 1 FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1', [proprio])).rows).toEqual([]);
    expect(await Promise.all(TABLES.map(compter))).toEqual(avant);
    expect(await compter('gestion_journal')).toBe(journal);
    expect((await query<{ s: boolean }>('SELECT sorti_portefeuille_le IS NOT NULL AS s FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio])).rows[0].s).toBe(false);
  });

  it('④ confirmé : tout sort (même instant), locations closes aujourd’hui, aucune ligne effacée, journal signé', async () => {
    const avant = await Promise.all(TABLES.map(compter));
    const bilan = ok(await sortirDuPortefeuille('proprietaire', proprio, AUTEUR, { confirmeOccupation: true,
      origine: { origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: 'compromis signé' } }));
    expect(bilan).toMatchObject({ biens: 3, locations: 2, locataires: 1 });
    expect(bilan.lots?.sort()).toEqual([loue, cave, libre].sort()); // les biens sortis, pour le mail de confirmation
    expect(await Promise.all(TABLES.map(compter))).toEqual(avant);

    const { rows: p } = await query<{ le: string; par: string; archive: string | null }>(
      'SELECT sorti_portefeuille_le::text AS le, sorti_portefeuille_par AS par, archive_le::text AS archive FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio]);
    expect(p[0].par).toBe('itest archivage');
    expect(p[0].archive).toBe(p[0].le); // « archivée » dans la Gestion : même donnée, même instant
    const { rows: lots } = await query<{ id: string; le: string | null; par: string | null }>(
      'SELECT id::text, sorti_portefeuille_le::text AS le, sorti_portefeuille_par AS par FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[])', [[loue, cave, libre, partage, ailleurs]]);
    const sortie = new Map(lots.map((l) => [Number(l.id), l.le]));
    for (const b of [loue, cave, libre]) expect(sortie.get(b)).toBe(p[0].le);
    expect(sortie.get(partage)).toBeNull(); // bien partagé avec un propriétaire actif : PAS archivé
    expect(sortie.get(ailleurs)).toBeNull();

    const { rows: occ } = await query<{ lot: string; sortie: string | null; aujourdhui: string }>(
      `SELECT lot_id::text AS lot, sortie::text, (now() AT TIME ZONE 'Europe/Paris')::date::text AS aujourdhui
         FROM gestion_annuaire_occupation WHERE lot_id = ANY($1::bigint[])`, [[loue, cave, partage, ailleurs]]);
    const fin = new Map(occ.map((o) => [Number(o.lot), o.sortie]));
    expect(fin.get(loue)).toBe(occ[0].aujourdhui);
    expect(fin.get(cave)).toBe(occ[0].aujourdhui);
    expect(fin.get(partage)).toBeNull(); // sa location reste ouverte
    expect(fin.get(ailleurs)).toBeNull();

    const { rows: locs } = await query<{ id: string; s: boolean }>(
      'SELECT id::text, sorti_portefeuille_le IS NOT NULL AS s FROM gestion_annuaire_locataire WHERE id = ANY($1::bigint[])', [[locSeul, locMulti, locPartage]]);
    expect(Object.fromEntries(locs.map((l) => [Number(l.id), l.s]))).toEqual({ [locSeul]: true, [locMulti]: false, [locPartage]: false });

    const { rows: j } = await query<{ commentaire: string; auteur: string }>(
      `SELECT commentaire, auteur_libelle AS auteur FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND valeur_apres = 'proprietaire' AND action = 'location_sortie_portefeuille'`, [proprio]);
    expect(j).toHaveLength(1);
    expect(j[0].auteur).toBe('itest archivage');
    expect(j[0].commentaire).toContain('2 location(s) close(s)');
    expect(j[0].commentaire).toContain('origine : Mise en vente par une autre agence — précision : compromis signé');
    // L'origine : une ligne, au même instant que la sortie, même auteur ; affichée sur la fiche archivée.
    const { rows: o } = await query<{ origine: string; sous: string; precision: string; le: string; par: string }>(
      `SELECT origine, sous_origine AS sous, precision_libre AS precision, archive_le::text AS le, archive_par_libelle AS par
         FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1`, [proprio]);
    expect(o).toEqual([{ origine: 'mise_en_vente', sous: 'autre_agence', precision: 'compromis signé', le: p[0].le, par: 'itest archivage' }]);
    expect(await sortieDe('proprietaire', proprio)).toMatchObject({ par: 'itest archivage', origine: 'Mise en vente par une autre agence (compromis signé)' });
    expect((await apercuArchivage('proprietaire', proprio))?.sortie?.origine).toBe('Mise en vente par une autre agence (compromis signé)');
    expect(j[0].commentaire).toContain(`bien(s) partagé(s) laissé(s) dans le portefeuille : ${partage}`);
    // Il reste consultable dans « Anciens » : la recherche le rend, marqué.
    expect((await rechercherPortefeuille(`ARCHIVE${S}`, { proprietairesSeuls: true })).proprietaires).toEqual([expect.objectContaining({ id: proprio, ancien: true })]);
    // L'aperçu dit « Réactiver ».
    const a = await apercuArchivage('proprietaire', proprio);
    expect(a && etatBouton(a)).toBe('reactiver');
  });

  it('⑤ réactiver : propriétaire et biens reviennent, la Gestion aussi ; les locations closes restent closes', async () => {
    ok(await reactiverDansPortefeuille('proprietaire', proprio, AUTEUR));
    const { rows: p } = await query<{ s: boolean; a: boolean }>(
      'SELECT sorti_portefeuille_le IS NOT NULL AS s, archive_le IS NOT NULL AS a FROM gestion_annuaire_proprietaire WHERE id = $1', [proprio]);
    expect(p[0]).toEqual({ s: false, a: false });
    const { rows: lots } = await query<{ n: string }>(
      'SELECT count(*)::text AS n FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND sorti_portefeuille_le IS NULL', [[loue, cave, libre]]);
    expect(Number(lots[0].n)).toBe(3);
    const { rows: occ } = await query<{ n: string }>(
      'SELECT count(*)::text AS n FROM gestion_annuaire_occupation WHERE lot_id = ANY($1::bigint[]) AND sortie IS NOT NULL', [[loue, cave]]);
    expect(Number(occ[0].n)).toBe(2);
    const a = await apercuArchivage('proprietaire', proprio);
    // Ses locations ont été closes ; le bien partagé, encore loué, n'est pas archivé avec lui : plus rien à clore → bouton rouge.
    expect(a && etatBouton(a)).toBe('archiver');
  });

  it('⑥ la réactivation garde l’origine dans l’historique ; un nouvel archivage en ajoute une ; la table refuse toute modification', async () => {
    const { rows: avant } = await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1', [proprio]);
    expect(Number(avant[0].n)).toBe(1);
    expect(await sortieDe('proprietaire', proprio)).toBeNull(); // réactivé (⑤) : plus « archivé », mais la ligne reste
    ok(await sortirDuPortefeuille('proprietaire', proprio, AUTEUR, { origine: { origine: 'litige' } }));
    const { rows } = await query<{ origine: string }>('SELECT origine FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1 ORDER BY id', [proprio]);
    expect(rows.map((r) => r.origine)).toEqual(['mise_en_vente', 'litige']);
    expect((await sortieDe('proprietaire', proprio))?.origine).toBe('Litige');
    await expect(query('UPDATE gestion_proprietaire_archivage_origine SET origine = $2 WHERE proprietaire_id = $1', [proprio, 'mecontent'])).rejects.toThrow();
    await expect(query('DELETE FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1', [proprio])).rejects.toThrow();
    ok(await reactiverDansPortefeuille('proprietaire', proprio, AUTEUR));
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_proprietaire_archivage_origine WHERE proprietaire_id = $1', [proprio])).rows[0].n)).toBe(2);
  });
});
