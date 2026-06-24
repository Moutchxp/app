/**
 * Test d'intégration — compterFaisceauxValorisants (vraie connexion PostGIS).
 *
 * Couches valorisantes BD TOPO (bdtopo_eau_* / bdtopo_vegetation, dépt 92). Lancé uniquement
 * via `npm run test:integration` (motif *.itest.ts) ; exclu du `npm test` unitaire.
 * On n'assert JAMAIS une égalité à 0 (couverture limitée au 92 + densité variable) : seulement
 * un cas connu > 0 et des invariants [0, total], total === 41 (cône ±60°).
 */
import { describe, it, expect, afterAll } from "vitest";
import { compterFaisceauxValorisants } from "./preparateurPaysage";
import { genererFaisceauxAmplitude } from "./geo";
import { AMPLITUDE_NOTE_HALF_ANGLE_DEG } from "./config";
import { closePool } from "../db/client";

afterAll(async () => {
  await closePool();
});

// Recompute indépendant du cône ±60° (source de vérité du dénominateur attendu).
function tailleCone(azimutPrincipalDeg: number): number {
  return genererFaisceauxAmplitude(azimutPrincipalDeg).filter((az) => {
    const offset = ((az - azimutPrincipalDeg + 540) % 360) - 180;
    return Math.abs(offset) <= AMPLITUDE_NOTE_HALF_ANGLE_DEG;
  }).length;
}

const BOULOGNE_SEINE = { x: 645050.3, y: 6858819.4 }; // Rue de Seine, Boulogne-Billancourt (L93, dans 92)

describe("compterFaisceauxValorisants — Boulogne / Rue de Seine", () => {
  it("azimut 90 (vers la Seine/végétation) → valorisants > 0, cône = 41", async () => {
    const az = 90;
    const r = await compterFaisceauxValorisants(BOULOGNE_SEINE, az);
    console.log(`[A3b] Boulogne/Seine azimut ${az} → valorisants ${r.faisceauxValorisants}/${r.faisceauxConeTotal}`);

    expect(r.faisceauxConeTotal).toBe(41);
    expect(r.faisceauxConeTotal).toBe(tailleCone(az)); // == longueur recalculée du cône
    expect(r.faisceauxValorisants).toBeGreaterThan(0);
    expect(r.faisceauxValorisants).toBeLessThanOrEqual(r.faisceauxConeTotal);
    expect(r.faisceauxValorisants).toBeGreaterThanOrEqual(0);
  });

  it("azimut 315 (opposé à la Seine) → invariants seulement (peut valoir 0)", async () => {
    const az = 315;
    const r = await compterFaisceauxValorisants(BOULOGNE_SEINE, az);
    console.log(`[A3b] Boulogne/Seine azimut ${az} → valorisants ${r.faisceauxValorisants}/${r.faisceauxConeTotal}`);

    expect(r.faisceauxConeTotal).toBe(41);
    expect(r.faisceauxValorisants).toBeGreaterThanOrEqual(0);
    expect(r.faisceauxValorisants).toBeLessThanOrEqual(r.faisceauxConeTotal);
  });
});
