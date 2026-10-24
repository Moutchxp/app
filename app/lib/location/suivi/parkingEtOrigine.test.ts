import { describe, expect, it } from 'vitest';
import { estLotParking, familleDuLot, sqlLotParking } from '../bienComplet';
import { origineApresCases, typeDeBienDesLots, verifierActivite } from './suivi';

/**
 * 🔴 Arno (24/10/2026, après c308b3cf) — (1) un lot sans catégorie dont le type, la nature ou le libellé dit « parking », « garage »,
 * « box » ou « stationnement » EST un parking (le cas de « 10 rue Chateaubriand, CHATILLON », lot n° 397) ; (3) l'origine du contact
 * suit les cases « Relocation » / « Nouvelle gestion ».
 */
describe('🔴 la détection du parking', () => {
  it('le cas des captures : catégorie vide, nature « Parking », type « Garage » → parking ; « Type de bien » = Parking', () => {
    expect(estLotParking({ categorie: null, nature: 'Parking', typeBien: 'Garage' })).toBe(true);
    expect(familleDuLot({ categorie: null, nature: 'Parking', typeBien: 'Garage' })).toBe('parking');
    // tel que la liste des lots le rend : « Le parking Garage · Parking Garage · lot n° 397 »
    expect(typeDeBienDesLots([{ role: 'logement', categorie: null, place: false, type: 'Parking Garage', libelle: 'parking Garage' }]))
      .toEqual({ type: 'parking', parkingPermis: true });
  });
  it('les quatre mots, majuscules et accents ignorés ; catégorie parking / box', () => {
    for (const t of ['PARKING', 'Garage fermé', 'Box n° 3', 'Place de stationnement', 'GARAGÉ', 'Stationnément']) expect(estLotParking({ categorie: '', type: t })).toBe(true);
    expect(estLotParking({ categorie: 'parking' })).toBe(true);
    expect(estLotParking({ categorie: 'box' })).toBe(true);
  });
  it('jamais un parking : une catégorie posée autre que parking/box, ou un texte sans les mots', () => {
    expect(estLotParking({ categorie: 'cave', nature: 'Cave garage' })).toBe(false);
    expect(estLotParking({ categorie: 'logement', type: 'Appartement avec parking' })).toBe(false);
    expect(estLotParking({ categorie: null, nature: 'Appartement meublé', typeBien: 'Type 2' })).toBe(false);
    expect(familleDuLot({ categorie: 'local' })).toBe('local');
    expect(familleDuLot({ categorie: null, nature: 'Appartement' })).toBeNull();
    // logement + parking texte : le lot principal fait le type, pas de « Parking »
    expect(typeDeBienDesLots([{ role: 'logement', categorie: null, place: false, type: 'Appartement meublé Type 2' },
      { role: 'annexe', categorie: null, place: false, type: 'Parking Garage' }])).toEqual({ type: 'logement', parkingPermis: false });
  });
  it('la même règle en SQL (contrôle du serveur)', () => {
    const sql = sqlLotParking('l');
    expect(sql).toContain("l.categorie IN ('parking', 'box')");
    expect(sql).toContain("coalesce(btrim(l.categorie), '') = ''");
    expect(sql).toContain("~ '(parking|garage|box|stationnement)'");
  });
});

describe('🔴 l’origine du contact suit les cases', () => {
  const base = { origine: null, auto: false, avecGestion: false, mandatGestion: false, dejaClient: false } as const;
  it('« Relocation » cochée → « Relocation (portefeuille de gestion) », imposée — même sur un choix fait à la main', () => {
    expect(origineApresCases({ ...base, avecGestion: true })).toEqual({ origine: 'relocation', auto: true });
    expect(origineApresCases({ ...base, origine: 'internet', avecGestion: true })).toEqual({ origine: 'relocation', auto: true });
  });
  it('LE CAS DES CAPTURES : « Nouvelle gestion » cochée alors que l’origine affichait « Relocation » → déjà client, sinon à choisir', () => {
    expect(origineApresCases({ ...base, origine: 'relocation', auto: true, mandatGestion: true, dejaClient: true })).toEqual({ origine: 'proprietaire_deja_client', auto: true });
    expect(origineApresCases({ ...base, origine: 'relocation', auto: true, mandatGestion: true, dejaClient: false })).toEqual({ origine: null, auto: false });
    expect(origineApresCases({ ...base, mandatGestion: true, dejaClient: true })).toEqual({ origine: 'proprietaire_deja_client', auto: true });
  });
  it('« Nouvelle gestion » : une origine choisie à la main et cohérente reste', () => {
    expect(origineApresCases({ ...base, origine: 'apporteur', mandatGestion: true, dejaClient: true })).toEqual({ origine: 'apporteur', auto: false });
    expect(origineApresCases({ ...base, origine: 'internet', mandatGestion: true })).toEqual({ origine: 'internet', auto: false });
  });
  it('décocher efface l’origine mise automatiquement ; un choix à la main cohérent reste', () => {
    expect(origineApresCases({ ...base, origine: 'relocation', auto: true })).toEqual({ origine: null, auto: false });
    expect(origineApresCases({ ...base, origine: 'proprietaire_deja_client', auto: true })).toEqual({ origine: null, auto: false });
    expect(origineApresCases({ ...base, origine: 'proprietaire_deja_client', auto: false })).toEqual({ origine: 'proprietaire_deja_client', auto: false });
    expect(origineApresCases({ ...base, origine: 'apporteur', auto: false })).toEqual({ origine: 'apporteur', auto: false });
  });
  it('le serveur refuse les combinaisons incohérentes', () => {
    const b = { dateSignature: '2026-10-24', honoProprietaireHt: '', honoLocataireHt: '', apporteurTaux: '' };
    expect(verifierActivite({ ...b, origineContact: 'relocation', mandatGestion: true }).ok).toBe(false);
    expect(verifierActivite({ ...b, origineContact: 'relocation', avecGestion: false }).ok).toBe(false);
    expect(verifierActivite({ ...b, origineContact: 'relocation', avecGestion: true }).ok).toBe(true);
    expect(verifierActivite({ ...b, origineContact: 'internet', mandatGestion: true, avecGestion: true }).ok).toBe(false);
    expect(verifierActivite({ ...b, origineContact: 'proprietaire_deja_client', mandatGestion: true }).ok).toBe(true);
  });
});
