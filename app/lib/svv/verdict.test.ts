import { describe, it, expect } from 'vitest';
import { premierObstacle, type ObstacleCandidat } from './verdict';
import { altitudeFenetre } from './config';

// Vecteur de référence SPEC_module_hauteurs_v3.md §9 :
// fenêtre 4e étage, terrain 41 m → 41 + (4 × 2.90 + 1.65) = 54.25 m.
const ALTITUDE_FENETRE = altitudeFenetre(41, 4);

describe('premierObstacle — vecteur de référence A/B/C/D', () => {
  it('C (55 m / sommet 56) est le 1er obstacle réel ≥ 40 m → SANS_VIS_A_VIS', () => {
    expect(ALTITUDE_FENETRE).toBe(54.25);
    const candidats: ObstacleCandidat[] = [
      { distanceM: 18, altitudeSommetM: 48, source: 'BD_TOPO' }, // A — sous fenêtre
      { distanceM: 32, altitudeSommetM: 50, source: 'BD_TOPO' }, // B — sous fenêtre
      { distanceM: 55, altitudeSommetM: 56, source: 'LIDAR_HD' }, // C — obstacle réel
      { distanceM: 95, altitudeSommetM: 59, source: 'LIDAR_HD' }, // D — jamais atteint
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBe(55);
    expect(r.obstacle).toEqual(candidats[2]);
  });
});

describe('premierObstacle — VIS_A_VIS', () => {
  it('obstacle réel (sommet ≥ fenêtre) à < 40 m → VIS_A_VIS', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 25, altitudeSommetM: 60, source: 'LIDAR_HD' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('VIS_A_VIS');
    expect(r.distanceM).toBe(25);
    expect(r.obstacle).toEqual(candidats[0]);
  });

  it('au seuil exact (40 m) → SANS_VIS_A_VIS (≥)', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 40, altitudeSommetM: 60, source: 'LIDAR_HD' },
    ];
    expect(premierObstacle(candidats, ALTITUDE_FENETRE).verdict).toBe('SANS_VIS_A_VIS');
  });
});

describe('premierObstacle — bâtiment plus bas que la fenêtre', () => {
  it('sommet < fenêtre n’est pas un obstacle, on continue', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 10, altitudeSommetM: 50, source: 'BD_TOPO' }, // sous fenêtre, proche
      { distanceM: 80, altitudeSommetM: 56, source: 'LIDAR_HD' }, // 1er obstacle réel
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBe(80);
  });

  it('uniquement des bâtiments sous la fenêtre → SANS_VIS_A_VIS (rien retenu)', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 10, altitudeSommetM: 50, source: 'BD_TOPO' },
      { distanceM: 30, altitudeSommetM: 52, source: 'BD_TOPO' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBeNull();
    expect(r.obstacle).toBeNull();
  });
});

describe('premierObstacle — règle INDÉTERMINÉ (SPEC §6)', () => {
  it('hauteur inconnue (NONE) à < 40 m avant tout obstacle confirmé → INDETERMINE', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 20, altitudeSommetM: null, source: 'NONE' },
      { distanceM: 60, altitudeSommetM: 70, source: 'LIDAR_HD' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('INDETERMINE');
    expect(r.distanceM).toBe(20);
    expect(r.obstacle?.source).toBe('NONE');
  });

  it('NONE à ≥ 40 m ne déclenche PAS INDETERMINE (continue → SANS_VIS_A_VIS)', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 50, altitudeSommetM: null, source: 'NONE' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBeNull();
  });

  it('obstacle réel confirmé AVANT un NONE < 40 m → tranche normalement (pas INDETERMINE)', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 15, altitudeSommetM: 60, source: 'LIDAR_HD' }, // obstacle réel proche
      { distanceM: 25, altitudeSommetM: null, source: 'NONE' }, // plus loin, ignoré
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('VIS_A_VIS');
    expect(r.distanceM).toBe(15);
  });
});

describe('premierObstacle — cas limites', () => {
  it('aucun candidat → SANS_VIS_A_VIS', () => {
    const r = premierObstacle([], ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBeNull();
    expect(r.obstacle).toBeNull();
  });

  it('candidats en désordre : le plus proche est évalué en premier', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 95, altitudeSommetM: 59, source: 'LIDAR_HD' }, // D
      { distanceM: 18, altitudeSommetM: 48, source: 'BD_TOPO' }, // A
      { distanceM: 55, altitudeSommetM: 56, source: 'LIDAR_HD' }, // C
      { distanceM: 32, altitudeSommetM: 50, source: 'BD_TOPO' }, // B
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBe(55); // C, malgré l'ordre d'entrée
  });

  it('NONE proche prioritaire sur un obstacle réel plus lointain (désordre)', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 60, altitudeSommetM: 70, source: 'LIDAR_HD' },
      { distanceM: 12, altitudeSommetM: null, source: 'NONE' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('INDETERMINE');
    expect(r.distanceM).toBe(12);
  });
});

describe('premierObstacle — analyse dégradée (axe principal, NONE ≥ 40 m)', () => {
  it('a) SANS_VIS_A_VIS + NONE ≥ 40 m AVANT l\'obstacle confirmé → dégradée', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 45, altitudeSommetM: null, source: 'NONE' }, // NONE ≥ 40, devant
      { distanceM: 80, altitudeSommetM: 60, source: 'LIDAR_HD' }, // obstacle confirmé
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBe(80); // verdict inchangé
    expect(r.analyseDegradee).toBe(true);
    expect(r.messageDegrade).toContain('45.00');
  });

  it('b) SANS_VIS_A_VIS vue dégagée + NONE à 50 m → dégradée', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 50, altitudeSommetM: null, source: 'NONE' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceM).toBeNull();
    expect(r.analyseDegradee).toBe(true);
    expect(r.messageDegrade).toContain('50.00');
  });

  it('c) SANS_VIS_A_VIS obstacle confirmé à 42 m + NONE à 45 m (DERRIÈRE) → non dégradée', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 42, altitudeSommetM: 60, source: 'LIDAR_HD' }, // confirmé
      { distanceM: 45, altitudeSommetM: null, source: 'NONE' }, // NONE caché derrière
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.analyseDegradee).toBe(false);
    expect(r.messageDegrade).toBeNull();
  });

  it('d) NONE à 25 m sans obstacle confirmé avant → INDETERMINE, non dégradée', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 25, altitudeSommetM: null, source: 'NONE' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('INDETERMINE'); // inchangé
    expect(r.analyseDegradee).toBe(false);
    expect(r.messageDegrade).toBeNull();
  });

  it('e) SANS_VIS_A_VIS sans aucun NONE → non dégradée', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 60, altitudeSommetM: 70, source: 'LIDAR_HD' },
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.analyseDegradee).toBe(false);
    expect(r.messageDegrade).toBeNull();
  });

  it('plusieurs NONE pertinents → mention « (et N autre(s)) » + plus petite distance', () => {
    const candidats: ObstacleCandidat[] = [
      { distanceM: 70, altitudeSommetM: null, source: 'NONE' },
      { distanceM: 55, altitudeSommetM: null, source: 'NONE' },
      { distanceM: 120, altitudeSommetM: 80, source: 'LIDAR_HD' }, // confirmé
    ];
    const r = premierObstacle(candidats, ALTITUDE_FENETRE);
    expect(r.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.analyseDegradee).toBe(true);
    expect(r.messageDegrade).toContain('55.00'); // plus petite distance
    expect(r.messageDegrade).toContain('(et 1 autre(s))');
  });
});
