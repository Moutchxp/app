import { describe, expect, it } from 'vitest';
import { etagePossible, pasEtage, pasPieces, piecesPossible } from './pasChamp';

describe('🔴 flèches ▲ ▼ : étage de −5 à 60 (0 = RDC), pièces à partir de 1', () => {
  it('étage : +1 / −1, RDC au zéro, bornes −5 et 60', () => {
    expect(pasEtage('', 1)).toBe('1');
    expect(pasEtage('1', -1)).toBe('RDC');
    expect(pasEtage('RDC', -1)).toBe('-1');
    expect(pasEtage('rdc', 1)).toBe('1');
    expect(pasEtage('-5', -1)).toBe('-5');
    expect(pasEtage('60', 1)).toBe('60');
    expect(pasEtage('59', 1)).toBe('60');
    expect([etagePossible('60', 1), etagePossible('60', -1), etagePossible('-5', -1), etagePossible('mezzanine', -1)]).toEqual([false, true, false, true]);
  });
  it('texte libre : conservé tant qu’on ne clique pas ; une flèche repart du RDC', () => {
    expect(pasEtage('mezzanine', 1)).toBe('1');
    expect(pasEtage('mezzanine', -1)).toBe('-1');
  });
  it('pièces : minimum 1, jamais de négatif', () => {
    expect(pasPieces('', 1)).toBe('1');
    expect(pasPieces('', -1)).toBe('1');
    expect(pasPieces('1', -1)).toBe('1');
    expect(pasPieces('3', 1)).toBe('4');
    expect([piecesPossible('1', -1), piecesPossible('2', -1), piecesPossible('50', 1)]).toEqual([false, true, false]);
  });
});
