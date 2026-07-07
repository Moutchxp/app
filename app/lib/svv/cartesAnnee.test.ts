import { describe, it, expect } from 'vitest';
import {
  intervalleReelCarte,
  carteMatche,
  validerCartesAnnee,
  type CarteAnnee,
} from './cartesAnnee';
import { PROFIL_DEGAGEMENT_DEFAUT } from './profilDegagement';

/** Fabrique une carte à la main (coefficients neutres par défaut, hors sujet des tests d'intervalle). */
function carte(over: Partial<CarteAnnee>): CarteAnnee {
  return { borneMin: null, opMin: null, borneMax: null, opMax: null, cone: 1, flanc: 1, distMaxM: 100, ...over };
}

describe('intervalleReelCarte — résolution en intervalle entier', () => {
  it('> 1900 → lo = 1901', () => {
    expect(intervalleReelCarte(carte({ borneMin: 1900, opMin: '>' }))).toEqual([1901, Infinity]);
  });
  it('< 1930 → hi = 1929', () => {
    expect(intervalleReelCarte(carte({ borneMax: 1930, opMax: '<' }))).toEqual([-Infinity, 1929]);
  });
  it('≤ 1900 → hi = 1900', () => {
    expect(intervalleReelCarte(carte({ borneMax: 1900, opMax: '<=' }))).toEqual([-Infinity, 1900]);
  });
  it('≥ 1901 → lo = 1901', () => {
    expect(intervalleReelCarte(carte({ borneMin: 1901, opMin: '>=' }))).toEqual([1901, Infinity]);
  });
});

describe('carteMatche', () => {
  it('≤ 1900 matche 1900, pas 1901', () => {
    const c = carte({ borneMax: 1900, opMax: '<=' });
    expect(carteMatche(c, 1900)).toBe(true);
    expect(carteMatche(c, 1901)).toBe(false);
  });
  it('> 1900 & ≤ 1935 matche 1901 et 1935, pas 1900 ni 1936', () => {
    const c = carte({ borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=' });
    expect(carteMatche(c, 1900)).toBe(false);
    expect(carteMatche(c, 1901)).toBe(true);
    expect(carteMatche(c, 1935)).toBe(true);
    expect(carteMatche(c, 1936)).toBe(false);
  });
});

describe('validerCartesAnnee', () => {
  it('intervalle vide « > 1935 et < 1930 » (lo 1936 > hi 1929) → invalide', () => {
    const r = validerCartesAnnee([carte({ borneMin: 1935, opMin: '>', borneMax: 1930, opMax: '<' })]);
    expect(r.ok).toBe(false);
  });
  it('chevauchement « ≤ 1900 » + « ≥ 1900 » (partagent 1900) → rejeté', () => {
    const r = validerCartesAnnee([
      carte({ borneMax: 1900, opMax: '<=' }),
      carte({ borneMin: 1900, opMin: '>=' }),
    ]);
    expect(r.ok).toBe(false);
  });
  it('disjoints « ≤ 1900 » + « > 1900 et ≤ 1935 » → ok (trou nul, mais pas de partage)', () => {
    const r = validerCartesAnnee([
      carte({ borneMax: 1900, opMax: '<=' }),
      carte({ borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=' }),
    ]);
    expect(r.ok).toBe(true);
  });
  it('unaire « ≥ 2020 » → ok', () => {
    const r = validerCartesAnnee([carte({ borneMin: 2020, opMin: '>=' })]);
    expect(r.ok).toBe(true);
  });
  it('carte sans aucune borne → invalide', () => {
    const r = validerCartesAnnee([carte({})]);
    expect(r.ok).toBe(false);
  });
});

/**
 * ÉQUIVALENCE EXHAUSTIVE (bit-identité, sans DB) — CRITIQUE.
 * Pour le SEED 2 cartes (= PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee), la nouvelle classification par
 * cartes DOIT reproduire EXACTEMENT l'ancienne cascade fixe pour chaque année entière 1799..2101 et
 * `null`. On compare l'OBJET COMPLET {cone, flanc, distMaxM} (les 3 champs) → détecte toute
 * transposition cône↔flanc. Bit-identité CONDITIONNÉE aux années entières (impactAnnee toujours entier,
 * edge fractionnaire non atteignable).
 */
describe('équivalence exhaustive seed ↔ ancienne cascade (bit-identité)', () => {
  const cartes = PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee;

  /** Ancienne classification de référence EN DUR (cascade ≤1900 / ≤1935). */
  function ancienne(annee: number | null): { cone: number; flanc: number; distMaxM: number } | null {
    if (annee !== null && annee <= 1900) return { cone: 1.5, flanc: 1.2, distMaxM: 300 };
    if (annee !== null && annee <= 1935) return { cone: 1.2, flanc: 1.1, distMaxM: 200 };
    return null;
  }

  /** Nouvelle classification via cartes. */
  function nouvelle(annee: number | null): { cone: number; flanc: number; distMaxM: number } | null {
    if (annee === null) return null;
    const c = cartes.find((carteAnnee) => carteMatche(carteAnnee, annee));
    return c ? { cone: c.cone, flanc: c.flanc, distMaxM: c.distMaxM } : null;
  }

  it('null → identique (aucune famille)', () => {
    expect(nouvelle(null)).toEqual(ancienne(null));
  });

  it('1799..2101 → objet complet identique année par année', () => {
    for (let annee = 1799; annee <= 2101; annee++) {
      expect(nouvelle(annee)).toEqual(ancienne(annee));
    }
  });
});
