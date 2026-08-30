import { describe, it, expect } from 'vitest';
import { ageLienJours, seuilAlerteAtteint, ilYaEnJours, libelleLienRecu } from './lienPeremption';

const T = (iso: string) => new Date(iso);

describe('PART-D — ageLienJours (plancher, jamais négatif)', () => {
  it('compte les jours entiers écoulés depuis la réception', () => {
    expect(ageLienJours(T('2026-08-30T10:00:00Z'), T('2026-08-30T12:00:00Z'))).toBe(0); // même jour
    expect(ageLienJours(T('2026-08-30T10:00:00Z'), T('2026-09-03T10:00:00Z'))).toBe(4);
  });
  it('futur (horloge en retard) → 0, jamais négatif', () => {
    expect(ageLienJours(T('2026-09-01T00:00:00Z'), T('2026-08-30T00:00:00Z'))).toBe(0);
  });
});

describe('PART-D — seuilAlerteAtteint (âge ≥ validité − délai d’alerte)', () => {
  it('défauts 7 et 3 → seuil à 4 jours', () => {
    const recu = T('2026-08-30T10:00:00Z');
    expect(seuilAlerteAtteint(recu, T('2026-09-03T10:00:00Z'), 7, 3)).toBe(true);  // 4 j ≥ 4
    expect(seuilAlerteAtteint(recu, T('2026-09-02T23:00:00Z'), 7, 3)).toBe(false); // 3 j < 4
  });
  it('réglages incohérents (alerte ≥ validité) → seuil planchérné à 0 → alerte dès J0', () => {
    expect(seuilAlerteAtteint(T('2026-08-30T10:00:00Z'), T('2026-08-30T10:30:00Z'), 3, 7)).toBe(true);
  });
});

describe('PART-D — ilYaEnJours (fait mesuré, français simple)', () => {
  it('aujourd’hui / 1 jour / N jours', () => {
    expect(ilYaEnJours(T('2026-08-30T08:00:00Z'), T('2026-08-30T20:00:00Z'))).toBe('aujourd’hui');
    expect(ilYaEnJours(T('2026-08-29T08:00:00Z'), T('2026-08-30T20:00:00Z'))).toBe('il y a 1 jour');
    expect(ilYaEnJours(T('2026-08-26T08:00:00Z'), T('2026-08-30T20:00:00Z'))).toBe('il y a 4 jours');
  });
});

describe('PART-D — libelleLienRecu : fait mesuré + hypothèse EXPLICITE, jamais « expire dans N jours » comme un fait', () => {
  it('porte « reçu il y a N jours » et nomme la validité comme HYPOTHÈSE', () => {
    const s = libelleLienRecu(T('2026-08-26T10:00:00Z'), T('2026-08-30T10:00:00Z'), 7);
    expect(s).toContain('reçu il y a 4 jours');
    expect(s).toContain('hypothèse');
    expect(s).toContain('7 jours');
    expect(s).not.toContain('expire dans'); // jamais présenté comme un fait
  });
});
