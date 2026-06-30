/**
 * Résultat B / Couche 1 — note de dégagement /80 (distances PERÇUES boostées par famille).
 *
 * Module Bloc A PUR : aucun accès DB, aucune IA, déterministe et testable. Consomme des
 * `FaisceauResultat` DÉJÀ enrichis (impactNature, natureTraverseeM, impactAncien) + un profil.
 *
 * NON BRANCHÉ : aucun appelant du pipeline ne l'utilise → n'affecte NI le verdict NI le
 * Résultat A. Toute la pondération est externalisée dans `profilDegagement.ts`. Aucun arrondi.
 */
import type { FaisceauResultat } from './scoreDegagement';
import type { ProfilDegagement } from './profilDegagement';

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/**
 * Distance PERÇUE d'un faisceau (m) selon la/les famille(s) déclenchée(s) et le profil.
 *
 * - F1 (toujours) : base factuelle = min(distanceObstacleM ?? distanceMaxM, distanceMaxM).
 * - F2 (impactAncien && distanceObstacleM != null) : min(distance × (1 + boostF2), distanceMaxM).
 * - F3 (impactNature ∈ naturesRemarquables) : forfait coneCentral / extremites (peut dépasser distanceMaxM).
 * - F4 (natureTraverseeM > 0) : min(longueur × (1 + boostF4), distanceMaxM).
 *
 * F1 étant toujours déclenchée, le résultat ne descend jamais sous la base factuelle.
 */
export function distancePercueFaisceau(f: FaisceauResultat, profil: ProfilDegagement): number {
  const { distanceMaxM } = profil;

  // F1 — base factuelle (toujours déclenchée) : distance réelle bornée à la portée.
  const base = Math.min(f.distanceObstacleM ?? distanceMaxM, distanceMaxM);
  const candidates: number[] = [base];

  // F2 — bâti avant 1900 : nécessite une distance d'impact réelle.
  if (f.impactAncien === true && f.distanceObstacleM != null) {
    candidates.push(Math.min(f.distanceObstacleM * (1 + profil.boostF2), distanceMaxM));
  }

  // F3 — monument remarquable : forfait selon position (cône central / extrémités), distance ignorée.
  if (f.impactNature != null && profil.naturesRemarquables.includes(f.impactNature)) {
    candidates.push(
      Math.abs(f.offsetDeg) <= profil.coneF3DemiAngleDeg
        ? profil.forfaitConeCentral
        : profil.forfaitExtremites,
    );
  }

  // F4 — nature traversée : longueur boostée, bornée à la portée.
  if (f.natureTraverseeM != null && f.natureTraverseeM > 0) {
    candidates.push(Math.min(f.natureTraverseeM * (1 + profil.boostF4), distanceMaxM));
  }

  switch (profil.modeCombinaison) {
    case 'max':
      return Math.max(...candidates);
    case 'addition': {
      // (NON activé) base + somme des gains de chaque famille déclenchée, borné à la portée.
      const gains = candidates.slice(1).reduce((acc, c) => acc + Math.max(0, c - base), 0);
      return Math.min(base + gains, distanceMaxM);
    }
    case 'sequentiel':
      // (NON activé) sémantique à fixer en calibration (boosts en chaîne) ; repli sûr sur le max.
      return Math.max(...candidates);
    default:
      return Math.max(...candidates);
  }
}

/**
 * Note de dégagement /plafondCouche1 : moyenne des distances perçues normalisée par la portée.
 * Liste vide → 0. Résultat clampé [0, plafondCouche1].
 */
export function noteDegagement(faisceaux: FaisceauResultat[], profil: ProfilDegagement): number {
  if (faisceaux.length === 0) return 0;
  const moyenne =
    faisceaux.reduce((acc, f) => acc + distancePercueFaisceau(f, profil), 0) / faisceaux.length;
  const note = (moyenne / profil.distanceMaxM) * profil.plafondCouche1;
  return clamp(note, 0, profil.plafondCouche1);
}
