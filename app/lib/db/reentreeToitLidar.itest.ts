/**
 * 🔴 A′ — DÉCISION D'ARNO DU 22/10/2026 : une ré-entrée dans le propre bâtiment ne bloque un faisceau que si le toit LiDAR,
 * le long du rayon dans cette ré-entrée, atteint l'œil (distance d'arrêt = bord BD TOPO, inchangée).
 *
 * Cas réel : 19 rue Louis Ulbach, 92400 Courbevoie (banc de test). Étage 4, sous-plafond 2,50 m (vision 12,85 m), azimut
 * 229°, mode Façade. Le bâtiment de l'observateur est UN polygone BD TOPO (BATIMENT0000000241398721) à hauteur unique
 * (sol 44,7 + 25,4 = 70,1 m) ; son aile basse a un toit LiDAR ≈ 47,5 m (≈ 3 m au-dessus du sol), sous l'œil (≈ 56,8 m).
 *
 *   · −63°, −60°, −57° : coupés à 8,4–8,7 m par l'aile basse AVANT A′ → libérés (le LiDAR y reste sous l'œil) ;
 *   · −69°, −66° : la ré-entrée longe la jonction avec la partie haute, le toit LiDAR y atteint l'œil (61,7 m au bord
 *     pour −69°) → toujours arrêtés, au même bord BD TOPO ;
 *   · −54° à −30° : décrochement de façade de 0,64 m (partie HAUTE, toit LiDAR ≈ 69,7 m) → toujours arrêtés à 0,5–0,8 m
 *     (option D refusée par Arno : c'est un vrai mur ; règle du 14/10 inchangée).
 *
 * LECTURE SEULE (aucune écriture). Le golden (pipeline.itest.ts) et le cas en U (pipelineU.itest.ts) restent inchangés.
 * ⚠️ Seul le côté GAUCHE est éprouvé : dans la base de dev, le LiDAR s'arrête 5 m à l'ouest du point (x = 645 999,75) ;
 * côté droit, sans LiDAR, A′ garde le comportement d'avant.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { construireEntree } from './pipeline';
import { candidatReentreeOrigine } from './obstacles';
import { closePool } from './client';

afterAll(async () => { await closePool(); });

const PROPRE = 'BATIMENT0000000241398721';
const ULBACH = { point: { lat: 48.901908, lon: 2.263454 }, azimutPrincipalDeg: 229, etage: 4, hauteurSousPlafondM: 2.5, dernierEtage: false };

describe('🔴 A′ — 19 rue Louis Ulbach : l’aile basse du propre bâtiment ne coupe plus le regard', () => {
  it('−63°, −60°, −57° libérés ; −69°, −66° et −54° à −30° toujours arrêtés par le propre bâtiment', async () => {
    const { validation, entree } = await construireEntree(ULBACH);
    expect(validation.valide).toBe(true);
    expect(entree).not.toBeNull();
    const f = new Map(entree!.faisceaux.map((x) => [x.offsetDeg, x]));

    for (const off of [-63, -60, -57]) {
      expect(f.get(off)!.impactCleabs, `${off}°`).not.toBe(PROPRE);
      expect(f.get(off)!.distanceObstacleM ?? Infinity, `${off}°`).toBeGreaterThan(40);
    }
    expect(f.get(-69)!.impactCleabs).toBe(PROPRE);
    expect(f.get(-69)!.distanceObstacleM).toBeCloseTo(8.26291118139059, 6);
    expect(f.get(-66)!.impactCleabs).toBe(PROPRE);
    expect(f.get(-66)!.distanceObstacleM).toBeCloseTo(8.32445884523084, 6);
    for (let off = -54; off <= -30; off += 3) {
      expect(f.get(off)!.impactCleabs, `${off}°`).toBe(PROPRE);
      expect(f.get(off)!.distanceObstacleM!, `${off}°`).toBeGreaterThan(0.5);
      expect(f.get(off)!.distanceObstacleM!, `${off}°`).toBeLessThan(0.8);
    }
  });

  it('sans l’œil (appel de diagnostic) : la ré-entrée basse bloque comme avant ; avec l’œil : plus rien à −60°', async () => {
    const { validation } = await construireEntree(ULBACH);
    const base = {
      point: validation.pointSnappeWgs84!, azimutDeg: 229 - 60, batimentOrigineId: validation.batimentOrigine!.id,
      batimentOriginePolygoneWkt: validation.batimentOrigine!.polygoneWkt,
    };
    const avant = await candidatReentreeOrigine(base);
    expect(avant?.cleabs).toBe(PROPRE);
    expect(avant?.distanceM).toBeCloseTo(8.521232807898405, 6);
    expect(avant?.altitudeSommetM).toBe(70.1);
    const oeil = validation.altitudeTerrainOrigineM! + 12.85;
    expect(await candidatReentreeOrigine({ ...base, altitudeFenetreM: oeil })).toBeNull();
  });
});
