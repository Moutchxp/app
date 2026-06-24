/**
 * Test d'intégration golden — pipeline d'analyse Sans Vis-à-Vis® (vraie connexion PostGIS).
 *
 * Valeurs figées sur les rasters LiDAR locaux (mns_lidar_brut / mnt_lidar_brut /
 * bdtopo_batiment) ; à recalibrer si ces données changent.
 *
 * Lancé uniquement via `npm run test:integration` (motif *.itest.ts) ; exclu du
 * `npm test` unitaire (include *.test.ts dans vitest.config.ts).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { analyserAdresse } from './pipeline';
import { closePool } from './client';

afterAll(async () => {
  await closePool();
});

describe('analyserAdresse — golden 8 rue Denfert-Rochereau (Asnières)', () => {
  it('cas POSITIF : point intérieur → SANS_VIS_A_VIS, terrain MNT, obstacle LiDAR', async () => {
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.90693182287072, lon: 2.269431435588249 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
    });

    // Origine validée + terrain lu sur le MNT (≈ 41.590, distinct du 41.6 BD TOPO informatif).
    expect(validation.valide).toBe(true);
    expect(validation.altitudeTerrainOrigineM).toBeCloseTo(41.590, 2);

    // Verdict géométrique figé.
    expect(resultat).not.toBeNull();
    expect(resultat!.verdict.verdict).toBe('SANS_VIS_A_VIS');
    expect(resultat!.verdict.distanceM).toBeCloseTo(44.256, 2);
    expect(resultat!.verdict.obstacle?.source).toBe('LIDAR_HD');

    // Score global figé (scorePartiel : aucune photo). Re-figé après la note d'amplitude
    // restreinte au cône central ±60° (ancien : 21.98744).
    expect(resultat!.score.total).toBeCloseTo(11.856674080665506, 3);
  });

  it('cas NÉGATIF : point « rue » hors emprise → valide=false, resultat=null (HORS_BATIMENT)', async () => {
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.907093686290544, lon: 2.2694291636998782 },
      azimutPrincipalDeg: 90,
      etage: 2,
      dernierEtage: false,
    });

    expect(validation.valide).toBe(false);
    expect(resultat).toBeNull();
    // ValidationOrigine n'expose PAS de champ `statut` (dérivé uniquement dans /api/origine).
    // Sémantique HORS_BATIMENT = invalide MAIS un bâtiment existe à proximité
    // → distance finie (≠ Infinity, qui signalerait SANS_BATIMENT).
    expect(Number.isFinite(validation.distanceAuBatimentM)).toBe(true);
  });

  it('cas INDÉTERMINÉ : couloir sortant de la couverture LiDAR avant 40 m → INDETERMINE', async () => {
    // Origine couverte (MNS+MNT) dans bdtopo_batiment 486669, à ~2,2 m du bord Nord des dalles ;
    // couloir plein Nord → sort de la couverture à 2,20 m → < 6 lignes couvertes → aucune fenêtre
    // d'obstacle possible → trou de données < 40 m avant tout obstacle → INDÉTERMINÉ.
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.90977883617502, lon: 2.274351016683915 },
      azimutPrincipalDeg: 0,
      etage: 0,
      dernierEtage: false,
    });

    // L'origine est VALIDE (terrain MNT lu) : l'INDÉTERMINÉ vient du couloir, pas de l'origine.
    expect(validation.valide).toBe(true);
    expect(validation.altitudeTerrainOrigineM).not.toBeNull();

    expect(resultat).not.toBeNull();
    expect(resultat!.verdict.verdict).toBe('INDETERMINE');
    // distanceM = 0 : sentinelle du mapping INDETERMINE (obstaclesParBalayage → premierObstacle).
    expect(resultat!.verdict.distanceM).toBe(0);
  });
});
