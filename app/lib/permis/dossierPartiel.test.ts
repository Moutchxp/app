import { describe, it, expect } from 'vitest';
import { doitLeverAuto, libelleSuspension, type EtatPartiel } from './dossierPartiel';

describe('CASC-1 — doitLeverAuto (levée auto = tous les permis complets, pur)', () => {
  it('tous les dossiers complets → LEVER', () => {
    expect(doitLeverAuto([true, true, true])).toBe(true);
  });
  it('un dossier incomplet → NE PAS lever', () => {
    expect(doitLeverAuto([true, false, true])).toBe(false);
  });
  it('un dossier jamais analysé (null) → NE PAS lever (on ne conclut pas)', () => {
    expect(doitLeverAuto([true, null])).toBe(false);
  });
  it('aucun dossier → NE PAS lever', () => {
    expect(doitLeverAuto([])).toBe(false);
  });
  it('un seul dossier complet → LEVER', () => {
    expect(doitLeverAuto([true])).toBe(true);
  });
});

describe('CASC-1 — libelleSuspension (raison + date, jamais un silence, pur)', () => {
  const etat = (over: Partial<EtatPartiel> = {}): EtatPartiel => ({ le: '2026-08-30T10:00:00Z', familles: ['cerfa', 'etage'], origine: 'outil', ...over });
  it('porte la DATE, l’origine « réclamation envoyée » et les familles', () => {
    const s = libelleSuspension(etat());
    expect(s).toContain('2026-08-30');
    expect(s).toContain('réclamation envoyée');
    expect(s).toContain('cerfa, etage');
    expect(s.toLowerCase()).toContain('suspendue');
  });
  it('origine déclarée → « relance déclarée »', () => {
    expect(libelleSuspension(etat({ origine: 'declaree' }))).toContain('relance déclarée');
  });
  it('sans familles → pas de parenthèse de pièces, mais toujours la raison', () => {
    const s = libelleSuspension(etat({ familles: [] }));
    expect(s).toContain('réclamation envoyée');
    expect(s).not.toContain('pièces :');
  });
});
