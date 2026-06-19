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
};

export default function MapContent({
  latitude,
  longitude,
  onPositionChange,
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

    return () => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
      }

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

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1500] -translate-x-1/2 -translate-y-full">
        <div className="flex flex-col items-center">
          <div className="h-7 w-7 rounded-full border-4 border-white bg-red-700 shadow-lg" />
          <div className="h-6 w-2 rounded-b-full bg-red-700 shadow-lg" />
        </div>
      </div>
    </div>
  );
}