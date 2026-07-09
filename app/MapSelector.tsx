"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import type { ModeOrigine } from "./lib/svv/config";

type MapSelectorProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: { latitude: number; longitude: number }) => void;
  onUserMove?: () => void;
  onMove?: (position: { latitude: number; longitude: number }) => void; // centre temps réel — forwardé à MapContent
  pointSnappe?: { lat: number; lon: number } | null; // point recalé (V2) — forwardé tel quel à MapContent
  mode: ModeOrigine; // mode de saisie de l'origine (semi_auto | manuel)
  onModeChange: (m: ModeOrigine) => void;
  zoomAncreCentre?: boolean; // banc : zoom ancré centre (point immobile) — forwardé à MapContent ; défaut = public inchangé
};

// Chargé CÔTÉ CLIENT UNIQUEMENT (Leaflet accède à `window`). `ssr: false` → rendu identique (rien) au SSR ET
// au 1er rendu client, puis montage après hydratation → AUCUN mismatch d'hydratation. Remplace l'ancien
// `require` sous `typeof window` (qui rendait `null` au serveur mais le composant au client → hydration failed).
const MapContent = dynamic(() => import("./MapContent"), { ssr: false });

export default function MapSelector(props: MapSelectorProps) {
  return <MapContent {...props} />;
}