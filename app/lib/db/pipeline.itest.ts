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

    // Score global figé (scorePartiel : aucune photo).
    expect(resultat!.score.total).toBeCloseTo(21.98744, 3);
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
});
