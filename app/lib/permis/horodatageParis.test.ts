import { describe, it, expect } from 'vitest';
import { formaterHorodatageParis, jourParisISO, jourFrParis } from './horodatageParis';

/**
 * LOT 49 — affichage des horodatages en heure de Paris. On prouve : (1) un INSTANT UTC (« …Z ») est converti à Europe/Paris
 * (+2 h en été, +1 h en hiver avec bascule de jour) ; (2) une DATE CIVILE (sans « T », ancre 12:00 Europe/Paris du LOT-1) est
 * laissée INTACTE — jamais décalée (le piège du lot : ne pas re-convertir ce qui est déjà local) ; (3) null/invalide → « — ».
 */
describe('LOT 49 — formaterHorodatageParis (instant UTC → Paris)', () => {
  it('été : 07:16 UTC → 09:16 Paris (cas 154, envoi du 03/09)', () => {
    expect(formaterHorodatageParis('2026-09-03T07:16:00Z')).toBe('2026-09-03 09:16');
  });
  it('reçu 09:50 UTC → 11:50 Paris (cas 154)', () => {
    expect(formaterHorodatageParis('2026-09-03T09:50:00Z')).toBe('2026-09-03 11:50');
  });
  it('hiver : 23:30 UTC → 00:30 Paris, avec bascule de jour', () => {
    expect(formaterHorodatageParis('2026-01-15T23:30:00Z')).toBe('2026-01-16 00:30');
  });
  it('DATE CIVILE (sans T, ancre LOT-1) → INTACTE, jamais décalée', () => {
    expect(formaterHorodatageParis('2026-08-28')).toBe('2026-08-28');
  });
  it('null / invalide → « — »', () => {
    expect(formaterHorodatageParis(null)).toBe('—');
    expect(formaterHorodatageParis('pas une date')).toBe('—');
  });
});

describe('LOT 49 — jourParisISO / jourFrParis (JOUR en Paris, pas de décalage près de minuit)', () => {
  it('jour Paris d’un instant UTC nocturne bascule correctement', () => {
    expect(jourParisISO('2026-01-15T23:30:00Z')).toBe('2026-01-16'); // 00:30 Paris = le 16
    expect(jourFrParis('2026-01-15T23:30:00Z')).toBe('16/01/2026');
  });
  it('date civile déclarée (LOT-1) → jour INTACT (pas de conversion)', () => {
    expect(jourParisISO('2026-08-28')).toBe('2026-08-28');
    expect(jourFrParis('2026-08-28')).toBe('28/08/2026');
  });
  it('null / invalide → « — »', () => {
    expect(jourParisISO(null)).toBe('—');
    expect(jourFrParis('')).toBe('—');
  });
});
