import { describe, expect, it } from 'vitest';
import { ADRESSE_BIEN_VIDE, adresseBienEnLigne, adresseBienLue, adresseBienTouchee, metaAdresseBien, MOTIF_ADRESSE_BIEN_A_CHOISIR, refusAdresseBienEcran, sansNumeroAConfirmer } from './adresseBienSaisie';

/** 🔴 Arno (17/11/2026, « Adresses uniformisées », lot 3) — l'adresse d'un bien, à l'écran : ce qui part, ce qui est refusé avant envoi, la fenêtre « sans numéro ». */
const PORT = { adresse: '3 Rue du Port', codePostal: '92400', commune: 'COURBEVOIE' };

describe('l’adresse d’un bien à l’écran', () => {
  it('touchée : un bien à créer dès qu’elle n’est pas vide ; un bien existant si elle change (casse et espaces exceptés) ou passe « hors liste »', () => {
    expect(adresseBienTouchee(ADRESSE_BIEN_VIDE, null)).toBe(false);
    expect(adresseBienTouchee({ ...ADRESSE_BIEN_VIDE, adresse: '3' }, null)).toBe(true);
    const lue = adresseBienLue(PORT);
    expect(adresseBienTouchee({ ...lue, commune: 'Courbevoie ' }, { ...PORT, nature: null })).toBe(false);
    expect(adresseBienTouchee({ ...lue, adresse: '5 Rue du Port' }, { ...PORT, nature: null })).toBe(true);
    expect(adresseBienTouchee({ ...lue, nature: 'hors_liste' }, { ...PORT, nature: null })).toBe(true);
  });
  it('tapée sans être choisie : refusée avant envoi (sauf « hors liste », qui exige code postal et commune) ; non touchée : jamais', () => {
    const tapee = { ...ADRESSE_BIEN_VIDE, adresse: '3 rue du Port' };
    expect(refusAdresseBienEcran(tapee, true)).toBe(MOTIF_ADRESSE_BIEN_A_CHOISIR);
    expect(refusAdresseBienEcran(tapee, false)).toBeNull();
    expect(refusAdresseBienEcran({ ...tapee, ...PORT, verifiee: true }, true)).toBeNull();
    expect(refusAdresseBienEcran({ ...tapee, nature: 'hors_liste', horsListeConfirme: true }, true)).toContain('code postal à 5 chiffres');
    expect(refusAdresseBienEcran({ ...tapee, ...PORT, nature: 'hors_liste', horsListeConfirme: true }, true)).toBeNull();
  });
  it('sans numéro : la fenêtre est due jusqu’à la confirmation ; ce qui part le dit', () => {
    const rue = { ...adresseBienLue({ ...PORT, adresse: 'Rue du Port' }) };
    expect(sansNumeroAConfirmer(rue, true)).toBe(true);
    expect(sansNumeroAConfirmer(rue, false)).toBe(false);
    expect(sansNumeroAConfirmer({ ...rue, sansNumeroConfirme: true }, true)).toBe(false);
    expect(adresseBienEnLigne(rue)).toBe('Rue du Port, 92400 COURBEVOIE');
    expect(metaAdresseBien({ ...rue, sansNumeroConfirme: true })).toEqual({ nature: 'liste', pays: null, horsListeConfirme: false, sansNumeroConfirme: true });
    expect(metaAdresseBien({ ...rue, nature: 'hors_liste', horsListeConfirme: true })).toMatchObject({ nature: 'hors_liste', horsListeConfirme: true });
  });
  it('🔴 (lot 4, apporteurs) à l’étranger : adresse puis pays exigés ; pas de fenêtre « sans numéro » ; nature et pays envoyés ; changer de pays est une modification', () => {
    const etr = { ...ADRESSE_BIEN_VIDE, nature: 'etranger' as const, adresse: 'Rue de la Loi 16', codePostal: '1000', commune: 'BRUXELLES', pays: '' };
    expect(refusAdresseBienEcran({ ...etr, adresse: '' }, true)).toBe('Saisissez l’adresse à l’étranger.');
    expect(refusAdresseBienEcran(etr, true)).toBe('Indiquez le pays de cette adresse à l’étranger.');
    expect(refusAdresseBienEcran({ ...etr, pays: 'Belgique' }, true)).toBeNull();
    expect(sansNumeroAConfirmer({ ...etr, adresse: 'Rue de la Loi' }, true)).toBe(false);
    expect(metaAdresseBien({ ...etr, pays: ' Belgique ' })).toEqual({ nature: 'etranger', pays: 'Belgique', horsListeConfirme: false, sansNumeroConfirme: false });
    const lue = { adresse: 'Rue de la Loi 16', codePostal: '1000', commune: 'BRUXELLES', nature: 'etranger' as const, pays: 'Belgique' };
    expect(adresseBienTouchee({ ...etr, pays: 'Belgique' }, lue)).toBe(false);
    expect(adresseBienTouchee({ ...etr, pays: 'Suisse' }, lue)).toBe(true);
  });
});
