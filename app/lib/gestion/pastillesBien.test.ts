import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estAnnexe, motEtage, motPieces, motSurface, pastillesBien, piecesDeType } from './pastillesBien';

/**
 * LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 1 — les pastilles sous l'adresse d'un bien, et la ligne « SURFACE »
 * retirée du corps des cartes (accord explicite d'Arno pour CETTE ligne).
 */
describe('pastillesBien — l\'ordre et les mots demandés', () => {
  it('Appartement + Type 2 → « Appartement », « 2 pièces »', () => {
    expect(pastillesBien({ nature: 'Appartement', typeBien: 'Type 2' })).toEqual(['Appartement', '2 pièces']);
  });
  it('« Appartement meublé » reste tel quel ; Type 1 → « 1 pièce » (singulier)', () => {
    expect(pastillesBien({ nature: 'Appartement meublé', typeBien: 'Type 1' })).toEqual(['Appartement meublé', '1 pièce']);
  });
  it('Studio reste « Studio » et ne devient PAS « 1 pièce » (seul « Type N » se déduit)', () => {
    expect(pastillesBien({ nature: 'Appartement', typeBien: 'Studio' })).toEqual(['Appartement', 'Studio']);
  });
  it('jamais de pièces pour une annexe (parking, cave, box, garage)', () => {
    expect(pastillesBien({ nature: 'Parking', typeBien: 'Garage' })).toEqual(['Parking', 'Garage']);
    expect(pastillesBien({ nature: 'Box', typeBien: null })).toEqual(['Box']);
    expect(pastillesBien({ nature: 'Cave', typeBien: 'Type 1' })).toEqual(['Cave', 'Type 1']);
    expect(estAnnexe({ nature: 'Cave', typeBien: null })).toBe(true);
  });
  it('surface et étage dans l\'ordre ① ② ③ ④', () => {
    expect(pastillesBien({ nature: 'Maison', typeBien: 'Type 6', surfaceM2: 63, etage: 2 }))
      .toEqual(['Maison', '6 pièces', '63 m²', '2e étage']);
  });
  it('une information inconnue ne donne AUCUNE pastille', () => {
    expect(pastillesBien({ nature: null, typeBien: null, surfaceM2: null, etage: null })).toEqual([]);
    expect(pastillesBien({ nature: '', typeBien: '  ', surfaceM2: 0 })).toEqual([]);
  });
});

describe('les mots', () => {
  it('pièces, surface (exposant ², virgule, jamais arrondie)', () => {
    expect(motPieces(1)).toBe('1 pièce');
    expect(motPieces(3)).toBe('3 pièces');
    expect(motSurface(63)).toBe('63 m²');
    expect(motSurface(63.45)).toBe('63,45 m²');
    expect(piecesDeType('T3')).toBe(3);
    expect(piecesDeType('Type 8')).toBe(8);
    expect(piecesDeType('Studio')).toBeNull();
  });
  it('étage : Étage -2, Étage -1, Rdc, 1er étage, 2e étage, Dernier étage', () => {
    expect(motEtage(-2)).toBe('Étage -2');
    expect(motEtage(-1)).toBe('Étage -1');
    expect(motEtage(0)).toBe('Rdc');
    expect(motEtage(1)).toBe('1er étage');
    expect(motEtage(2)).toBe('2e étage');
    expect(motEtage(5, true)).toBe('Dernier étage');
    expect(motEtage(null)).toBeNull();
  });
});

describe('les écrans lisent la règle, et la ligne SURFACE a quitté le corps des cartes', () => {
  const src = readFileSync(join(__dirname, '../../(admin)/admin/(protected)/gestion/Annuaire.tsx'), 'utf8');
  it('les trois en-têtes de bien passent par pastillesBien', () => {
    expect(src.match(/pastillesBien\((b|f|o)\)/g)?.length).toBe(3);
  });
  it('plus de fait « Surface » dans les cartes (ann-fait-mot) — ce qu\'il disait avant : « Surface : non renseignée »', () => {
    expect(src).not.toMatch(/ann-fait-mot">Surface</);
  });
  it('la fiche du bien garde sa ligne « Surface » (aucun accord pour celle-là)', () => {
    expect(src).toContain('<dt>Surface</dt>');
  });
});
