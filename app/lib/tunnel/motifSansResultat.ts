/**
 * ══ POURQUOI UNE ANALYSE S'ARRÊTE SANS VERDICT (lot ZONE SANS LiDAR, 15/10/2026) ═════════════════════════════════════
 *
 * `analyserAdresse` rend `resultat: null` (aucun calcul, aucun score) dans deux cas, et un troisième s'y confondait :
 *  · `origine_invalide`     — le point n'est pas dans un bâtiment (ni à moins de 1 m) ;
 *  · `pas_de_lidar`         — le point est dans un bâtiment, mais AUCUNE dalle LiDAR (MNT) ne le couvre : zone sans
 *                             relevés aériens (zone interdite de survol, livraison IGN incomplète…). Déplacer le repère
 *                             n'y change rien ;
 *  · `altitude_indisponible` — une dalle MNT couvre le point mais n'a pas de valeur à cet endroit précis (nodata) : un léger
 *                             déplacement peut suffire.
 * Avant ce lot, les deux derniers affichaient le même écran (« Déplacez légèrement le repère ») : faux pour une zone entière.
 *
 * PUR : aucun import (lu par la route, le diagnostic et l'écran).
 */

export type MotifSansResultat = 'origine_invalide' | 'pas_de_lidar' | 'altitude_indisponible';

/**
 * Le motif d'une analyse sans résultat, d'après la validation de l'origine et la présence d'une dalle MNT sous le point
 * (`null` si elle n'a pas pu être vérifiée → on ne prétend pas qu'il n'y a pas de LiDAR). `null` si l'origine est valide
 * avec une altitude : le moteur a alors rendu un résultat. PUR.
 */
export function motifSansResultat(
  validation: { valide?: unknown; altitudeTerrainOrigineM?: unknown },
  mntSousLePoint: boolean | null,
): MotifSansResultat | null {
  if (validation.valide !== true) return 'origine_invalide';
  if (validation.altitudeTerrainOrigineM != null) return null;
  return mntSousLePoint === false ? 'pas_de_lidar' : 'altitude_indisponible';
}

/**
 * Nom de la dalle LiDAR HD de l'IGN (1 km × 1 km) qui contient un point Lambert-93 : « XXXX_YYYY », X = kilomètre Est du coin
 * Ouest, Y = kilomètre Nord du coin NORD (convention des fichiers `LHD_FXX_XXXX_YYYY_…`). Ex. (642 685, 6 853 606) →
 * « 0642_6854 ». Sert au journal, pour qu'Arno voie quelles dalles manquent. PUR.
 */
export function dalleIgn(xL93: number, yL93: number): string {
  const x = Math.floor(xL93 / 1000);
  const y = Math.floor(yL93 / 1000) + 1;
  return `${String(x).padStart(4, '0')}_${String(y).padStart(4, '0')}`;
}
