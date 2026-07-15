/**
 * Géodésie d'AFFICHAGE — module PUR, partagé. `destination()` : (lat, lon) + cap + distance → [lat2, lon2].
 *
 * EXTRAITE VERBATIM des copies inline de `app/FaisceauMap.tsx` et `app/FaisceauMini.tsx` (une seule copie
 * désormais, plus de divergence programmée). Module PUR : aucun "use client", aucun import leaflet, aucun DOM,
 * aucun React → importable par les composants CLIENT **et** par du code SERVEUR (générateur de la carte
 * d'orientation, lot 5).
 *
 * ⚠️ COSMÉTIQUE D'AFFICHAGE — PAS la géométrie certifiée du moteur (`app/lib/svv/*`). Ne JAMAIS ranger ici une
 * constante de RENDU (RAYON_M, rayon de cône, demi-angle…) : elles restent PROPRES à chaque composant (le mini
 * dessine volontairement plus court que l'écran de validation). Seul `R` (rayon de la Terre, constante PHYSIQUE
 * identique dans les deux composants) vit ici.
 */
export const R = 6371000; // rayon Terre (m)

// Destination géodésique : (lat, lon) + cap + distance → [lat2, lon2].
export function destination(lat: number, lon: number, bearingDeg: number, distM: number): [number, number] {
  const d = distM / R;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const sinp2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t);
  const p2 = Math.asin(sinp2);
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * sinp2);
  return [(p2 * 180) / Math.PI, (l2 * 180) / Math.PI];
}
