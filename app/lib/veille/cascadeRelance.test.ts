import { describe, it, expect } from 'vitest';
import { etapeCible, joursAvantEcheance, saisineLeDe, rangVariante, type ReglagesCascade } from './cascadeRelance';

/**
 * Lot 3/6 — cascade PURE : la FENÊTRE cible au jour près (4 bornes + réglages incohérents), la date de saisine dérivée, et le
 * rang chronologique (idempotence/transition). Aucune I/O.
 */
const ENVOI = new Date('2026-03-14T10:00:00Z'); // échéance = 14 avril 10:00 UTC (echeanceDe : + 1 mois calendaire)
const REG: ReglagesCascade = { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 };
const j = (iso: string) => new Date(iso);

describe('lot 3 — etapeCible : fenêtre au jour près (rappel 10 / avis 3)', () => {
  it('reste > rappel (11 j) → aucune étape (null)', () => {
    expect(etapeCible(ENVOI, j('2026-04-03T10:00:00Z'), REG)).toBeNull();
  });
  it('reste = rappel (10 j) → rappel (borne haute incluse)', () => {
    expect(etapeCible(ENVOI, j('2026-04-04T10:00:00Z'), REG)).toBe('rappel');
  });
  it('avis < reste ≤ rappel (4 j) → rappel', () => {
    expect(etapeCible(ENVOI, j('2026-04-10T10:00:00Z'), REG)).toBe('rappel');
  });
  it('reste = avis (3 j) → avis (borne haute incluse)', () => {
    expect(etapeCible(ENVOI, j('2026-04-11T10:00:00Z'), REG)).toBe('avis');
  });
  it('0 < reste ≤ avis (1 j) → avis', () => {
    expect(etapeCible(ENVOI, j('2026-04-13T10:00:00Z'), REG)).toBe('avis');
  });
  it('reste = 0 (jour de l’échéance) → saisine', () => {
    expect(etapeCible(ENVOI, j('2026-04-14T10:00:00Z'), REG)).toBe('saisine');
  });
  it('reste < 0 (échéance dépassée) → saisine', () => {
    expect(etapeCible(ENVOI, j('2026-04-20T10:00:00Z'), REG)).toBe('saisine');
  });
  it('réglages INCOHÉRENTS (avis ≥ rappel) : la fenêtre rappel est VIDE → on passe directement à avis, jamais d’erreur', () => {
    const INCO: ReglagesCascade = { rappelJoursAvant: 3, avisJoursAvant: 10, saisineDelaiJours: 4 };
    expect(etapeCible(ENVOI, j('2026-04-09T10:00:00Z'), INCO)).toBe('avis');   // reste 5 : ni saisine ni null → avis (jamais rappel)
    expect(etapeCible(ENVOI, j('2026-04-03T10:00:00Z'), INCO)).toBeNull();     // reste 11 > avis 10 → aucune étape
    expect(etapeCible(ENVOI, j('2026-04-14T10:00:00Z'), INCO)).toBe('saisine');
  });
});

describe('lot 3 — saisineLeDe / rangVariante / joursAvantEcheance', () => {
  it('saisineLeDe = échéance + délai (jours)', () => {
    expect(saisineLeDe(ENVOI, 4).toISOString().slice(0, 10)).toBe('2026-04-18'); // 14 avril + 4
  });
  it('rangVariante : rappel < avis < saisine ; formelle ≡ saisine (héritée, jamais migrée)', () => {
    expect(rangVariante('rappel')).toBeLessThan(rangVariante('avis'));
    expect(rangVariante('avis')).toBeLessThan(rangVariante('saisine'));
    expect(rangVariante('formelle')).toBe(rangVariante('saisine'));
  });
  it('joursAvantEcheance : négatif une fois l’échéance dépassée', () => {
    expect(joursAvantEcheance(ENVOI, j('2026-04-20T10:00:00Z'))).toBeLessThan(0);
  });
});
