/**
 * Construit l'URL Google Street View (panorama) pour un point GPS + un cap (heading). Module PUR & testable —
 * NAVIGATION seulement, n'altère aucune donnée. Format officiel « Google Maps URLs » (`api=1`) : ouvre le panorama
 * le plus proche du `viewpoint`, orienté `heading` (degrés, 0 = Nord, sens horaire).
 *
 * Le POINT passé doit être le point OFFICIEL de l'analyse (snappé façade, `validation.pointSnappeWgs84`) — celui
 * réellement analysé — et NON le point brut pré-snap. `heading` = azimut de l'analyse.
 */
export function urlStreetView(point: { lat: number; lon: number }, headingDeg: number): string {
  const heading = ((headingDeg % 360) + 360) % 360; // normalise dans [0, 360) (accepte 450, -10, …)
  // Format spec Google : virgule NON encodée dans `viewpoint`. lat/lon = nombres (état) → aucune injection possible ;
  // précision complète conservée (jamais arrondie).
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lon}&heading=${heading}`;
}
