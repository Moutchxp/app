/**
 * ══ 🔴🔴 FRISE — LA GÉOMÉTRIE DES POINTS D'INFORMATION ET DE LEURS ZONES ACTIVES (Arno, 26/10/2026). PUR. ═════════════════════
 *
 * CONSTAT D'ARNO : pour ouvrir la bulle d'un point, il fallait survoler À CÔTÉ ; survoler le point n'ouvrait pas toujours SA bulle.
 * CAUSE (prouvée, `zonesPoints.test.ts`) : chaque point de 11 px portait une zone touchable de 44 × 44 px centrée sur lui
 * (lot MONGA-LIEN-PAR-LE-GESTE), alors que deux points voisins n'étaient qu'à 15 px d'axe en axe (11 px + 4 px d'écart). La zone du
 * point SUIVANT, peinte par-dessus, recouvrait le point survolé jusqu'à 7 px à gauche de son centre : la souris posée sur un point
 * touchait son voisin de droite.
 * RÈGLE : chaque zone est centrée sur son point, haute de 44 px, et large d'AU PLUS un pas (l'écart d'axe en axe) — jamais sur la zone
 * d'un voisin. Le pas est porté à 24 px (la largeur minimale qu'un doigt vise), en espaçant les points ; leur dessin (11 px) ne change pas.
 * Le CSS de la frise lit ces constantes : une seule écriture.
 */
export const POINT_PX = 11;
/** L'écart entre deux points (bord à bord). Pas = POINT_PX + ECART_POINTS_PX. */
export const ECART_POINTS_PX = 13;
export const PAS_POINTS_PX = POINT_PX + ECART_POINTS_PX;
export const ZONE_HAUTEUR_PX = 44;
/** La zone ne dépasse jamais le pas : deux zones voisines se touchent, sans se recouvrir. */
export const ZONE_LARGEUR_PX = Math.min(44, PAS_POINTS_PX);
/** Le « + » intercalaire voisin mord de 4 px sur la rangée (`.fav-entre{margin:0 -4px}`) : mesuré dans Chrome, il couvrait le bord du dernier point. */
export const DEBORD_PLUS_PX = 4;
/** La marge intérieure de la rangée : la demi-zone qui dépasse du point, plus le débord du « + » — la zone du premier et du dernier point reste libre. */
export const MARGE_POINTS_PX = (ZONE_LARGEUR_PX - POINT_PX) / 2 + DEBORD_PLUS_PX;
/** Le pas minimal pour un doigt. */
export const PAS_MINIMAL_DOIGT_PX = 24;

export interface ZonePoint { centre: number; gauche: number; droite: number; haut: number; bas: number; pointGauche: number; pointDroite: number }

/** La largeur de la rangée de `n` points (marges comprises). PUR. */
export const largeurRangee = (n: number): number => (n <= 0 ? 0 : 2 * MARGE_POINTS_PX + n * POINT_PX + (n - 1) * ECART_POINTS_PX);

/** Les zones actives de `n` points posés en rangée (abscisses depuis le bord de la rangée ; ordonnées depuis le centre du trait). PUR. */
export function zonesDesPoints(n: number): ZonePoint[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const pointGauche = MARGE_POINTS_PX + i * PAS_POINTS_PX;
    const centre = pointGauche + POINT_PX / 2;
    return { centre, gauche: centre - ZONE_LARGEUR_PX / 2, droite: centre + ZONE_LARGEUR_PX / 2,
      haut: -ZONE_HAUTEUR_PX / 2, bas: ZONE_HAUTEUR_PX / 2, pointGauche, pointDroite: pointGauche + POINT_PX };
  });
}

/** Le point dont la zone contient l'abscisse `x` (le dernier peint l'emporte, comme dans le navigateur) ; `null` : aucun. PUR. */
export function pointSous(zones: readonly ZonePoint[], x: number): number | null {
  let trouve: number | null = null;
  zones.forEach((z, i) => { if (x >= z.gauche && x < z.droite) trouve = i; });
  return trouve;
}

/** Le CSS des points et de leurs zones (lu par la frise). */
export const CSS_ZONES_POINTS = `.fav-points{position:relative;z-index:1;display:flex;align-items:center;gap:${ECART_POINTS_PX}px;padding:0 ${MARGE_POINTS_PX}px}
.fav-point::before{content:'';position:absolute;left:50%;top:50%;width:${ZONE_LARGEUR_PX}px;height:${ZONE_HAUTEUR_PX}px;
  transform:translate(-50%,-50%);border-radius:0;background:transparent}`;
