import { describe, expect, it } from 'vitest';
import { resumerCoprosSyndic } from './adressesCoproSyndic';
import { libelleEnGestion, type LotPourVacance } from './lotsVacants';

/**
 * 🔴🔴 Arno (28/11/2026, 12h17, points 3 et 4) — le bloc « Copropriétés suivies » de la fiche syndic : un encadré par copropriété, ses adresses (jamais
 * répétées), « N lots » en face de chacune, le total ; le compteur général. Comptage par BIENS (ad11dca5 / a5107e9c), biens en gestion seulement.
 */
const L = (id: number, o: Partial<LotPourVacance> = {}): LotPourVacance => ({ id, parentId: null, detachee: false, regroupement: null, occupations: [], ...o });
const LOT = (id: number, cleImmeuble: string, statut = 'en_gestion') => ({ id, cleImmeuble, statut });

describe('resumerCoprosSyndic', () => {
  // la copropriété 157 : « 43 Avenue Marceau » (principale) et 74, 76, 80 rue de Normandie (secondaires)
  const COPRO = { id: 157, cle: '43 avenue marceau', libelle: '43 Avenue Marceau', nom: 'Résidence Marceau',
    adresses: [{ cle: '80 rue de normandie', libelle: '80 rue de Normandie' }, { cle: '74 rue de normandie', libelle: '74 Rue De Normandie' }, { cle: '76 rue de normandie', libelle: '76 Rue De Normandie' }],
    lots: [LOT(1, '43 avenue marceau'), LOT(2, '43 avenue marceau'), LOT(3, '43 avenue marceau'), LOT(4, '80 rue de normandie'), LOT(5, '80 rue de normandie'),
      LOT(6, '74 rue de normandie', 'location_seule'), LOT(7, '76 rue de normandie', 'ancienne_gestion')] };
  const LOTS = [L(1, { categorie: 'logement' }), L(2, { categorie: 'logement' }), L(3, { parentId: 1, categorie: 'cave' }), L(4, { categorie: 'logement' }),
    L(5, { nature: 'Parking' }), L(6, { categorie: 'logement' })];
  it('nom de la résidence, puis la principale, puis les autres triées (rue, puis numéro) ; « N lots » par adresse ; le total par type', () => {
    const r = resumerCoprosSyndic([COPRO], LOTS);
    const c = r.copros[0];
    expect(c.nom).toBe('Résidence Marceau');
    expect(c.adresses.map((a) => [a.libelle, a.principale, a.biens])).toEqual([
      ['43 Avenue Marceau', true, 2], // 1 (avec sa cave 3) et 2 : deux biens, la cave rattachée ne compte pas à part
      ['74 Rue De Normandie', false, 0], ['76 Rue De Normandie', false, 0], ['80 rue de Normandie', false, 2]]);
    expect(libelleEnGestion(c.detail)).toBe('4 lots en gestion dont 3 logements et 1 parking');
    // seuls les biens EN GESTION : ni la location seule (6), ni l'ancienne gestion (7)
    expect(r.detail.total).toBe(4);
  });
  it('une adresse n’est jamais répétée (clé de la 522 : « 70 ter » = « 70ter ») ; ses biens comptent une fois', () => {
    const c = resumerCoprosSyndic([{ id: 279, cle: '70 ter rue de la republique', libelle: '70 ter rue de la République',
      adresses: [{ cle: '70ter rue de la republique', libelle: '70ter rue de la République' }],
      lots: [LOT(1, '70 ter rue de la republique'), LOT(2, '70ter rue de la republique')] }], [L(1), L(2)]).copros[0];
    expect(c.adresses.map((a) => [a.libelle, a.biens])).toEqual([['70 ter rue de la République', 2]]);
  });
  it('le compteur général : toutes les copropriétés, chaque bien une fois ; un seul type, aucun lot', () => {
    const r = resumerCoprosSyndic([COPRO, { id: 2, cle: '1 rue x', libelle: '1 rue X', lots: [LOT(20, '1 rue x')] }], [...LOTS, L(20, { categorie: 'logement' })]);
    expect(libelleEnGestion(r.detail)).toBe('5 lots en gestion dont 4 logements et 1 parking');
    expect(libelleEnGestion(resumerCoprosSyndic([{ id: 2, cle: '1 rue x', libelle: '1 rue X', lots: [LOT(20, '1 rue x')] }], [L(20)]).detail)).toBe('1 lot à renseigner en gestion');
    expect(libelleEnGestion(resumerCoprosSyndic([{ id: 3, cle: 'y', libelle: 'Y', lots: [] }], []).detail)).toBe('0 lot en gestion');
  });
});

/** 🔴🔴 Arno (28/11/2026, 12h54, point 1) — « l'adresse postale du syndic doit être présente » ; incomplète : on le dit, rien n'est inventé. */
describe('adressePostaleSyndic', () => {
  it('complète : numéro et rue, puis code postal et ville (deux lignes)', async () => {
    const { adressePostaleSyndic, lienModifierSyndic } = await import('./adressesCoproSyndic');
    expect(adressePostaleSyndic({ adresse: ' 8 Rue  Denfert Rochereau ', codePostal: '92600', ville: 'Asnieres Sur Seine' }))
      .toEqual({ lignes: ['8 Rue Denfert Rochereau', '92600 Asnieres Sur Seine'], incomplete: false });
    expect(lienModifierSyndic(56)).toBe('/admin/gestion?ecran=syndics&syndic=56');
  });
  it('rue absente (le syndic 56 de la recette) : ce qui existe, marqué incomplet ; tout absent : aucune ligne, incomplet', async () => {
    const { adressePostaleSyndic } = await import('./adressesCoproSyndic');
    expect(adressePostaleSyndic({ adresse: null, codePostal: '92800', ville: 'Puteaux' })).toEqual({ lignes: ['92800 Puteaux'], incomplete: true });
    expect(adressePostaleSyndic({ adresse: '', codePostal: null, ville: null })).toEqual({ lignes: [], incomplete: true });
    expect(adressePostaleSyndic({ adresse: '1 rue X', codePostal: null, ville: 'Paris' }).incomplete).toBe(true);
  });
});
