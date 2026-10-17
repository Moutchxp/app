/**
 * ══ 🔴🔴 TUILE LOCATION — CRÉER UN PROPRIÉTAIRE (CARTES) PUIS SON BIEN (FORMULAIRE COMPLET), SUR UNE BASE JETABLE ═══════
 *
 *   ① création multi-contacts → bien rattaché à TOUS (le premier en propriétaire principal, les autres en co-propriétaires,
 *      comme la Gestion) ; N° de mandat posé sur chaque fiche ; la Gestion voit les co-propriétaires sur la fiche du bien ;
 *   ② la recherche ne trouve QUE des propriétaires : nom, prénom, téléphone, e-mail, adresse d'un bien du portefeuille —
 *      jamais leur adresse personnelle, jamais un locataire, jamais un bien hors portefeuille ;
 *   ③ champs obligatoires : au moins un propriétaire, l'adresse, le type de logement (refus sinon, rien n'est écrit) ;
 *   ④ annexes liées au logement pour toujours, même adresse, mêmes propriétaires ; compléments relus et modifiables.
 *
 *   ⑥ FAMILLES (Arno, 17/10/2026) : local commercial, parking nu (sans annexe), ascenseur / digicode / précision, annexe
 *      parking avec ses options, annexe à une AUTRE ADRESSE enregistrée et trouvée par les deux recherches.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide, migrations 365 à 376). 🔒 REFUSE de tourner ailleurs que sur une base
 * `svav_jetable…` ou `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l4 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/creationBien.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ficheLot } from '../gestion/annuaireRepo';
import { creerPersonne } from '../gestion/annuaireEditionRepo';
import { creerProprietaireEtBiens, ficheBienLocation } from './locationRepo';
import { sortirDuPortefeuille } from './portefeuilleRepo';
import {
  complementsDuBien, creerBienComplet, creerProprietaires, modifierComplementsBien, proprietairesParIds, rechercherProprietaires,
} from './creationBienRepo';
import { rechercherPortefeuille } from './portefeuilleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest création bien' };
const S = `c${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const compter = async (table: string): Promise<number> => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n);

describe.skipIf(!baseEssai)('🔴 créer un propriétaire puis son bien', () => {
  it('⓪ « Propriétaire(s) en gestion ? » : réponse obligatoire ; Oui exige le mandat ; Non enregistré sans mandat', async () => {
    const carte = { nom: `GESTION${S}`, coordonnees: [{ sorte: 'telephone' as const, valeur: '06 22 33 44 55', libelle: 'Mobile' }] };
    const avant = Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire')).rows[0].n);
    expect((await creerProprietaires({ cartes: [carte] }, AUTEUR)).etat).toBe('refus');
    expect((await creerProprietaires({ cartes: [carte], enGestion: true, numeroMandat: '  ' }, AUTEUR)).etat).toBe('refus');
    expect(Number((await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire')).rows[0].n)).toBe(avant);
    const non = ok(await creerProprietaires({ cartes: [carte, { nom: `GESTION${S}B`, coordonnees: [{ sorte: 'telephone' as const, valeur: '06 22 33 44 56', libelle: 'Mobile' }] }], enGestion: false, numeroMandat: 'saisi puis abandonné' }, AUTEUR));
    const { rows } = await query<{ en_gestion: boolean | null; mandat: string | null }>(
      'SELECT en_gestion, numero_mandat_gestion AS mandat FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[])', [non.ids]);
    expect(rows).toEqual([{ en_gestion: false, mandat: null }, { en_gestion: false, mandat: null }]);
    const journal = await query<{ commentaire: string }>(`SELECT commentaire FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND action = 'location_en_gestion'`, [non.ids[0]]);
    expect(journal.rows[0]?.commentaire).toMatch(/^en gestion : non/);
  });

  let ids: number[] = [];
  let logementId = 0;
  let syndicId = 0;

  it('① deux cartes → deux fiches, N° de mandat sur chacune → un bien rattaché aux deux, vu par la Gestion', async () => {
    const r = ok(await creerProprietaires({
      numeroMandat: `MG-${S}`, enGestion: true,
      cartes: [
        { civilite: 'M.', nom: `DUPONT${S}`, prenom: 'Paul', adresse: `5 rue Perso${S}`, codePostal: '75011', commune: 'PARIS',
          coordonnees: [{ sorte: 'telephone', valeur: '06 12 34 56 91', libelle: 'Mobile' }, { sorte: 'email', valeur: `paul.${S}@exemple.test`, libelle: 'E-mail' }] },
        { civilite: 'Mme', nom: `DUPONT${S}`, prenom: 'Anne', adresse: `5 rue Perso${S}`, codePostal: '75011', commune: 'PARIS',
          coordonnees: [{ sorte: 'telephone', valeur: '06 12 34 56 92', libelle: 'Mobile' }, { sorte: 'email', valeur: `anne.${S}@exemple.test`, libelle: 'E-mail' }] },
      ],
    }, AUTEUR));
    ids = r.ids;
    expect(ids).toHaveLength(2);
    const { rows: m } = await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[]) AND numero_mandat_gestion = $2', [ids, `MG-${S}`]);
    expect(Number(m[0].n)).toBe(2);
    const { rows: eg } = await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_annuaire_proprietaire WHERE id = ANY($1::bigint[]) AND en_gestion', [ids]);
    expect(Number(eg[0].n)).toBe(2);
    expect((await proprietairesParIds(ids)).map((p) => p.id)).toEqual(ids);

    const { rows: sy } = await query<{ id: string }>(`INSERT INTO gestion_syndic (nom, cree_par_libelle) VALUES ($1, 'itest') RETURNING id::text`, [`SYNDIC${S}`]);
    syndicId = Number(sy[0].id);
    const b = ok(await creerBienComplet({
      proprietaireIds: ids,
      logement: { adresse: `14 rue des Tilleuls${S}`, codePostal: '75011', commune: 'PARIS', batiment: 'B', escalier: '2', etage: '3', porte: 'G',
        famille: 'logement', typeLogement: 'appartement', nombrePieces: '3', meuble: false, surfaceHabitableM2: '62,5', surfaceCarrezM2: '60,1',
        numLotCopro: '27', syndicId, epoqueConstruction: '1949 – 1974', chauffage: 'Collectif', dpeClasse: 'd', dpeDate: '2025-04-12',
        commentaire: 'Lumineux.' },
      annexes: [{ categorie: 'cave', etage: '-1', porte: '12' }, { categorie: 'parking', numLotCopro: '88', porte: '7' }],
    }, AUTEUR));
    logementId = b.logementId;
    // La Gestion (sa propre lecture) voit les DEUX propriétaires sur la fiche du bien.
    const g = await ficheLot(logementId);
    if (g.etat !== 'ok') throw new Error(g.etat);
    expect(g.data.proprietaires.map((p) => p.id).sort()).toEqual([...ids].sort());
    const c = await complementsDuBien(logementId);
    expect(c).toMatchObject({ batiment: 'B', escalier: '2', typeLogement: 'appartement', nombrePieces: 3, meuble: false, surfaceHabitableM2: 62.5,
      syndicId, syndicNom: `SYNDIC${S}`, chauffage: 'Collectif', dpeClasse: 'D', dpeDate: '2025-04-12', commentaire: 'Lumineux.' });
    const journal = await query<{ action: string }>(`SELECT action FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1`, [logementId]);
    expect(journal.rows.map((x) => x.action)).toContain('location_bien_cree');
  });

  it('② la recherche : propriétaires seulement, par nom / prénom / téléphone / e-mail / adresse d’un bien du portefeuille', async () => {
    const r = async (q: string) => (await rechercherProprietaires(q)).map((p) => p.id).sort();
    expect(await r(`DUPONT${S}`)).toEqual([...ids].sort());
    expect(await r(`DUPONT${S} Anne`)).toEqual([ids[1]]);
    expect(await r('+33 6 12 34 56 91')).toEqual([ids[0]]);
    expect(await r(`anne.${S}@`)).toEqual([ids[1]]);
    expect(await r(`Tilleuls${S}`)).toEqual([...ids].sort());
    // Jamais l'adresse PERSONNELLE.
    expect(await r(`Perso${S}`)).toEqual([]);
    // Jamais un locataire, même homonyme.
    ok(await creerPersonne('locataire', { nom: `LOCATAIRE${S}`, coordonnees: [] }, AUTEUR));
    expect(await r(`LOCATAIRE${S}`)).toEqual([]);
    // Jamais un bien HORS portefeuille (fin de gestion) : son adresse ne trouve personne.
    const autre = ok(await creerProprietaireEtBiens({ proprietaireId: null, proprietaire: { nom: `HORS${S}` }, logement: { adresse: `9 rue Fermee${S}` }, annexes: [] }, AUTEUR));
    await query(`UPDATE gestion_annuaire_lot SET gestion_fin = DATE '2025-01-01' WHERE id = $1`, [autre.logementId]);
    expect(await r(`Fermee${S}`)).toEqual([]);
    // Un propriétaire sorti du portefeuille n'est plus proposé.
    ok(await sortirDuPortefeuille('proprietaire', autre.proprietaireId, AUTEUR));
    expect(await r(`HORS${S}`)).toEqual([]);
  });

  it('③ champs obligatoires : sans propriétaire, sans adresse ou sans type → refus, rien n’est écrit', async () => {
    const avant = await compter('gestion_annuaire_lot');
    const logement = { adresse: `1 rue Essai${S}`, famille: 'logement', typeLogement: 'studio' };
    expect((await creerBienComplet({ proprietaireIds: [], logement, annexes: [] }, AUTEUR)).etat).toBe('refus');
    expect((await creerBienComplet({ proprietaireIds: ids, logement: { ...logement, adresse: '  ' }, annexes: [] }, AUTEUR)).etat).toBe('refus');
    expect((await creerBienComplet({ proprietaireIds: ids, logement: { ...logement, typeLogement: '' }, annexes: [] }, AUTEUR)).etat).toBe('refus');
    expect((await creerBienComplet({ proprietaireIds: ids, logement: { ...logement, dpeClasse: 'H' }, annexes: [] }, AUTEUR)).etat).toBe('refus');
    expect((await creerProprietaires({ cartes: [{ nom: '' }], enGestion: false }, AUTEUR)).etat).toBe('refus');
    expect(await compter('gestion_annuaire_lot')).toBe(avant);
  });

  it('④ annexes liées au logement (même adresse, mêmes propriétaires) ; compléments modifiables ensuite', async () => {
    const f = ok(await ficheBienLocation(logementId));
    expect(f.annexes.map((a) => a.categorie).sort()).toEqual(['cave', 'parking']);
    for (const a of f.annexes) {
      expect(a.adresse).toBe(`14 rue des Tilleuls${S}`);
      expect(a.parentId).toBe(logementId);
      const g = await ficheLot(a.id);
      if (g.etat !== 'ok') throw new Error(g.etat);
      expect(g.data.proprietaires.map((p) => p.id).sort()).toEqual([...ids].sort());
    }
    expect(f.complements?.typeLogement).toBe('appartement');
    ok(await modifierComplementsBien(logementId, { typeLogement: 'duplex', meuble: 'oui', dpeClasse: 'C', commentaire: '' }, AUTEUR));
    expect(await complementsDuBien(logementId)).toMatchObject({ typeLogement: 'duplex', meuble: true, dpeClasse: 'C', commentaire: null, syndicId: null });
    // Le lien annexe → logement ne se défait pas (verrou en base, migration 372).
    await expect(query('DELETE FROM gestion_lot_annexe WHERE parent_id = $1', [logementId])).rejects.toThrow();
  });

  it('⑥ familles : local commercial, parking nu, accès ; annexe parking et annexe à une autre adresse (trouvée par la recherche)', async () => {
    // Un LOCAL COMMERCIAL : catégorie « local », type de local ; jamais de type de logement ni de meublé (même envoyés).
    const local = ok(await creerBienComplet({ proprietaireIds: ids, annexes: [
      { categorie: 'parking', parkingSituation: 'interieur', parkingType: 'box_double', porte: '12' },
      { categorie: 'cave', autreAdresse: true, adresse: `9 impasse Lointaine${S}`, codePostal: '92400', commune: 'COURBEVOIE', porte: '3' },
    ], logement: { adresse: `20 rue Commerce${S}`, famille: 'local', typeLocal: 'commercial', typeLogement: 'studio', meuble: true,
      nombrePieces: '2', ascenseur: true, digicode: 'oui', digicodeCode: '4589B', precisionAcces: 'Au fond de la cour' } }, AUTEUR));
    const { rows: l } = await query<{ categorie: string; type_local: string; type_logement: string | null; meuble: boolean | null; ascenseur: boolean; digicode: boolean; digicode_code: string; precision_acces: string }>(
      'SELECT categorie, type_local, type_logement, meuble, ascenseur, digicode, digicode_code, precision_acces FROM gestion_annuaire_lot WHERE id = $1', [local.logementId]);
    expect(l[0]).toEqual({ categorie: 'local', type_local: 'commercial', type_logement: null, meuble: null, ascenseur: true, digicode: true,
      digicode_code: '4589B', precision_acces: 'Au fond de la cour' });
    const { rows: a } = await query<{ categorie: string; parking_situation: string | null; parking_type: string | null; adresse: string; adresse_autre: boolean }>(
      'SELECT categorie, parking_situation, parking_type, adresse, adresse_autre FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) ORDER BY id', [local.annexes]);
    expect(a).toEqual([
      { categorie: 'parking', parking_situation: 'interieur', parking_type: 'box_double', adresse: `20 rue Commerce${S}`, adresse_autre: false },
      { categorie: 'cave', parking_situation: null, parking_type: null, adresse: `9 impasse Lointaine${S}`, adresse_autre: true },
    ]);
    // L'annexe à une autre adresse est une adresse du PORTEFEUILLE : la recherche de l'accueil et celle des propriétaires la trouvent.
    expect((await rechercherPortefeuille(`Lointaine${S}`)).biens.map((b) => b.id)).toEqual([local.annexes[1]]);
    expect((await rechercherProprietaires(`Lointaine${S}`)).map((p) => p.id).sort()).toEqual([...ids].sort());
    // L'annexe à la même adresse, elle, ne s'affiche pas en double (on la trouve dans l'arbre de son local).
    expect((await rechercherPortefeuille(`Commerce${S}`)).biens.map((b) => b.id)).toEqual([local.logementId]);
    // La fiche commune relit tout (famille déduite de la catégorie).
    expect(await complementsDuBien(local.logementId)).toMatchObject({ typeLocal: 'commercial', ascenseur: true, digicode: true, digicodeCode: '4589B' });

    // Un PARKING NU : options du parking, surface ; ni pièces, ni Carrez, ni DPE ; et AUCUNE annexe permise.
    const refus = await creerBienComplet({ proprietaireIds: ids, annexes: [{ categorie: 'cave' }],
      logement: { adresse: `1 rue Garage${S}`, famille: 'parking', parkingType: 'place_simple' } }, AUTEUR);
    expect(refus).toEqual({ etat: 'refus', motif: 'Un parking nu n’a pas d’annexe.' });
    expect((await creerBienComplet({ proprietaireIds: ids, annexes: [], logement: { adresse: `1 rue Garage${S}`, famille: 'parking' } }, AUTEUR)).etat).toBe('refus');
    const p = ok(await creerBienComplet({ proprietaireIds: ids, annexes: [], logement: {
      adresse: `1 rue Garage${S}`, famille: 'parking', parkingSituation: 'exterieur', parkingType: 'place_double', surfaceM2: '12,5',
      nombrePieces: '3', surfaceCarrezM2: '10', dpeClasse: 'C', ascenseur: false } }, AUTEUR));
    const { rows: pk } = await query<{ categorie: string; parking_situation: string; parking_type: string; surface_m2: string; nombre_pieces: number | null; surface_carrez_m2: string | null; dpe_classe: string | null; ascenseur: boolean }>(
      'SELECT categorie, parking_situation, parking_type, surface_m2::text, nombre_pieces, surface_carrez_m2::text, dpe_classe, ascenseur FROM gestion_annuaire_lot WHERE id = $1', [p.logementId]);
    expect(pk[0]).toEqual({ categorie: 'parking', parking_situation: 'exterieur', parking_type: 'place_double', surface_m2: '12.5',
      nombre_pieces: null, surface_carrez_m2: null, dpe_classe: null, ascenseur: false });
    // Un local sans type de local, un logement sans type : refusés.
    expect((await creerBienComplet({ proprietaireIds: ids, annexes: [], logement: { adresse: `2 rue Commerce${S}`, famille: 'local' } }, AUTEUR)).etat).toBe('refus');
    expect((await creerBienComplet({ proprietaireIds: ids, annexes: [], logement: { adresse: `2 rue Commerce${S}`, famille: 'logement' } }, AUTEUR)).etat).toBe('refus');
    // Modifier depuis la fiche commune : digicode retiré ⇒ le code est effacé avec lui.
    ok(await modifierComplementsBien(local.logementId, { typeLocal: 'bureaux', digicode: 'non', digicodeCode: '4589B', ascenseur: 'oui' }, AUTEUR));
    expect(await complementsDuBien(local.logementId)).toMatchObject({ typeLocal: 'bureaux', digicode: false, digicodeCode: null, ascenseur: true });
  });
});
