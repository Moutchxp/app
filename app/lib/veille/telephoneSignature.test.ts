import { describe, it, expect } from 'vitest';
import { normaliserTelephoneFr, extraireTelephonesSignature, qualifierTelephones } from './telephoneSignature';

/**
 * LOT 28 — extraction/qualification PURE du téléphone d'une signature. On prouve : normalisation multi-format, extraction bornée à la
 * signature (fil cité ignoré), et qualification qui ne DEVINE jamais (fait seul). Cas réel : la signature de Lauriane Pangui (Aubervilliers).
 */

describe('normaliserTelephoneFr — multi-format → « 0X XX XX XX XX »', () => {
  it('espaces, points, tirets, collé, +33, 0033', () => {
    expect(normaliserTelephoneFr('01 48 39 51 81')).toBe('01 48 39 51 81');
    expect(normaliserTelephoneFr('01.48.39.51.81')).toBe('01 48 39 51 81');
    expect(normaliserTelephoneFr('01-48-39-51-81')).toBe('01 48 39 51 81');
    expect(normaliserTelephoneFr('0148395181')).toBe('01 48 39 51 81');
    expect(normaliserTelephoneFr('+33 1 48 39 51 81')).toBe('01 48 39 51 81');
    expect(normaliserTelephoneFr('0033148395181')).toBe('01 48 39 51 81');
  });
  it('rejette ce qui n’est pas un numéro FR à 10 chiffres', () => {
    expect(normaliserTelephoneFr('00 48 39 51 81')).toBeNull(); // 2e chiffre 0
    expect(normaliserTelephoneFr('01 48 39 51')).toBeNull();    // trop court
    expect(normaliserTelephoneFr('SIRET 123 456 789')).toBeNull();
    expect(normaliserTelephoneFr('')).toBeNull();
  });
});

const SIG_LAURIANE = `Bonjour,

Comme demandé, vous trouverez les PC2 & PC3 pour le projet du 1 rue Ferragus à Aubervilliers

Cordialement
Lauriane PANGUI
Assistante d' Audrey Paris
Directrice de l'Urbanisme
120 bis rue Henri Barbusse
Tél. 01 48 39 51 81
`;

describe('extraireTelephonesSignature — cas réel + bornes', () => {
  it('signature à UN numéro étiqueté « Tél. » (cas Aubervilliers) → un numéro, étiquette direct', () => {
    expect(extraireTelephonesSignature(SIG_LAURIANE)).toEqual([{ numero: '01 48 39 51 81', label: 'direct' }]);
  });
  it('signature à DEUX numéros dont un « Standard » → un direct + un standard', () => {
    const t = `Cordialement\nJean Martin\nTél. 01 11 11 11 11\nStandard : 01 22 22 22 22`;
    expect(extraireTelephonesSignature(t)).toEqual([
      { numero: '01 11 11 11 11', label: 'direct' },
      { numero: '01 22 22 22 22', label: 'standard' },
    ]);
  });
  it('un numéro présent UNIQUEMENT dans le fil cité (après « De: ») est IGNORÉ', () => {
    const t = `Bonjour, c'est noté.\nCordialement\nMarie\n\nDe : mairie@ex.fr\nEnvoyé : mardi 12 août\nÀ : nous\nObjet : PC\nTél. 01 99 99 99 99`;
    expect(extraireTelephonesSignature(t)).toEqual([]);
  });
  it('formats +33 et pointés dans la signature → normalisés', () => {
    const t = `Bien à vous\nPaul\nLigne directe : +33 1 48 39 51 81\nAccueil 01.48.39.52.80`;
    expect(extraireTelephonesSignature(t)).toEqual([
      { numero: '01 48 39 51 81', label: 'direct' },
      { numero: '01 48 39 52 80', label: 'standard' },
    ]);
  });
  it('un numéro dans le CORPS (avant toute formule de politesse) et non étiqueté est IGNORÉ', () => {
    const t = `Merci d'appeler le 01 40 00 00 00 avant lundi.\n\nCordialement\nAgent`;
    expect(extraireTelephonesSignature(t)).toEqual([]);
  });
  it('aucun numéro → liste vide (la ligne restera inchangée à l’affichage)', () => {
    expect(extraireTelephonesSignature('Bonjour, merci.\nCordialement\nMarie')).toEqual([]);
    expect(extraireTelephonesSignature('')).toEqual([]);
  });
});

describe('qualifierTelephones — jamais de qualification devinée', () => {
  it('étiquette écrite fait foi (jamais écrasée)', () => {
    expect(qualifierTelephones([{ numero: '01 11 11 11 11', label: 'direct' }], { nomConnu: true, standardCommune: null }))
      .toEqual([{ numero: '01 11 11 11 11', label: 'direct', source: 'signature' }]);
  });
  it('seul numéro d’une signature NOMMÉE, non étiqueté → direct', () => {
    expect(qualifierTelephones([{ numero: '01 11 11 11 11', label: null }], { nomConnu: true, standardCommune: null }))
      .toEqual([{ numero: '01 11 11 11 11', label: 'direct', source: 'signature' }]);
  });
  it('numéro non étiqueté rapproché du STANDARD commune connu → standard', () => {
    expect(qualifierTelephones([{ numero: '01 22 22 22 22', label: null }], { nomConnu: true, standardCommune: '01.22.22.22.22' }))
      .toEqual([{ numero: '01 22 22 22 22', label: 'standard', source: 'signature' }]);
  });
  it('DEUX numéros non étiquetés non rapprochables → AUCUNE étiquette (jamais devinée)', () => {
    expect(qualifierTelephones([{ numero: '01 11 11 11 11', label: null }, { numero: '01 22 22 22 22', label: null }], { nomConnu: true, standardCommune: null }))
      .toEqual([
        { numero: '01 11 11 11 11', label: null, source: 'signature' },
        { numero: '01 22 22 22 22', label: null, source: 'signature' },
      ]);
  });
});
