import { describe, it, expect } from 'vitest';
import { pieceExclueSignature, cibleVersement, parserHachagesExclus } from './versementRattache';

/** PART-1 — décisions PURES du versement rattaché : exclusion de signature (par empreinte) et cible mono/multi-dossier. */
describe('parserHachagesExclus', () => {
  it('parse virgules/espaces, minuscule, sans vide', () => {
    expect(parserHachagesExclus('AB12, cd34')).toEqual(['ab12', 'cd34']);
    expect(parserHachagesExclus('')).toEqual([]);
    expect(parserHachagesExclus(null)).toEqual([]);
  });
});

describe('pieceExclueSignature', () => {
  const H = ['e03ddb3adb387cd05867a7bf35fc731acc9a5a31075b3bf5cef1e9f5719b88e9'];
  it('empreinte listée → écartée (insensible à la casse)', () => {
    expect(pieceExclueSignature({ typeMime: 'image/png', sha256: H[0] }, H)).toBe(true);
    expect(pieceExclueSignature({ typeMime: 'image/png', sha256: H[0].toUpperCase() }, H)).toBe(true);
  });
  it('empreinte non listée → conservée (un vrai document)', () => {
    expect(pieceExclueSignature({ typeMime: 'application/pdf', sha256: 'f3ea9e518ca8261a' }, H)).toBe(false);
  });
  it('empreinte absente → jamais exclue (on ne devine pas)', () => {
    expect(pieceExclueSignature({ typeMime: 'image/png', sha256: null }, H)).toBe(false);
    expect(pieceExclueSignature({ typeMime: 'image/png', sha256: '' }, H)).toBe(false);
  });
  it('liste vide → rien d’exclu', () => {
    expect(pieceExclueSignature({ typeMime: 'image/png', sha256: H[0] }, [])).toBe(false);
  });
});

describe('cibleVersement', () => {
  it('exactement 1 dossier → cet unique dossier, jamais multi', () => {
    expect(cibleVersement([{ dossierId: 7424 }])).toEqual({ dossierId: 7424, multi: false });
  });
  it('≥ 2 dossiers → NON traité (multi), aucune cible', () => {
    expect(cibleVersement([{ dossierId: 1 }, { dossierId: 2 }])).toEqual({ dossierId: null, multi: true });
  });
  it('0 dossier → rien', () => {
    expect(cibleVersement([])).toEqual({ dossierId: null, multi: false });
  });
});
