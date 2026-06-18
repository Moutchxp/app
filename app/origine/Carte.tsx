"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Corrige les chemins d'icônes Leaflet cassés en bundler (client uniquement).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const OR = "#C9A84C";

interface CarteProps {
  center: [number, number];
  photoPos: { lat: number; lon: number } | null;
  onMoveEnd: (lat: number, lon: number) => void;
  onMapReady: (map: L.Map) => void;
}

/** À chaque fin de déplacement de la carte, remonte le CENTRE (= point visé). */
function CentreTracker({ onMoveEnd }: { onMoveEnd: (lat: number, lon: number) => void }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onMoveEnd(c.lat, c.lng);
    },
  });
  return null;
}

/** Expose l'instance de carte au parent (pour le recentrage photo). */
function MapReady({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

/** Force le recalcul de taille (essentiel sur iOS Safari : conteneur 0 au montage). */
function Resizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 300);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [map]);
  return null;
}

export default function Carte({ center, photoPos, onMoveEnd, onMapReady }: CarteProps) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={center}
        zoom={18}
        style={{ height: "100%", width: "100%", borderRadius: 8 }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />

        {photoPos && (
          <CircleMarker
            center={[photoPos.lat, photoPos.lon]}
            radius={6}
            pathOptions={{ color: "#4aa3ff", fillColor: "#4aa3ff", fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>Position de la photo (indicatif) — l'origine reste à placer à la main</Popup>
          </CircleMarker>
        )}

        <CentreTracker onMoveEnd={onMoveEnd} />
        <MapReady onReady={onMapReady} />
        <Resizer />
      </MapContainer>

      {/* Réticule fixe au centre, NON cliquable : la pointe vise le centre exact. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -100%)",
          pointerEvents: "none",
          zIndex: 1000,
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
        }}
      >
        <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15 0C7 0 0.5 6.4 0.5 14.3 0.5 24.6 15 42 15 42S29.5 24.6 29.5 14.3C29.5 6.4 23 0 15 0Z"
            fill={OR}
            stroke="#0e0e0e"
            strokeWidth="1.5"
          />
          <circle cx="15" cy="14" r="5" fill="#0e0e0e" />
        </svg>
      </div>
    </div>
  );
}
