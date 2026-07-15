import { describe, it, expect } from 'vitest';
import { premierParam, formatDateFr, formatEtage, libelleVerdict } from './presentation';

describe('premierParam', () => {
  it('string → elle-même', () => expect(premierParam('SAVV-2026-000001')).toBe('SAVV-2026-000001'));
  it('array → première valeur', () => expect(premierParam(['a', 'b'])).toBe('a'));
  it('undefined → undefined', () => expect(premierParam(undefined)).toBeUndefined());
  it('array vide → undefined', () => expect(premierParam([])).toBeUndefined());
});

describe('formatDateFr — ancrée Europe/Paris', () => {
  it('ISO valide → date française lisible (jour/mois/année)', () => {
    const s = formatDateFr('2026-07-15T09:30:00.000Z'); // 11h30 à Paris (été, +2)
    expect(s).toContain('15');
    expect(s).toContain('juillet');
    expect(s).toContain('2026');
  });
  it('entrée illisible → renvoyée telle quelle (pas de crash)', () => {
    expect(formatDateFr('pas-une-date')).toBe('pas-une-date');
  });
});

describe('formatEtage — null / 0 gérés', () => {
  it('null → Non renseigné', () => expect(formatEtage(null)).toBe('Non renseigné'));
  it('0 → Rez-de-chaussée', () => expect(formatEtage(0)).toBe('Rez-de-chaussée'));
  it('3 → 3ᵉ étage', () => expect(formatEtage(3)).toBe('3ᵉ étage'));
});

describe('libelleVerdict', () => {
  it('SANS_VIS_A_VIS → Sans vis-à-vis', () => expect(libelleVerdict('SANS_VIS_A_VIS')).toBe('Sans vis-à-vis'));
  it('VIS_A_VIS → Vis-à-vis', () => expect(libelleVerdict('VIS_A_VIS')).toBe('Vis-à-vis'));
  it('valeur inconnue → brute', () => expect(libelleVerdict('AUTRE')).toBe('AUTRE'));
});
