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

describe("validerOrigine — mode de saisie (semi_auto vs manuel)", () => {
  it("A — manuel : point intérieur valide, NON snappé (≠ semi_auto)", async () => {
    const man = await validerOrigine(INTERIEUR, "manuel");
    const semi = await validerOrigine(INTERIEUR, "semi_auto");
    expect(man.valide).toBe(true);
    expect(semi.valide).toBe(true);
    expect(man.pointSnappeL93).not.toBeNull();
    expect(semi.pointSnappeL93).not.toBeNull();
    // semi_auto recale sur la bordure (~3,9 m du brut) ; manuel garde le point tel quel → écart franc.
    const ecart = Math.hypot(
      man.pointSnappeL93!.x - semi.pointSnappeL93!.x,
      man.pointSnappeL93!.y - semi.pointSnappeL93!.y,
    );
    expect(ecart).toBeGreaterThan(1);
  });

  it("B — manuel : point hors bâtiment (>1 m) → INDÉTERMINÉ (valide=false)", async () => {
    const v = await validerOrigine(DEHORS_LOIN, "manuel");
    expect(v.valide).toBe(false);
  });

  it("bonus — point à ≤ 1 m dehors : semi_auto valide (snappé), manuel invalide (pas de tolérance)", async () => {
    const semi = await validerOrigine(DEHORS_PROCHE, "semi_auto");
    const man = await validerOrigine(DEHORS_PROCHE, "manuel");
    expect(semi.valide).toBe(true);
    expect(man.valide).toBe(false);
  });
});
