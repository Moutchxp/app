"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cardinalAbrege } from "./lib/cardinal";

const R = 6371000;        // rayon Terre (m)
const RAYON_M = 250;            // axe de contrôle (longueur max du faisceau)
const RAYON_CONE_M = 220;       // cône un peu plus court → la pointe rouge dépasse
const DEMI_CONE_VISUEL_DEG = 45; // champ de vision VISUEL (90° total) — tunable
const ARC_POINTS = 13;
const FRAME_H = 288;      // hauteur du cadre (h-72) — DOIT matcher la classe ci-dessous

// Mêmes sources de tuiles que la carte de localisation (cf. MapContent).
const TUILES = {
  map: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
    maxZoom: 20,
  },
} as const;
type MapMode = keyof typeof TUILES;

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

// Zoom (fractionnaire) correspondant à une résolution mètres/pixel donnée.
function zoomDepuisMpp(lat: number, mpp: number): number {
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
}
const MARGE_HAUT_PX = 6;  // la pointe rouge touche presque le bord haut
const MARGE_BAS_PX = 14;  // marge sous l'origine (rayon du point)
const MARGE_HAUT_PAN_PX = 16; // borne haute du défilement (origine au plus haut)

interface FaisceauMapProps {
  lat: number;
  lon: number;
  azimutDeg: number | null;
}

export default function FaisceauMap({ lat, lon, azimutDeg }: FaisceauMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [mapMode, setMapMode] = useState<MapMode>("map");
  const mapModeRef = useRef<MapMode>(mapMode);
  mapModeRef.current = mapMode;
  const [echelle, setEchelle] = useState<{ px: number; label: string } | null>(null);
  const pxOffsetRef = useRef(0); // décalage px de l'origine SOUS le centre (cadrage)
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;

      // Cadrage : pointe ~bord haut, origine juste au-dessus du bord bas (zoom fractionnaire).
      const spanPx = FRAME_H - MARGE_HAUT_PX - MARGE_BAS_PX;
      const mpp = RAYON_M / spanPx;
      const z = Math.max(3, Math.min(19, zoomDepuisMpp(lat, mpp)));
      pxOffsetRef.current = FRAME_H / 2 - MARGE_BAS_PX; // origine près du bas (défaut)
      const centre: [number, number] =
        azimutDeg !== null ? destination(lat, lon, azimutDeg, pxOffsetRef.current * mpp) : [lat, lon];

      const map = L.map(divRef.current, {
        center: centre,
        zoom: z,
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

      const t0 = TUILES[mapModeRef.current];
      tileLayerRef.current = L.tileLayer(t0.url, {
        maxZoom: t0.maxZoom,
        attribution: t0.attribution,
        crossOrigin: true,
      }).addTo(map);

      // Point d'origine (rouge).
      L.circleMarker([lat, lon], {
        radius: 6, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 1, weight: 2,
      }).addTo(map);

      if (azimutDeg !== null) {
        // Cône de vision (bleu translucide, contour net).
        const sommets: [number, number][] = [[lat, lon]];
        for (let i = 0; i < ARC_POINTS; i++) {
          const b = azimutDeg - DEMI_CONE_VISUEL_DEG + (i * 2 * DEMI_CONE_VISUEL_DEG) / (ARC_POINTS - 1);
          sommets.push(destination(lat, lon, b, RAYON_CONE_M));
        }
        L.polygon(sommets, { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.25 }).addTo(map);
        // Faisceau central (rouge épais).
        L.polyline([[lat, lon], destination(lat, lon, azimutDeg, RAYON_M)], { color: "#dc2626", weight: 4 }).addTo(map);
      }

      // Échelle custom recalculée à chaque zoom.
      const majEchelle = () => {
        const mppNow = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
        const cible = mppNow * 70;
        const nice = [5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000];
        const distM = nice.reduce((a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a), nice[0]);
        setEchelle({ px: distM / mppNow, label: distM >= 1000 ? `${distM / 1000} km` : `${distM} m` });
      };
      majEchelle();
      map.on("zoomend", majEchelle);

      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 300);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
        LRef.current = null;
      }
    };
  }, [lat, lon, azimutDeg]);

  // Bascule Plan / Satellite sans recréer la carte (échange uniquement la couche de tuiles).
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const t = TUILES[mapMode];
    tileLayerRef.current = L.tileLayer(t.url, {
      maxZoom: t.maxZoom,
      attribution: t.attribution,
      crossOrigin: true,
    }).addTo(map);
  }, [mapMode]);

  // Applique la vue depuis le décalage px de l'origine (origine fixe → cadrage stable au zoom).
  function appliquerVue(zoom: number) {
    const m = mapRef.current;
    if (!m) return;
    if (azimutDeg === null) {
      m.setZoom(zoom);
      return;
    }
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    m.setView(destination(lat, lon, azimutDeg, pxOffsetRef.current * mpp), zoom, { animate: false });
  }

  // Défilement vertical le long de l'axe (drag naturel ; Leaflet natif KO avec rotation CSS).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || azimutDeg === null) return;
    const az = azimutDeg; // number
    const demiH = FRAME_H / 2;
    let dragging = false;
    let startY = 0;
    let px0 = 0;
    const onDown = (e: PointerEvent) => {
      if (!mapRef.current) return;
      dragging = true;
      startY = e.clientY;
      px0 = pxOffsetRef.current;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const m = mapRef.current;
      if (!dragging || !m) return;
      const dy = e.clientY - startY; // drag naturel : le contenu suit le doigt
      // clamp : origine toujours visible — bas = défaut (MARGE_BAS), haut = MARGE_HAUT_PAN.
      const px = Math.min(demiH - MARGE_BAS_PX, Math.max(MARGE_HAUT_PAN_PX - demiH, px0 + dy));
      pxOffsetRef.current = px;
      const zoom = m.getZoom();
      const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
      m.setView(destination(lat, lon, az, px * mpp), zoom, { animate: false });
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [lat, lon, azimutDeg]);

  const rot = -(azimutDeg ?? 0); // rotation heading-up

  return (
    <div className="relative -mx-6 h-72 overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
      {/* Couche carte TOURNANTE, sur-dimensionnée (pas de trous aux coins). */}
      <div
        className="absolute"
        style={{
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          transform: `rotate(${rot}deg)`,
          transformOrigin: "center",
        }}
      >
        <div ref={divRef} className="h-full w-full" />
      </div>

      {/* Capture du défilement vertical (drag naturel le long de l'axe). */}
      <div ref={overlayRef} className="absolute inset-0 z-[1000]" style={{ touchAction: "none" }} />

      {/* Bascule Plan / Satellite (droite). */}
      <button
        type="button"
        onClick={() => setMapMode(mapMode === "map" ? "satellite" : "map")}
        className="absolute right-3 top-3 z-[2000] rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow"
      >
        {mapMode === "map" ? "Satellite" : "Carte"}
      </button>

      {/* Zoom +/− (les boutons seuls changent l'échelle ; drag/pinch désactivés). */}
      <div className="absolute left-3 top-3 z-[2000] flex flex-col overflow-hidden rounded-xl shadow">
        <button type="button" onClick={() => appliquerVue(Math.min(19, (mapRef.current?.getZoom() ?? 0) + 1))} className="bg-white px-3 py-1.5 text-base font-bold text-slate-800 active:bg-slate-100">+</button>
        <button type="button" onClick={() => appliquerVue(Math.max(3, (mapRef.current?.getZoom() ?? 0) - 1))} className="border-t border-slate-200 bg-white px-3 py-1.5 text-base font-bold text-slate-800 active:bg-slate-100">−</button>
      </div>

      {/* Boussole (droite, plus grande) : graduations fixes + texte droit + repère Nord tournant. */}
      <div className="absolute bottom-3 right-3 z-[2000] h-20 w-20 rounded-full border border-slate-300 bg-white shadow">
        {/* graduations fixes façon cadran (4 cardinaux marqués) */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ transform: `rotate(${rot}deg)`, transformOrigin: "center" }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * 15 * Math.PI) / 180;
            const majeur = i % 6 === 0;
            const r1 = majeur ? 36 : 42;
            const x1 = 50 + r1 * Math.sin(a);
            const y1 = 50 - r1 * Math.cos(a);
            const x2 = 50 + 46 * Math.sin(a);
            const y2 = 50 - 46 * Math.cos(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={majeur ? "#64748b" : "#cbd5e1"} strokeWidth={majeur ? 2 : 1} />;
          })}
        </svg>
        {azimutDeg !== null && (
          <div className="absolute inset-0" style={{ transform: `rotate(${rot}deg)` }}>
            {/* repère Nord rouge discret sur le pourtour (pointe vers le vrai Nord) */}
            <div className="absolute left-1/2 top-1 h-2.5 w-1 -translate-x-1/2 rounded-full bg-red-600" />
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-lg font-extrabold text-slate-900">{azimutDeg === null ? "—" : cardinalAbrege(azimutDeg)}</span>
          <span className="mt-0.5 text-[11px] font-semibold text-slate-500">{azimutDeg === null ? "" : `${Math.round(azimutDeg)}°`}</span>
        </div>
      </div>

      {/* Échelle (gauche). */}
      {echelle && (
        <div
          className="absolute bottom-3 left-3 z-[2000] border-b-2 border-l-2 border-r-2 border-slate-800 bg-white/70 text-center text-[10px] font-semibold text-slate-800"
          style={{ width: `${echelle.px}px` }}
        >
          {echelle.label}
        </div>
      )}

      {azimutDeg === null && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[2000] text-center text-xs font-semibold text-red-600">
          Orientation indisponible
        </div>
      )}
    </div>
  );
}
