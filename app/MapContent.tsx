"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type MapContentProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: {
    latitude: number;
    longitude: number;
  }) => void;
  onUserMove?: () => void;
};

export default function MapContent({
  latitude,
  longitude,
  onPositionChange,
  onUserMove,
}: MapContentProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapMode, setMapMode] = useState<"map" | "satellite">("map");

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    leafletMap.current = L.map(mapRef.current, {
      center: [latitude, longitude],
      zoom: 19,
      zoomControl: true,
    });

    leafletMap.current.on("moveend", () => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
      }

      moveTimer.current = setTimeout(() => {
        const center = leafletMap.current?.getCenter();

        if (!center) return;

        onPositionChange({
          latitude: center.lat,
          longitude: center.lng,
        });
      }, 500);
    });

    // Geste utilisateur uniquement : dragstart n'est jamais déclenché par setView.
    const handleUserMove = () => onUserMove?.();
    leafletMap.current.on("dragstart", handleUserMove);

    return () => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
      }
      leafletMap.current?.off("dragstart", handleUserMove);

      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  // Recentrage parent → carte quand les props lat/lon changent (ex. après succès GPS).
  // Garde anti-boucle : on ne recentre que si l'écart avec le centre actuel dépasse
  // ~1e-5 (sinon boucle infinie avec moveend → onPositionChange → setPosition).
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - latitude) > 0.00001 || Math.abs(c.lng - longitude) > 0.00001) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (!leafletMap.current) return;

    const url =
      mapMode === "map"
        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

    if (tileLayer.current) {
      leafletMap.current.removeLayer(tileLayer.current);
    }

    tileLayer.current = L.tileLayer(url, {
      maxZoom: 20,
    }).addTo(leafletMap.current);
  }, [mapMode]);

  return (
    <div className="relative mt-4 h-80 overflow-hidden rounded-2xl border border-slate-200">
      <div ref={mapRef} className="h-full w-full" />

      <button
        type="button"
        onClick={() =>
          setMapMode(mapMode === "map" ? "satellite" : "map")
        }
        className="absolute right-3 top-3 z-[2000] rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow"
      >
        {mapMode === "map" ? "Satellite" : "Carte"}
      </button>

      {/* épingle goutte (pointe en bas = point exact) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1500] -translate-x-1/2 -translate-y-full">
        <svg width="34" height="45" viewBox="0 0 24 32" fill="none" aria-hidden="true" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}>
          <path d="M12 0C5.92 0 1 4.92 1 11c0 7.7 11 21 11 21s11-13.3 11-21C23 4.92 18.08 0 12 0z" fill="var(--color-svv-red)" stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="12" cy="11" r="4" fill="#ffffff" />
        </svg>
      </div>
      {/* petit point au sol = emplacement précis (comme le firmware) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1500] -translate-x-1/2 -translate-y-1/2">
        <div className="svvPointSelect h-1 w-1 rounded-full ring-1 ring-black/40" />
      </div>
    </div>
  );
}