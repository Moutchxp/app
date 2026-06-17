"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

type MapSelectorProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: { latitude: number; longitude: number }) => void;
};

let MapContent: any = () => null;
if (typeof window !== "undefined") {
  MapContent = require("./MapContent").default;
}

export default function MapSelector(props: MapSelectorProps) {
  return <MapContent {...props} />;
}