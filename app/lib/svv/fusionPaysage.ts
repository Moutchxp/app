// Fusion PURE géométrie + IA → EntreePaysage (Famille 2). Synchrone, aucun réseau, aucune DB.
// Branchée nulle part : assemble la moitié géométrique (preparerPaysageGeometrique) et la
// réponse IA (adaptateurIaPhoto) en l'entrée consommée par scorePaysage.
import type { MonumentCandidatGeo, PaysageGeometrique } from "./preparateurPaysage";
import type { MonumentCandidatFusionne, EntreePaysage } from "./entreePaysage";
import type { ReponseIaPhoto, MonumentVisible } from "./contratIaPhoto";

/**
 * INTERSECTION par id (Option B) : un monument n'est retenu que s'il est À LA FOIS candidat
 * géométrique ET présent dans la réponse IA. distanceM/courbe viennent TOUJOURS de la géométrie,
 * fractionVisible TOUJOURS de l'IA. ecartDeg n'est pas reporté (absent de MonumentCandidatFusionne).
 * Pas de dédup imposée côté géo ; les MonumentVisible sans candidat géo sont ignorés.
 */
export function fusionnerMonuments(
  geo: MonumentCandidatGeo[],
  ia: MonumentVisible[],
): MonumentCandidatFusionne[] {
  const parId = new Map<MonumentVisible["id"], MonumentVisible>();
  for (const m of ia) parId.set(m.id, m);

  const fusionnes: MonumentCandidatFusionne[] = [];
  for (const c of geo) {
    const vu = parId.get(c.id);
    if (!vu) continue; // candidat géo absent de l'IA → exclu (Option B)
    fusionnes.push({
      id: c.id,
      distanceM: c.distanceM, // géométrie
      courbe: c.courbe, // géométrie
      fractionVisible: vu.fractionVisible, // IA
    });
  }
  return fusionnes;
}

/**
 * Assemble l'EntreePaysage complète à partir de la moitié géométrique et de la réponse IA.
 * DÉFENSIF : si la photo est inexploitable, on vide monuments + nuisances (on ne fait pas confiance
 * aux listes IA). carrefour/cimetière restent false (aucune couche ne les produit, comme en phase 1).
 */
export function assemblerEntreePaysage(
  geo: PaysageGeometrique,
  ia: ReponseIaPhoto,
): EntreePaysage {
  const exploitable = ia.photoExploitable;
  return {
    photoExploitable: exploitable,
    faisceauxValorisants: geo.faisceauxValorisants,
    faisceauxConeTotal: geo.faisceauxConeTotal,
    monuments: exploitable ? fusionnerMonuments(geo.monuments, ia.monuments) : [],
    nuisancesMajeures: exploitable ? ia.nuisancesMajeures : [],
    nuisancesMineures: exploitable ? ia.nuisancesMineures : [],
    carrefourMajeur: false,
    cimetiere: false,
  };
}
