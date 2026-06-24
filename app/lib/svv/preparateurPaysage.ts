// Préparateur paysage — moitié GÉOMÉTRIQUE de la Strate 2 (monuments).
// Fonction PURE, SYNCHRONE, sans DB. Réutilise geo.ts + monuments.ts sans rien réécrire.
import type { PointL93 } from "./geo";
import { azimutEntrePointsL93, distanceLambert93 } from "./geo";
import type { MonumentId } from "./contratIaPhoto";
import { MONUMENTS_L93, type MonumentL93 } from "./monuments";
import { AMPLITUDE_NOTE_HALF_ANGLE_DEG } from "./config";

/** Monument candidat (géométrie seule). `fractionVisible` (critère A) viendra de l'IA, pas ici. */
export type MonumentCandidatGeo = {
  id: MonumentId;
  distanceM: number;
  courbe: MonumentL93["courbe"];
};

/**
 * Monuments dont l'azimut origine→monument tombe dans le cône central
 * ±AMPLITUDE_NOTE_HALF_ANGLE_DEG (60°, borne INCLUSIVE) autour de l'azimut principal.
 * Convention : 0 = Nord, sens horaire ; écart signé ramené dans [-180, 180).
 * Renvoie { id, distanceM (L93), courbe } TRIÉS par distance croissante (déterminisme).
 * Spec Strate 2 : seul le cône filtre la candidature — pas de borne de distance, pas
 * d'occlusion ici (gérées par l'IA via fractionVisible).
 */
export function monumentsDansCone(
  origine: PointL93,
  azimutPrincipalDeg: number,
  monuments: readonly MonumentL93[] = MONUMENTS_L93,
): MonumentCandidatGeo[] {
  const retenus: MonumentCandidatGeo[] = [];
  for (const m of monuments) {
    const cible: PointL93 = { x: m.X_L93, y: m.Y_L93 };
    const az = azimutEntrePointsL93(origine, cible);
    const ecart = ((az - azimutPrincipalDeg + 540) % 360) - 180; // écart signé dans [-180, 180)
    if (Math.abs(ecart) <= AMPLITUDE_NOTE_HALF_ANGLE_DEG) {
      retenus.push({ id: m.id, distanceM: distanceLambert93(origine, cible), courbe: m.courbe });
    }
  }
  return retenus.sort((a, b) => a.distanceM - b.distanceM);
}
