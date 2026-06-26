// Préparateur paysage — moitié GÉOMÉTRIQUE de la Strate 2 (monuments).
// Fonction PURE, SYNCHRONE, sans DB. Réutilise geo.ts + monuments.ts sans rien réécrire.
import type { PointL93 } from "./geo";
import { azimutEntrePointsL93, distanceLambert93 } from "./geo";
import type { MonumentId } from "./contratIaPhoto";
import { MONUMENTS_L93, type MonumentL93 } from "./monuments";
import { AMPLITUDE_NOTE_HALF_ANGLE_DEG } from "./config";
import { genererFaisceauxAmplitude } from "./geo";
import { ANALYSIS_RANGE_M } from "./config";
import { query } from "../db/client";

/** Monument candidat (géométrie seule). `fractionVisible` (critère A) viendra de l'IA, pas ici. */
export type MonumentCandidatGeo = {
  id: MonumentId;
  distanceM: number;
  courbe: MonumentL93["courbe"];
  ecartDeg: number; // écart angulaire signé au cône, dans [-180, 180]. Convention boussole horaire (0=Nord, sens horaire) : >0 = monument à DROITE de l'axe principal, <0 = à GAUCHE, ≈0 = dans l'axe. Pour le repère gauche/droite du prompt IA (jamais utilisé par le scoring).
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
      retenus.push({ id: m.id, distanceM: distanceLambert93(origine, cible), courbe: m.courbe, ecartDeg: ecart });
    }
  }
  return retenus.sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * Strate 1 (géométrie) — compte les faisceaux du cône central ±AMPLITUDE_NOTE_HALF_ANGLE_DEG (60°)
 * dont la ligne (longueur ANALYSIS_RANGE_M, origine→portée) intersecte ≥1 couche valorisante
 * (bdtopo_eau_plan / bdtopo_eau_surface / bdtopo_vegetation). Origine DÉJÀ en L93 (pas de
 * ST_Transform), ligne NUE (pas de buffer).
 * AUCUN scoring, AUCUN garde-fou <3, pas de ×40 ni division : on rend les deux compteurs bruts
 * (le scoring reste le travail de calculerStrate1). Dénominateur = 41 (cône ±60°).
 * Pas d'exclusion du bâtiment d'origine : un faisceau touchant de la verdure près de la fenêtre compte.
 */
export async function compterFaisceauxValorisants(
  origine: PointL93,
  azimutPrincipalDeg: number,
): Promise<{ faisceauxValorisants: number; faisceauxConeTotal: number }> {
  const azimutsCone = genererFaisceauxAmplitude(azimutPrincipalDeg).filter((az) => {
    const offset = ((az - azimutPrincipalDeg + 540) % 360) - 180; // écart signé dans [-180, 180)
    return Math.abs(offset) <= AMPLITUDE_NOTE_HALF_ANGLE_DEG;
  });
  const faisceauxConeTotal = azimutsCone.length;

  const res = await query<{ valorisants: number | string }>(
    `WITH o AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 2154) AS g),
     beams AS (
       SELECT ST_MakeLine(
                o.g,
                ST_Translate(o.g, $3 * sin(radians(az)), $3 * cos(radians(az)))
              ) AS ln
       FROM o, unnest($4::float8[]) AS az
     )
     SELECT count(*) FILTER (WHERE
            EXISTS (SELECT 1 FROM bdtopo_eau_plan    e WHERE ST_Intersects(beams.ln, e.geom))
         OR EXISTS (SELECT 1 FROM bdtopo_eau_surface s WHERE ST_Intersects(beams.ln, s.geom))
         OR EXISTS (SELECT 1 FROM bdtopo_vegetation  v WHERE ST_Intersects(beams.ln, v.geom))
            ) AS valorisants
     FROM beams;`,
    [origine.x, origine.y, ANALYSIS_RANGE_M, azimutsCone],
  );
  const faisceauxValorisants = Number(res.rows[0].valorisants);
  return { faisceauxValorisants, faisceauxConeTotal };
}

/** Moitié GÉOMÉTRIQUE de la Famille 2 : Strate 1 (compteurs) + monuments candidats (sans IA). */
export type PaysageGeometrique = {
  faisceauxValorisants: number;
  faisceauxConeTotal: number;
  monuments: MonumentCandidatGeo[]; // candidats géométriques, SANS fractionVisible (vient de l'IA)
};

/**
 * Assemble la moitié géométrique de la Famille 2 : couverture valorisante (Strate 1, DB) +
 * monuments candidats dans le cône ±60° (Strate 2, pur). La moitié IA (photoExploitable,
 * fractionVisible des monuments, nuisances) est fusionnée plus tard (pièce C).
 * Ne branche RIEN dans le pipeline réel (pièce D).
 */
export async function preparerPaysageGeometrique(
  origine: PointL93,
  azimutPrincipalDeg: number,
): Promise<PaysageGeometrique> {
  const [strate1, monuments] = await Promise.all([
    compterFaisceauxValorisants(origine, azimutPrincipalDeg),
    Promise.resolve(monumentsDansCone(origine, azimutPrincipalDeg)),
  ]);
  return {
    faisceauxValorisants: strate1.faisceauxValorisants,
    faisceauxConeTotal: strate1.faisceauxConeTotal,
    monuments,
  };
}
