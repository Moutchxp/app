import { describe, it, expect } from 'vitest';
import { premierParam, formatDateFr, formatEtage, libelleVerdict, libelleTypeDocument, MESSAGE_SANS_COMPTE } from './presentation';

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

describe('libelleTypeDocument (param doc, présentation non fiable)', () => {
  it("'nominatif' → « le certificat nominatif »", () => expect(libelleTypeDocument('nominatif')).toBe('le certificat nominatif'));
  it("'anonyme' → « la version anonymisée »", () => expect(libelleTypeDocument('anonyme')).toBe('la version anonymisée'));
  it("'visuel' → « le visuel »", () => expect(libelleTypeDocument('visuel')).toBe('le visuel'));
  it('absent (undefined) → générique « ce certificat »', () => expect(libelleTypeDocument(undefined)).toBe('ce certificat'));
  it('valeur inconnue → générique « ce certificat »', () => expect(libelleTypeDocument('n’importe-quoi')).toBe('ce certificat'));
});

describe('MESSAGE_SANS_COMPTE (statut sans_compte)', () => {
  it('mentionne la non-authentifiabilité en ligne et l’absence de compte, sans révéler aucun champ', () => {
    expect(MESSAGE_SANS_COMPTE).toContain('authentifiable en ligne');
    expect(MESSAGE_SANS_COMPTE).toContain('compte Sans Vis-à-Vis®');
    // Aucun champ du certificat ne doit figurer dans le message (adresse, étage, verdict, date…).
    expect(MESSAGE_SANS_COMPTE).not.toMatch(/étage|verdict|adresse/i);
  });
});
