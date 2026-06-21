"use client";

/**
 * Miniature STATIQUE de la carte de validation du faisceau (écran résultat 7A/7B).
 * Composant compagnon de FaisceauMap : mêmes données (origine + cône + faisceau),
 * mode PLAN (OSM), SANS contrôles ni interaction, faisceau RECOLORABLE.
 * N'altère en rien FaisceauMap ni l'écran 4.
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const R = 6371000; // rayon Terre (m)
const RAYON_M = 180; // longueur du faisceau (miniature)
const RAYON_CONE_M = 160;
const DEMI_CONE_DEG = 45;
const ARC_POINTS = 13;

// Destination géodésique : (lat, lon) + cap + distance → [lat2, lon2].
function destination(lat: number, lon: number, bearingDeg: number, distM: number): [number, number] {
  const d = distM / R;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const sinp2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t);
  const p2 = Math.asin(sinp2);
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * sinp2);
  return [(p2 * 180) / Math.PI, (l2 * 180) / Math.PI];
}

interface FaisceauMiniProps {
  lat: number;
  lon: number;
  azimutDeg: number | null;
  couleur: string; // faisceau + origine (vert certifié / rouge vis-à-vis)
}

export default function FaisceauMini({ lat, lon, azimutDeg, couleur }: FaisceauMiniProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;

      const map = L.map(divRef.current, {
        center: [lat, lon],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      mapRef.current = map;

      // PLAN (dessin) — mêmes tuiles OSM que la carte de localisation.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);

      // Origine (recolorée).
      L.circleMarker([lat, lon], {
        radius: 5,
        color: couleur,
        fillColor: couleur,
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);

      if (azimutDeg !== null) {
        const sommets: [number, number][] = [[lat, lon]];
        for (let i = 0; i < ARC_POINTS; i++) {
          const b = azimutDeg - DEMI_CONE_DEG + (i * 2 * DEMI_CONE_DEG) / (ARC_POINTS - 1);
          sommets.push(destination(lat, lon, b, RAYON_CONE_M));
        }
        L.polygon(sommets, { color: couleur, weight: 1, fillColor: couleur, fillOpacity: 0.18 }).addTo(map);
        L.polyline([[lat, lon], destination(lat, lon, azimutDeg, RAYON_M)], { color: couleur, weight: 3 }).addTo(map);
        // Padding généreux : la rotation + le sur-cadrage (scale) rognent les bords,
        // on garde donc l'origine et le faisceau bien au centre.
        map.fitBounds(L.latLngBounds(sommets).pad(0.45), { animate: false });
      }

      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 200);
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m && m.remove) {
        m.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lon, azimutDeg, couleur]);

  // Rotation de TOUTE la carte pour que l'axe du faisceau soit vertical (origine en bas) :
  // le faisceau pointe à `azimutDeg` (sens horaire depuis le nord = le haut), donc on tourne
  // le conteneur de -azimutDeg. Sur-cadrage (scale) pour éviter les coins vides après rotation.
  const rot = azimutDeg ?? 0;
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="h-full w-full"
        style={{ transform: `rotate(${-rot}deg) scale(1.5)`, transformOrigin: "center" }}
      >
        <div ref={divRef} className="h-full w-full" />
      </div>
    </div>
  );
}
