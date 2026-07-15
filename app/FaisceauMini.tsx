"use client";

/**
 * Miniature STATIQUE de la carte de validation du faisceau (écran résultat 7A/7B).
 * Compagnon de FaisceauMap : mêmes données (origine + cône + faisceau), mode PLAN (OSM),
 * SANS contrôles ni interaction, faisceau RECOLORABLE.
 *
 * ÉCHELLE VERROUILLÉE à 50 m, identique à l'écran 4 (barre « 50 m ») quelle que soit
 * l'adresse : zoom fixe = même résolution sol que FaisceauMap par défaut. Pas de scale
 * (qui fausserait l'échelle) — le conteneur carte est sur-dimensionné (150 %) puis tourné
 * pour rendre le faisceau vertical et couvrir les coins, À ÉCHELLE CONSTANTE.
 *
 * N'altère en rien FaisceauMap ni l'écran 4.
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { destination } from "./lib/geodesieAffichage";

const RAYON_M = 180; // longueur dessinée du faisceau (cosmétique, rogné)
const RAYON_CONE_M = 160;
const DEMI_CONE_DEG = 45;
const ARC_POINTS = 13;

// Résolution sol "50 m" de l'écran 4 (FaisceauMap) : mpp = RAYON_AXE / spanPx
// = 250 / (FRAME_H 288 − MARGE_HAUT 6 − MARGE_BAS 14) = 250 / 268. Échelle bloquée.
const MPP_50M = 250 / 268;
const MARGE_BAS_PX = 14; // origine ~à cette distance du bas du cadre


// Zoom (fractionnaire) correspondant à une résolution mètres/pixel donnée (cf. FaisceauMap).
function zoomDepuisMpp(lat: number, mpp: number): number {
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
}

interface FaisceauMiniProps {
  lat: number;
  lon: number;
  azimutDeg: number | null;
  couleur: string; // faisceau + origine (vert certifié / rouge vis-à-vis)
}

export default function FaisceauMini({ lat, lon, azimutDeg, couleur }: FaisceauMiniProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;

      // ZOOM FIXE = échelle 50 m de l'écran 4 (zoom fractionnaire → zoomSnap 0).
      const zoom = Math.max(3, Math.min(19, zoomDepuisMpp(lat, MPP_50M)));

      // Centre décalé en avant du faisceau : après la rotation, l'origine se pose en BAS.
      let center: [number, number] = [lat, lon];
      if (azimutDeg !== null) {
        const frameH = frameRef.current?.clientHeight ?? 128;
        const offsetM = (frameH / 2 - MARGE_BAS_PX) * MPP_50M;
        center = destination(lat, lon, azimutDeg, offsetM);
      }

      const map = L.map(divRef.current, {
        center,
        zoom,
        zoomSnap: 0,
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
        // PAS de fitBounds : l'échelle reste verrouillée à 50 m.
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

  // Faisceau vertical : on tourne TOUT le conteneur de -azimut (origine en bas).
  // Sur-dimensionnement (150 %) — PAS de scale — pour couvrir les coins après rotation
  // sans toucher à l'échelle géographique (la carte reste à 50 m).
  const rot = azimutDeg ?? 0;
  return (
    <div ref={frameRef} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: "150%",
          height: "150%",
          transform: `translate(-50%, -50%) rotate(${-rot}deg)`,
          transformOrigin: "center",
        }}
      >
        <div ref={divRef} className="h-full w-full" />
      </div>
    </div>
  );
}
