import { describe, it, expect } from 'vitest';
import { dateBasculeTheorique } from './phasesBascule';

/**
 * PHASE-1 — fonction PURE `dateBasculeTheorique` : date d'accord + délai (jours) → date de bascule THÉORIQUE. Aucune base, aucune
 * décision de phase/verdict : juste l'arithmétique de dates. On éprouve le défaut 548, un délai personnalisé, une année bissextile,
 * et le cas « date d'accord absente ».
 */
describe('dateBasculeTheorique', () => {
  it('date d’accord + 548 jours (défaut) → date de bascule attendue', () => {
    expect(dateBasculeTheorique('2025-10-28', 548)).toBe('2027-04-29'); // dossier 531 (accord réel)
    expect(dateBasculeTheorique('2025-08-27', 548)).toBe('2027-02-26'); // dossier 11430 (accord réel)
  });

  it('délai PERSONNALISÉ respecté (jamais 548 en dur)', () => {
    expect(dateBasculeTheorique('2025-10-28', 0)).toBe('2025-10-28');   // délai 0 → même jour
    expect(dateBasculeTheorique('2025-01-31', 365)).toBe('2026-01-31'); // un an calendaire
  });

  it('année BISSEXTILE : le 29 février est compté (60 j depuis le 1er janvier)', () => {
    expect(dateBasculeTheorique('2024-01-01', 60)).toBe('2024-03-01'); // 2024 bissextile : Fév a 29 j → 60 j = 1er mars
    expect(dateBasculeTheorique('2023-01-01', 60)).toBe('2023-03-02'); // 2023 non bissextile : Fév a 28 j → 60 j = 2 mars
  });

  it('accepte un objet Date (composants UTC) autant qu’une chaîne ISO', () => {
    expect(dateBasculeTheorique(new Date(Date.UTC(2025, 9, 28)), 548)).toBe('2027-04-29'); // mois 9 = octobre
  });

  it('date d’accord ABSENTE → pas de bascule calculable (null explicite, jamais une date inventée)', () => {
    expect(dateBasculeTheorique(null, 548)).toBeNull();
    expect(dateBasculeTheorique(undefined, 548)).toBeNull();
    expect(dateBasculeTheorique('', 548)).toBeNull();
    expect(dateBasculeTheorique('pas-une-date', 548)).toBeNull();
  });

  it('délai invalide (non entier ou négatif) → null (garde : on ne suppose rien)', () => {
    expect(dateBasculeTheorique('2025-10-28', -1)).toBeNull();
    expect(dateBasculeTheorique('2025-10-28', 1.5)).toBeNull();
    expect(dateBasculeTheorique('2025-10-28', Number.NaN)).toBeNull();
  });
});
