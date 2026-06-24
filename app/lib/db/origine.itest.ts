/**
 * Test d'intégration — validerOrigine (snap sur bordure, vraie connexion PostGIS).
 *
 * Lancé uniquement via `npm run test:integration` (motif *.itest.ts). Points réels du 92
 * (bdtopo_batiment) ; on teste les invariants du snap, pas des flottants exacts.
 */
import { describe, it, expect, afterAll } from "vitest";
import { validerOrigine } from "./origine";
import { closePool } from "./client";

afterAll(async () => {
  await closePool();
});

// Denfert (golden) : strictement à l'intérieur, ~3,89 m de la bordure.
const INTERIEUR = { lat: 48.90693182287072, lon: 2.269431435588249 };
// ~0,35 m à l'extérieur de la même emprise (≤ 1 m).
const DEHORS_PROCHE = { lat: 48.90691999377029, lon: 2.2694886218362837 };
// Point « rue » du golden négatif : ~8,5 m du bâtiment le plus proche (> 1 m).
const DEHORS_LOIN = { lat: 48.907093686290544, lon: 2.2694291636998782 };

describe("validerOrigine — snap sur bordure", () => {
  it("point intérieur → valide, dansBatiment, point snappé présent (L93 + WGS84)", async () => {
    const v = await validerOrigine(INTERIEUR);
    expect(v.valide).toBe(true);
    expect(v.dansBatiment).toBe(true);
    expect(v.pointSnappeL93).not.toBeNull();
    expect(v.pointSnappeWgs84).not.toBeNull();
    expect(typeof v.pointSnappeL93!.x).toBe("number");
    expect(typeof v.pointSnappeWgs84!.lat).toBe("number");
  });

  it("point extérieur ≤ 1 m → valide, snappé, dansBatiment=false, distance ∈ ]0,1]", async () => {
    const v = await validerOrigine(DEHORS_PROCHE);
    expect(v.valide).toBe(true);
    expect(v.dansBatiment).toBe(false);
    expect(v.pointSnappeL93).not.toBeNull();
    expect(v.distanceAuBatimentM).toBeGreaterThan(0);
    expect(v.distanceAuBatimentM).toBeLessThanOrEqual(1);
  });

  it("point extérieur > 1 m → invalide (hors bâtiment), pas de snap, distance finie > 1", async () => {
    const v = await validerOrigine(DEHORS_LOIN);
    expect(v.valide).toBe(false);
    expect(v.pointSnappeL93).toBeNull();
    expect(v.pointSnappeWgs84).toBeNull();
    expect(Number.isFinite(v.distanceAuBatimentM)).toBe(true);
    expect(v.distanceAuBatimentM).toBeGreaterThan(1);
  });

  it("le point snappé est validable (piège ST_Contains réglé via ST_Covers) et ~sur la frontière", async () => {
    const v = await validerOrigine(INTERIEUR);
    const reval = await validerOrigine(v.pointSnappeWgs84!);
    expect(reval.valide).toBe(true); // un point sur la bordure passe la validation
    expect(reval.distanceAuBatimentM).toBeLessThan(0.05); // sur/à ras la frontière
  });
});
