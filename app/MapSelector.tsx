"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import type { ModeOrigine } from "./lib/svv/config";

type MapSelectorProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: { latitude: number; longitude: number }) => void;
  onUserMove?: () => void;
  pointSnappe?: { lat: number; lon: number } | null; // point recalé (V2) — forwardé tel quel à MapContent
  mode: ModeOrigine; // mode de saisie de l'origine (semi_auto | manuel)
  onModeChange: (m: ModeOrigine) => void;
};

let MapContent: any = () => null;
if (typeof window !== "undefined") {
  MapContent = require("./MapContent").default;
}

export default function MapSelector(props: MapSelectorProps) {
  return <MapContent {...props} />;
}