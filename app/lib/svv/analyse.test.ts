import { describe, it, expect } from 'vitest';
import { analyser, type EntreeComplete } from './analyse';
import type { FaisceauResultat } from './scoreDegagement';
import type { EntreePaysage } from './entreePaysage';
import type { ObstacleCandidat } from './verdict';
import { AMPLITUDE_BEAM_COUNT, altitudeFenetre } from './config';

const ALTITUDE_FENETRE = altitudeFenetre(41, 4); // 54.25 m

const faisceauxDegages: FaisceauResultat[] = Array.from(
  { length: AMPLITUDE_BEAM_COUNT },
  () => ({ offsetDeg: 0, distanceObstacleM: null }),
);

/** EntreePaysage neutre (nouveau modèle) — aucune Famille 2 (F2 = 0). */
const paysageNeutre: EntreePaysage = {
  photoExploitable: false,
  faisceauxValorisants: 0,
  faisceauxConeTotal: 0,
  monuments: [],
  nuisancesMajeures: [],
  nuisancesMineures: [],
  carrefourMajeur: false,
  cimetiere: false,
};

/** EntreePaysage « parfaite » : Strate1 40 (41/41) + Strate2 10 (EIFFEL pleine note) = F2 50. */
const paysageParfait: EntreePaysage = {
  photoExploitable: true,
  faisceauxValorisants: 41,
  faisceauxConeTotal: 41,
  monuments: [
    { id: 'EIFFEL', distanceM: 0, courbe: 'EIFFEL', fractionVisible: 'PLUS_DES_TROIS_QUARTS' },
  ],
  nuisancesMajeures: [],
  nuisancesMineures: [],
  carrefourMajeur: false,
  cimetiere: false,
};

function entree(over: Partial<EntreeComplete> = {}): EntreeComplete {
  return {
    altitudeFenetreM: ALTITUDE_FENETRE,
    orientationAzimutDeg: 180, // Sud
    dernierEtage: true,
    obstaclesAxePrincipal: [],
    faisceaux: faisceauxDegages,
    paysage: paysageNeutre,
    ...over,
  };
}

describe('analyser — vue parfaite', () => {
  it('aucun obstacle + tout dégagé → SANS_VIS_A_VIS & 80/EXCEPTIONNELLE (note Couche 1 plafond)', () => {
    const r = analyser(entree({ obstaclesAxePrincipal: [], paysage: paysageParfait }));
    expect(r.verdict.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.distanceAxePrincipalM).toBeNull();
    // Score = note Couche 1 /80 : 61 faisceaux dégagés → perçue 200 chacun → note plafond 80.
    // (paysage f2 conservé pour audit mais NON ajouté ; Couche 2 Exception non implémentée.)
    expect(r.score.total).toBe(80);
    expect(r.score.libelle).toBe('EXCEPTIONNELLE');
  });
});

describe('analyser — vis-à-vis', () => {
  it('obstacle confirmé < 40 m → VIS_A_VIS, score calculé indépendamment (non nul)', () => {
    const obstacles: ObstacleCandidat[] = [
      { distanceM: 25, altitudeSommetM: 60, source: 'LIDAR_HD' },
    ];
    const r = analyser(
      entree({
        obstaclesAxePrincipal: obstacles,
        paysage: {
          photoExploitable: true,
          faisceauxValorisants: 20,
          faisceauxConeTotal: 41,
          monuments: [],
          nuisancesMajeures: [],
          nuisancesMineures: [],
          carrefourMajeur: false,
          cimetiere: false,
        },
      }),
    );
    expect(r.verdict.verdict).toBe('VIS_A_VIS');
    expect(r.distanceAxePrincipalM).toBe(25);
    expect(r.score.total).toBeGreaterThan(0);
    expect(r.score.famille2.total).toBeGreaterThan(0);
  });
});

describe('analyser — indéterminé', () => {
  it('bâtiment NONE < 40 m → INDETERMINE, score quand même calculé', () => {
    const obstacles: ObstacleCandidat[] = [
      { distanceM: 20, altitudeSommetM: null, source: 'NONE' },
    ];
    const r = analyser(entree({ obstaclesAxePrincipal: obstacles }));
    expect(r.verdict.verdict).toBe('INDETERMINE');
    // NONE non compté pour le sous-score distance → distance = null (aucun confirmé)
    expect(r.distanceAxePrincipalM).toBeNull();
    expect(r.score.total).toBeGreaterThan(0);
  });
});

describe('analyser — DÉCOUPLAGE verdict ↔ score', () => {
  it('paysage identique + verdicts différents → Famille 2 identique', () => {
    const sansObstacle = analyser(entree({ obstaclesAxePrincipal: [] }));
    const avecVisAVis = analyser(
      entree({ obstaclesAxePrincipal: [{ distanceM: 10, altitudeSommetM: 80, source: 'LIDAR_HD' }] }),
    );
    expect(sansObstacle.verdict.verdict).toBe('SANS_VIS_A_VIS');
    expect(avecVisAVis.verdict.verdict).toBe('VIS_A_VIS');
    // Le sous-score paysage ne dépend QUE du paysage, pas du verdict.
    expect(avecVisAVis.score.famille2).toEqual(sansObstacle.score.famille2);
  });

  it('un excellent score ne change jamais le verdict (obstacle proche → VIS_A_VIS)', () => {
    const r = analyser(
      entree({
        paysage: paysageParfait, // Famille 2 = 50
        obstaclesAxePrincipal: [{ distanceM: 5, altitudeSommetM: 90, source: 'LIDAR_HD' }],
      }),
    );
    expect(r.score.famille2.total).toBe(50);
    expect(r.verdict.verdict).toBe('VIS_A_VIS'); // la beauté ne sauve pas le label
  });
});

describe('analyser — distanceAxePrincipalM (obstacle confirmé)', () => {
  it('NONE plus proche qu’un confirmé → distance = celle du confirmé', () => {
    const obstacles: ObstacleCandidat[] = [
      { distanceM: 30, altitudeSommetM: null, source: 'NONE' }, // inconnu, plus proche
      { distanceM: 80, altitudeSommetM: 60, source: 'LIDAR_HD' }, // confirmé (≥ fenêtre)
    ];
    const r = analyser(entree({ obstaclesAxePrincipal: obstacles }));
    // verdict : NONE < 40 m rencontré avant le confirmé → INDETERMINE
    expect(r.verdict.verdict).toBe('INDETERMINE');
    // sous-score distance : on retient le confirmé (80 m), pas le NONE
    expect(r.distanceAxePrincipalM).toBe(80);
  });

  it('bâtiment sous la fenêtre ignoré pour la distance, confirmé plus loin retenu', () => {
    const obstacles: ObstacleCandidat[] = [
      { distanceM: 15, altitudeSommetM: 50, source: 'BD_TOPO' }, // sous fenêtre
      { distanceM: 90, altitudeSommetM: 56, source: 'LIDAR_HD' }, // confirmé
    ];
    const r = analyser(entree({ obstaclesAxePrincipal: obstacles }));
    expect(r.distanceAxePrincipalM).toBe(90);
  });
});

describe('analyser — photo partielle', () => {
  it('paysage.photoExploitable=false → score partiel, verdict inchangé', () => {
    const r = analyser(
      entree({
        paysage: paysageNeutre, // photoExploitable:false → score partiel
        obstaclesAxePrincipal: [], // dégagement → SANS_VIS_A_VIS
      }),
    );
    expect(r.score.scorePartiel).toBe(true);
    expect(r.score.libelle).toBeNull();
    expect(r.verdict.verdict).toBe('SANS_VIS_A_VIS');
  });
});
