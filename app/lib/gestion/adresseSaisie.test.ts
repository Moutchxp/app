import { describe, expect, it } from 'vitest';
import { decisionAdresse, mentionAdresse, metaPropre, MOTIF_CP_COMMUNE, MOTIF_HORS_LISTE_NON_CONFIRME, MOTIF_PAYS, type AdresseFiche } from './adresseSaisie';

/** 🔴 Arno (17/11/2026, « Adresses uniformisées », lot 2) — ce que le serveur accepte pour l'adresse d'une personne. */
const AVANT: AdresseFiche = { adresse: '7 rue des Essais', codePostal: '92400', commune: 'Courbevoie', nature: null, pays: null };
const VIDE: AdresseFiche = { adresse: null, codePostal: null, commune: null, nature: null, pays: null };
const LILAS = { adresse: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS' };

describe('🔴 aucune adresse existante n’est réécrite', () => {
  it('non touchée (casse, espaces, mise en forme de la commune comprises) : inchangée, ni revérifiée ni requalifiée', () => {
    expect(decisionAdresse(AVANT, { adresse: '7  rue des Essais', codePostal: '92400', commune: 'COURBEVOIE' }, undefined)).toEqual({ etat: 'inchangee' });
    expect(decisionAdresse(AVANT, {}, { nature: null })).toEqual({ etat: 'inchangee' });
    expect(decisionAdresse({ ...AVANT, nature: 'etranger', pays: 'Belgique' }, {}, undefined)).toEqual({ etat: 'inchangee' });
  });
});

describe('une adresse française : CHOISIE dans la liste, puis retrouvée par le serveur', () => {
  it('modifiée : à retrouver dans la Base Adresse Nationale (même sans métadonnées : un écran d’avant ne passe pas outre)', () => {
    expect(decisionAdresse(AVANT, LILAS, { nature: 'liste' })).toEqual({ etat: 'a_verifier', adresse: { libelle: '3 Rue des Lilas', codePostal: '75011', commune: 'PARIS' } });
    expect(decisionAdresse(AVANT, LILAS, undefined).etat).toBe('a_verifier');
  });
  it('code postal à 5 chiffres et commune exigés ; une rue sans numéro exige la confirmation de l’écran', () => {
    expect(decisionAdresse(AVANT, { ...LILAS, codePostal: '7501' }, { nature: 'liste' })).toEqual({ etat: 'refus', motif: MOTIF_CP_COMMUNE });
    const sansNumero = { adresse: 'Rue Pierre Lhomme', codePostal: '92400', commune: 'COURBEVOIE' };
    expect(decisionAdresse(AVANT, sansNumero, { nature: 'liste' })).toMatchObject({ etat: 'refus', motif: expect.stringContaining('n’a pas de numéro') });
    expect(decisionAdresse(AVANT, sansNumero, { nature: 'liste', sansNumeroConfirme: true }).etat).toBe('a_verifier');
  });
  it('effacée entièrement : plus d’adresse, plus de nature ; la rue seule effacée : refus', () => {
    expect(decisionAdresse(AVANT, { adresse: '', codePostal: '', commune: '' }, { nature: 'liste' })).toEqual({ etat: 'retenue', nature: null, pays: null });
    expect(decisionAdresse(AVANT, { adresse: '' }, { nature: 'liste' }).etat).toBe('refus');
  });
});

describe('les deux exceptions, marquées', () => {
  it('hors liste : seulement CONFIRMÉE, avec code postal et commune', () => {
    expect(decisionAdresse(VIDE, LILAS, { nature: 'hors_liste' })).toEqual({ etat: 'refus', motif: MOTIF_HORS_LISTE_NON_CONFIRME });
    expect(decisionAdresse(VIDE, LILAS, { nature: 'hors_liste', horsListeConfirme: true })).toEqual({ etat: 'retenue', nature: 'hors_liste', pays: null });
    expect(decisionAdresse(VIDE, { ...LILAS, commune: '' }, { nature: 'hors_liste', horsListeConfirme: true })).toEqual({ etat: 'refus', motif: MOTIF_CP_COMMUNE });
  });
  it('à l’étranger : saisie libre (code postal en lettres compris), PAYS obligatoire', () => {
    const londres = { adresse: '10 Downing Street', codePostal: 'SW1A 2AA', commune: 'London' };
    expect(decisionAdresse(VIDE, londres, { nature: 'etranger', pays: ' ' })).toEqual({ etat: 'refus', motif: MOTIF_PAYS });
    expect(decisionAdresse(VIDE, londres, { nature: 'etranger', pays: 'Royaume-Uni' })).toEqual({ etat: 'retenue', nature: 'etranger', pays: 'Royaume-Uni' });
    // le pays seul changé est une modification
    expect(decisionAdresse({ ...VIDE, ...londres, nature: 'etranger', pays: 'Royaume-Uni' }, londres, { nature: 'etranger', pays: 'Irlande' })).toEqual({ etat: 'retenue', nature: 'etranger', pays: 'Irlande' });
  });
});

describe('le corps d’une requête et la mention affichée', () => {
  it('relu champ par champ ; une nature inconnue ne vaut rien', () => {
    expect(metaPropre({ nature: 'n’importe', pays: 3, horsListeConfirme: 'oui' })).toEqual({ nature: null, pays: null, horsListeConfirme: false, sansNumeroConfirme: false });
    expect(metaPropre(null)).toBeUndefined();
  });
  it('« hors liste — à vérifier », « adresse à l’étranger — Belgique », rien pour une adresse de la liste ou d’avant', () => {
    expect([mentionAdresse('hors_liste', null), mentionAdresse('etranger', 'Belgique'), mentionAdresse('liste', null), mentionAdresse(null, null)])
      .toEqual(['hors liste — à vérifier', 'adresse à l’étranger — Belgique', null, null]);
  });
});
