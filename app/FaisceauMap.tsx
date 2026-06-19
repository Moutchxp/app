"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const R = 6371000;        // rayon Terre (m)
const RAYON_M = 120;      // longueur faisceau / cône
const DEMI_CONE_DEG = 90; // ±90°
const ARC_POINTS = 13;    // approximation de l'arc

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

interface FaisceauMapProps {
  lat: number;
  lon: number;
  azimutDeg: number | null;
}

export default function FaisceauMap({ lat, lon, azimutDeg }: FaisceauMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;

      const map = L.map(divRef.current, { center: [lat, lon], zoom: 17 });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
        crossOrigin: true,
      }).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);

      // 1. Point d'origine (rouge).
      L.circleMarker([lat, lon], {
        radius: 6, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1, weight: 2,
      }).addTo(map);

      if (azimutDeg !== null) {
        // 3. Cône de vision (bleu translucide) : origine + arc ±90°.
        const sommets: [number, number][] = [[lat, lon]];
        for (let i = 0; i < ARC_POINTS; i++) {
          const b = azimutDeg - DEMI_CONE_DEG + (i * 2 * DEMI_CONE_DEG) / (ARC_POINTS - 1);
          sommets.push(destination(lat, lon, b, RAYON_M));
        }
        const cone = L.polygon(sommets, {
          color: "#2563eb", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.2,
        }).addTo(map);

        // 2. Faisceau central (rouge épais).
        L.polyline([[lat, lon], destination(lat, lon, azimutDeg, RAYON_M)], {
          color: "#dc2626", weight: 4,
        }).addTo(map);

        // 4. Zoom pour voir tout le cône.
        map.fitBounds(cone.getBounds(), { padding: [20, 20] });
      } else {
        map.setView([lat, lon], 17);
      }

      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 300);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lon, azimutDeg]);

  return (
    <div className="relative">
      <div ref={divRef} className="h-64 w-full overflow-hidden rounded-xl border border-slate-200" />
      {/* Indicateur Nord (le Nord est en haut sur Leaflet). */}
      <div className="pointer-events-none absolute right-2 top-2 z-[1000] rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-slate-800 shadow">
        N ↑
      </div>
      {azimutDeg === null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[1000] text-center text-xs font-semibold text-red-600">
          Orientation indisponible
        </div>
      )}
    </div>
  );
}
