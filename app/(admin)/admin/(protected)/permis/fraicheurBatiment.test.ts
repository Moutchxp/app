import { describe, it, expect } from 'vitest';
import { estConfirmeHumainement, batimentEnregistreAJour, CHAMPS_ENREGISTRES_MESURE, type SaisieCarte, type BaseCarte } from './fraicheurBatiment';

/**
 * FRAÎCHEUR B1 — « Enregistrer ce bâtiment ». CORRECTION (Arno) : LE VIDE N'EST PAS UNE CONFIRMATION. Une carte NEUVE (« + ajouter un
 * bâtiment ») n'a AUCUNE valeur → toutes ses origines sont null → l'ancienne règle « aucune 'extraite' » était vraie PAR VACUITÉ (bouton
 * vert « Bâtiment enregistré » à tort). On teste le COMPORTEMENT de la fonction pure (aucune couleur/forme). Aucun test ne couvrait ce cas.
 */

const saisieVide = (): SaisieCarte => ({ repere: '', adresse: '', ...Object.fromEntries(CHAMPS_ENREGISTRES_MESURE.map((k) => [k, ''])) } as SaisieCarte);
const baseVide = (): BaseCarte => ({ repere: null, adresse: null, ...Object.fromEntries(CHAMPS_ENREGISTRES_MESURE.map((k) => [k, null])) } as BaseCarte);
const originesVides = CHAMPS_ENREGISTRES_MESURE.map(() => null).concat([null]); // 7 mesures + adresse, toutes null (carte neuve)

describe('estConfirmeHumainement — signal POSITIF (≥ 1 saisie ET aucune extraite), jamais par vacuité', () => {
  it('carte NEUVE / vide (aucune origine, ou que des null) → NON confirmée (le vide n’est pas une confirmation)', () => {
    expect(estConfirmeHumainement([])).toBe(false);
    expect(estConfirmeHumainement([null, null, undefined])).toBe(false);
  });
  it('valeurs extraites non confirmées (origine « extraite ») → NON confirmée (déjà acquis, conservé)', () => {
    expect(estConfirmeHumainement(['extraite'])).toBe(false);
    expect(estConfirmeHumainement(['saisie', 'extraite'])).toBe(false); // une seule « extraite » résiduelle suffit
  });
  it('au moins une valeur saisie et aucune extraite → CONFIRMÉE', () => {
    expect(estConfirmeHumainement(['saisie'])).toBe(true);
    expect(estConfirmeHumainement(['saisie', null, null])).toBe(true);
  });
});

describe('batimentEnregistreAJour — les 4 cas (dont le CAS NEUF, jamais couvert)', () => {
  it('CAS NEUF : carte vide (tout null) → NON enregistrée (rouge « Enregistrer ce bâtiment »)', () => {
    expect(batimentEnregistreAJour(saisieVide(), baseVide(), originesVides)).toBe(false);
  });
  it('valeurs extraites non confirmées → NON enregistrée (rouge)', () => {
    const base: BaseCarte = { ...baseVide(), nbEtages: 3 };
    const saisie: SaisieCarte = { ...saisieVide(), nbEtages: '3' };
    const origines = ['extraite', null, null, null, null, null, null, null]; // nbEtages extraite
    expect(batimentEnregistreAJour(saisie, base, origines)).toBe(false);
  });
  it('enregistrée et À JOUR (≥ 1 saisie, rien ne diffère) → enregistrée (vert)', () => {
    const base: BaseCarte = { ...baseVide(), nbEtages: 3, adresse: '1 rue X' };
    const saisie: SaisieCarte = { ...saisieVide(), nbEtages: '3', adresse: '1 rue X' };
    const origines = ['saisie', null, null, null, null, null, null, 'saisie']; // nbEtages + adresse saisie
    expect(batimentEnregistreAJour(saisie, base, origines)).toBe(true);
  });
  it('enregistrée puis MODIFIÉE (valeur du champ ≠ base) → NON enregistrée (rouge, fraîcheur)', () => {
    const base: BaseCarte = { ...baseVide(), nbEtages: 3 };
    const saisie: SaisieCarte = { ...saisieVide(), nbEtages: '4' }; // modifiée, non enregistrée
    const origines = ['saisie', null, null, null, null, null, null, null];
    expect(batimentEnregistreAJour(saisie, base, origines)).toBe(false);
  });
  it('enregistrée puis VIDÉE dans le champ (base a une valeur, saisie vide) → NON enregistrée (rouge)', () => {
    const base: BaseCarte = { ...baseVide(), nbEtages: 3 };
    const saisie: SaisieCarte = { ...saisieVide() }; // champ vidé
    const origines = ['saisie', null, null, null, null, null, null, null];
    expect(batimentEnregistreAJour(saisie, base, origines)).toBe(false);
  });
});
