"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

type MapSelectorProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: { latitude: number; longitude: number }) => void;
};

const MapContent = dynamic(() => import("./MapContent"), {
  ssr: false,
});

export default function MapSelector(props: MapSelectorProps) {
  return <MapContent {...props} />;
}