import { describe, it, expect } from "vitest";
import { monumentsDansCone } from "./preparateurPaysage";
import type { MonumentL93 } from "./monuments";
import type { MonumentId } from "./contratIaPhoto";

const O = { x: 0, y: 0 }; // origine (x = Est, y = Nord)

/** Monument synthétique aux coordonnées L93 exactes données. */
const mk = (id: MonumentId, X_L93: number, Y_L93: number): MonumentL93 => ({
  id,
  nom: id,
  X_L93,
  Y_L93,
  courbe: "AUTRES",
});

/** Coordonnées exactes d'un point à `azDeg` (0=Nord, horaire) et `distM` de l'origine. */
const coordsAt = (azDeg: number, distM: number) => {
  const r = (azDeg * Math.PI) / 180;
  return { X: distM * Math.sin(r), Y: distM * Math.cos(r) };
};

// Monument PLEIN EST = azimut 90° EXACT (coords cardinales {1000, 0}) → écart = 90 − axe, exact.
const EST = mk("EIFFEL", 1000, 0);

describe("monumentsDansCone", () => {
  it("axe 90 (Est), monument plein Est → retenu, distanceM = 1000", () => {
    const r = monumentsDansCone(O, 90, [EST]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("EIFFEL");
    expect(r[0].distanceM).toBe(1000);
    expect(r[0].courbe).toBe("AUTRES");
  });

  it("monument à exactement +60° de l'axe → RETENU (borne inclusive)", () => {
    // monument plein Est (az 90), axe 30 → écart = +60 exact
    expect(monumentsDansCone(O, 30, [EST])).toHaveLength(1);
  });

  it("monument à +61° de l'axe → EXCLU", () => {
    // monument plein Est (az 90), axe 29 → écart = +61 exact
    expect(monumentsDansCone(O, 29, [EST])).toHaveLength(0);
  });

  it("monument à −60° de l'axe → RETENU (borne inclusive, autre flanc)", () => {
    // monument plein Est (az 90), axe 150 → écart = −60 exact
    expect(monumentsDansCone(O, 150, [EST])).toHaveLength(1);
  });

  it("WRAPAROUND : axe 10, monument à azimut 350 (écart −20°) → RETENU", () => {
    const c = coordsAt(350, 1000);
    const m = mk("LOUVRE", c.X, c.Y);
    expect(monumentsDansCone(O, 10, [m])).toHaveLength(1);
  });

  it("WRAPAROUND : axe 350, monument à azimut 51 (écart +61°) → EXCLU", () => {
    const c = coordsAt(51, 1000);
    const m = mk("LOUVRE", c.X, c.Y);
    expect(monumentsDansCone(O, 350, [m])).toHaveLength(0);
  });

  it("tri par distance croissante", () => {
    const proche = mk("LOUVRE", 1000, 0); // az 90, dist 1000
    const loin = mk("EIFFEL", 2000, 0); // az 90, dist 2000
    const r = monumentsDansCone(O, 90, [loin, proche]); // entrée volontairement désordonnée
    expect(r.map((x) => x.id)).toEqual(["LOUVRE", "EIFFEL"]);
    expect(r.map((x) => x.distanceM)).toEqual([1000, 2000]);
  });

  it("liste vide → []", () => {
    expect(monumentsDansCone(O, 90, [])).toEqual([]);
  });
});
