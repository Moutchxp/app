import { describe, it, expect } from 'vitest';
import {
  wgs84ToLambert93,
  lambert93ToWgs84,
  distanceLambert93,
  haversineMeters,
  genererPointsAxe,
  genererFaisceauxAmplitude,
} from './geo';
import {
  ANALYSIS_RANGE_M,
  CORRIDOR_STEP_M,
  AMPLITUDE_BEAM_COUNT,
  AMPLITUDE_BEAM_STEP_DEG,
} from './config';

describe('geo — round-trip WGS84 ⇄ Lambert-93', () => {
  it('point parisien : écart < 1e-6 deg après aller-retour', () => {
    const paris = { lat: 48.8584, lon: 2.2945 }; // Tour Eiffel
    const back = lambert93ToWgs84(wgs84ToLambert93(paris));
    expect(Math.abs(back.lat - paris.lat)).toBeLessThan(1e-6);
    expect(Math.abs(back.lon - paris.lon)).toBeLessThan(1e-6);
  });
});

describe('geo — distanceLambert93 (distance autoritaire)', () => {
  it('+100 m sur x → 100 m', () => {
    const a = { x: 651000, y: 6862000 };
    const b = { x: 651100, y: 6862000 };
    expect(distanceLambert93(a, b)).toBe(100);
  });

  it('diagonale 3-4-5', () => {
    expect(distanceLambert93({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('geo — haversineMeters (approximation d’appoint)', () => {
  it('reste dans le bon ordre de grandeur vs Lambert-93', () => {
    const a = { lat: 48.8584, lon: 2.2945 };
    const b = { lat: 48.8594, lon: 2.2945 };
    const hav = haversineMeters(a, b);
    const l93 = distanceLambert93(wgs84ToLambert93(a), wgs84ToLambert93(b));
    expect(Math.abs(hav - l93)).toBeLessThan(1); // < 1 m d'écart sur ~111 m
  });
});

describe('geo — genererFaisceauxAmplitude', () => {
  it('exactement 61 azimuts au pas de 3°, de azimut-90 à azimut+90', () => {
    const az = 180;
    const faisceaux = genererFaisceauxAmplitude(az);
    expect(faisceaux).toHaveLength(AMPLITUDE_BEAM_COUNT); // 61
    expect(faisceaux[0]).toBe(az - 90); // 90
    expect(faisceaux[faisceaux.length - 1]).toBe(az + 90); // 270
    for (let i = 1; i < faisceaux.length; i++) {
      expect(faisceaux[i] - faisceaux[i - 1]).toBe(AMPLITUDE_BEAM_STEP_DEG); // 3
    }
  });

  it('normalise dans [0, 360) (azimut Nord)', () => {
    const faisceaux = genererFaisceauxAmplitude(0);
    expect(faisceaux[0]).toBe(270); // 0 - 90 normalisé
    expect(faisceaux[faisceaux.length - 1]).toBe(90); // 0 + 90
    for (const a of faisceaux) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });
});

describe('geo — genererPointsAxe', () => {
  it('dernier point ~200 m, pas de 2 m', () => {
    const points = genererPointsAxe({ x: 0, y: 0 }, 0); // plein Nord
    const last = points[points.length - 1];
    expect(last.distance).toBe(ANALYSIS_RANGE_M); // 200
    expect(points[0].distance).toBe(0);
    expect(points[1].distance - points[0].distance).toBe(CORRIDOR_STEP_M); // 2
  });

  it('azimut Nord (0°) → déplacement le long de +y, x inchangé', () => {
    const points = genererPointsAxe({ x: 1000, y: 2000 }, 0);
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(1000, 9);
    expect(last.y).toBeCloseTo(2000 + ANALYSIS_RANGE_M, 9);
  });

  it('azimut Est (90°) → déplacement le long de +x, y inchangé', () => {
    const points = genererPointsAxe({ x: 1000, y: 2000 }, 90);
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(1000 + ANALYSIS_RANGE_M, 9);
    expect(last.y).toBeCloseTo(2000, 9);
  });
});
