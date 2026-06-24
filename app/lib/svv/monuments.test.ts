import { describe, it, expect } from "vitest";
import { MONUMENTS_L93 } from "./monuments";
import type { MonumentId } from "./contratIaPhoto";

// Miroir runtime de l'union MonumentId (une union de types n'est pas énumérable à l'exécution).
const IDS_ATTENDUS: MonumentId[] = [
  "EIFFEL", "SACRE_COEUR", "NOTRE_DAME", "ARC_TRIOMPHE", "LOUVRE",
  "PANTHEON", "INVALIDES", "OPERA_GARNIER", "CONCIERGERIE_SAINTE_CHAPELLE",
  "TOUR_SAINT_JACQUES", "POMPIDOU", "GRAND_PALAIS", "SAINT_DENIS", "VERSAILLES",
];

describe("MONUMENTS_L93 — structure", () => {
  it("contient exactement 14 entrées", () => {
    expect(MONUMENTS_L93).toHaveLength(14);
  });

  it("aucun id en double", () => {
    const ids = MONUMENTS_L93.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ensemble des ids == union MonumentId (aucun manquant, aucun en trop)", () => {
    const ids = new Set(MONUMENTS_L93.map((m) => m.id));
    expect(ids).toEqual(new Set(IDS_ATTENDUS));
  });

  it("chaque courbe ∈ {EIFFEL, SACRE_COEUR, AUTRES}", () => {
    for (const m of MONUMENTS_L93) {
      expect(["EIFFEL", "SACRE_COEUR", "AUTRES"]).toContain(m.courbe);
    }
  });

  it("garde-fou unités L93 : X ∈ [600000,700000], Y ∈ [6800000,6900000]", () => {
    for (const m of MONUMENTS_L93) {
      expect(m.X_L93).toBeGreaterThanOrEqual(600000);
      expect(m.X_L93).toBeLessThanOrEqual(700000);
      expect(m.Y_L93).toBeGreaterThanOrEqual(6800000);
      expect(m.Y_L93).toBeLessThanOrEqual(6900000);
    }
  });
});
