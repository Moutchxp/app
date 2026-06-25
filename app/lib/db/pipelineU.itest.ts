/**
 * Test d'intégration — RÉGRESSION « immeuble en U » introduite par le snap d'origine.
 *
 * ⚠️ CE TEST EST ATTENDU ROUGE tant que le correctif U (U2) n'est pas appliqué. C'est un filet.
 *
 * Bug : depuis que le pipeline recale l'origine sur la bordure du polygone (S2 : point snappé
 * passé à obstaclesSurAxe), l'axe de visée démarre SUR la frontière → profilOrigineAxe.dansOrigine
 * (ST_Contains strict, obstacles.ts) = false dès la 1ʳᵉ cellule → l'automate detecterAileOpposeeUSurAxe
 * passe DEPART→SORTI sans mémoriser altDepartM → return null (obstacles.ts) → l'aile opposée du U
 * n'est plus détectée comme obstacle.
 *
 * Fixture : bdtopo_batiment 613667 (BATIMENT0000000241399982), vrai U concave couvert LiDAR.
 * Origine BRUTE intérieure près de la façade de cour, azimut 15° (vers la cour / l'aile opposée).
 *   - AVANT snap (origine intérieure) : l'aile opposée est le 1er obstacle à ≈ 4,5 m (LIDAR_HD).
 *   - APRÈS snap (pipeline actuel)    : aile manquée → 1er obstacle = un voisin à ≈ 32,96 m.
 * Le verdict reste VIS_A_VIS dans les deux cas (voisin < 40 m), donc on N'ASSERTE PAS le verdict :
 * on assert la distanceM retenue (≈ 4,5 m) — discriminante (4,5 vs 32,96). Vert une fois U2 fait.
 *
 * Lancé via `npm run test:integration` (motif *.itest.ts) ; exclu du `npm test` unitaire.
 */
import { describe, it, expect, afterAll } from "vitest";
import { analyserAdresse } from "./pipeline";
import { closePool } from "./client";

afterAll(async () => {
  await closePool();
});

describe("analyserAdresse — immeuble en U (régression snap d'origine, 613667)", () => {
  it("aile opposée du U = 1er obstacle à ≈ 4,5 m (ROUGE tant que U2 absent : observe ≈ 32,96 m)", async () => {
    const { resultat } = await analyserAdresse({
      point: { lat: 48.904887895281355, lon: 2.2713510243240176 },
      azimutPrincipalDeg: 15,
      etage: 0,
      dernierEtage: false,
    });

    expect(resultat).not.toBeNull();
    const d = resultat!.verdict.distanceM;

    // ASSERTION PRINCIPALE (rouge aujourd'hui) : l'aile opposée du U (re-entrée même polygone)
    // doit être le 1er obstacle, à ≈ 4,5 m (± ~1 m). Aujourd'hui le snap la fait disparaître → d ≈ 32,96 m.
    expect(d).toBeGreaterThan(3.5);
    expect(d).toBeLessThan(5.5);

    // L'obstacle provient bien du LiDAR (détection géométrique de l'aile opposée).
    expect(resultat!.verdict.obstacle?.source).toBe("LIDAR_HD");
  });
});
