"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cardinalAbrege } from "./lib/cardinal";
import { destination, GEOMETRIE_VALIDATION } from "./lib/geodesieAffichage";

// Géométrie de VALIDATION (= carte du certificat) : centralisée dans le module pur, PARTAGÉE avec le générateur
// serveur (même géométrie). Rendu écran INCHANGÉ (mêmes valeurs). FaisceauMini garde les siennes, en local.
const { rayonM: RAYON_M, rayonConeM: RAYON_CONE_M, demiConeDeg: DEMI_CONE_VISUEL_DEG, arcPoints: ARC_POINTS } = GEOMETRIE_VALIDATION;
const FRAME_H = 288;      // hauteur du cadre (h-72) — DOIT matcher la classe ci-dessous

const MARGE_ROT_DEG = 30;          // borne ± autour de l'azimut capté (= marge roulis photo)
const SENS_ROT_DEG_PAR_PX = 0.25;  // sensibilité du glissement horizontal → rotation (à affiner iPhone)
const SEUIL_AXE_PX = 4;            // course min avant de figer l'axe dominant du geste

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

// Zoom (fractionnaire) correspondant à une résolution mètres/pixel donnée.
function zoomDepuisMpp(lat: number, mpp: number): number {
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp);
}
const MARGE_HAUT_PX = 6;  // la pointe rouge touche presque le bord haut
const MARGE_BAS_PX = 14;  // marge sous l'origine (rayon du point)
const MARGE_HAUT_PAN_PX = 16; // borne haute du défilement (origine au plus haut)

// --- Indice éphémère « on peut pivoter » : faisceau FANTÔME oscillant (géométrie en px écran) ---
const GH_BEAM_PX = FRAME_H - MARGE_HAUT_PX - MARGE_BAS_PX;            // longueur du faisceau (px)
const GH_CONE_PX = (RAYON_CONE_M / RAYON_M) * GH_BEAM_PX;             // rayon du cône (px)
const GH_W = 2 * GH_CONE_PX * Math.sin((DEMI_CONE_VISUEL_DEG * Math.PI) / 180); // largeur du fantôme
const GH_AX = GH_W / 2;     // apex x = origine (bas-centre)
const GH_AY = GH_BEAM_PX;   // apex y = origine (bas)
const GH_CONE_POINTS = (() => {
  let pts = `${GH_AX},${GH_AY}`;
  for (let i = 0; i < ARC_POINTS; i++) {
    const a = ((-DEMI_CONE_VISUEL_DEG + (i * 2 * DEMI_CONE_VISUEL_DEG) / (ARC_POINTS - 1)) * Math.PI) / 180;
    pts += ` ${GH_AX + GH_CONE_PX * Math.sin(a)},${GH_AY - GH_CONE_PX * Math.cos(a)}`;
  }
  return pts;
})();
// Oscillation ±26° (un peu en deçà de la marge ±30°) + fondu in/maintien/out.
const HINT_KEYFRAMES =
  "@keyframes svvSwing{0%,100%{transform:rotate(0)}25%{transform:rotate(-26deg)}75%{transform:rotate(26deg)}}" +
  "@keyframes svvHint{0%{opacity:0}6%{opacity:1}82%{opacity:1}100%{opacity:0}}";

interface FaisceauMapProps {
  lat: number;
  lon: number;
  azimutDeg: number | null;       // azimut COURANT (ajusté) — pilote l'affichage
  azimutInitial?: number | null;  // centre du clamp (azimut capté) ; null → rotation désactivée
  onAzimutChange?: (azimutPropose: number) => void; // le clamp final se fait côté parent
  /** Demi-amplitude (deg) de rotation autorisée autour de `azimutInitial`. Défaut = MARGE_ROT_DEG (±30°,
   *  parcours public, INCHANGÉ). Le banc d'essai passe 180 → 360° libre. */
  margeRotDeg?: number;
  /** Affiche l'indice éphémère « on peut pivoter » (faisceau fantôme oscillant). Défaut = true (parcours public,
   *  INCHANGÉ). Le banc passe false pour la carte analysée en LECTURE SEULE (l'invite y serait trompeuse). */
  inviteRotation?: boolean;
}

export default function FaisceauMap({ lat, lon, azimutDeg, azimutInitial = null, onAzimutChange, margeRotDeg = MARGE_ROT_DEG, inviteRotation = true }: FaisceauMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const coneLayerRef = useRef<any>(null);
  const beamLayerRef = useRef<any>(null);
  const [mapMode, setMapMode] = useState<MapMode>("map");
  const mapModeRef = useRef<MapMode>(mapMode);
  mapModeRef.current = mapMode;
  const [echelle, setEchelle] = useState<{ px: number; label: string } | null>(null);
  const pxOffsetRef = useRef(0); // décalage px de l'origine SOUS le centre (cadrage)
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Azimut AFFICHÉ : source de vérité de l'affichage, synchronisée sur la prop.
  const [azDisp, setAzDisp] = useState<number | null>(azimutDeg);
  const azDispRef = useRef<number | null>(azDisp);
  azDispRef.current = azDisp;
  const [enButee, setEnButee] = useState(false);

  // Indice éphémère « on peut faire pivoter » : visible à l'arrivée, disparaît au 1er geste
  // ou après un délai de sécurité (couvre la durée de l'animation ~5,8 s). Réapparaît au remontage.
  const [indiceRotationVisible, setIndiceRotationVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setIndiceRotationVisible(false), 6000);
    return () => clearTimeout(id);
  }, []);

  // Refs miroir pour le handler de geste (attaché une seule fois → jamais ré-attaché en plein geste).
  const azimutInitialRef = useRef<number | null>(azimutInitial);
  azimutInitialRef.current = azimutInitial;
  const onAzimutChangeRef = useRef<typeof onAzimutChange>(onAzimutChange);
  onAzimutChangeRef.current = onAzimutChange;

  // La prop change de l'extérieur (reset photo, clamp parent) → on resynchronise l'affichage.
  useEffect(() => {
    setAzDisp(azimutDeg);
  }, [azimutDeg]);

  // Redessine EN PLACE le cône + faisceau et recadre la vue à `az`. NE recrée JAMAIS la carte.
  function redraw(az: number | null) {
    const m = mapRef.current;
    const L = LRef.current;
    if (!m || !L || az === null) return;
    const zoom = m.getZoom();
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    m.setView(destination(lat, lon, az, pxOffsetRef.current * mpp), zoom, { animate: false });

    const sommets: [number, number][] = [[lat, lon]];
    for (let i = 0; i < ARC_POINTS; i++) {
      const b = az - DEMI_CONE_VISUEL_DEG + (i * 2 * DEMI_CONE_VISUEL_DEG) / (ARC_POINTS - 1);
      sommets.push(destination(lat, lon, b, RAYON_CONE_M));
    }
    if (coneLayerRef.current) m.removeLayer(coneLayerRef.current);
    if (beamLayerRef.current) m.removeLayer(beamLayerRef.current);
    coneLayerRef.current = L.polygon(sommets, { color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.25 }).addTo(m);
    beamLayerRef.current = L.polyline([[lat, lon], destination(lat, lon, az, RAYON_M)], { color: "#dc2626", weight: 4 }).addTo(m);
  }
  const redrawRef = useRef(redraw);
  redrawRef.current = redraw;

  // Création de la carte UNE seule fois (tuiles + origine). Pas de recréation à la rotation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;

      const spanPx = FRAME_H - MARGE_HAUT_PX - MARGE_BAS_PX;
      const mpp = RAYON_M / spanPx;
      const z = Math.max(3, Math.min(19, zoomDepuisMpp(lat, mpp)));
      pxOffsetRef.current = FRAME_H / 2 - MARGE_BAS_PX; // origine près du bas (défaut)
      const az0 = azDispRef.current;
      const centre: [number, number] =
        az0 !== null ? destination(lat, lon, az0, pxOffsetRef.current * mpp) : [lat, lon];

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

      // Faisceau + cône initiaux.
      redrawRef.current(azDispRef.current);

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
        coneLayerRef.current = null;
        beamLayerRef.current = null;
      }
    };
  }, [lat, lon]);

  // Rotation : à chaque azimut affiché, on redessine EN PLACE (pré-paint → synchronisé avec la rotation CSS).
  useLayoutEffect(() => {
    redrawRef.current(azDisp);
  }, [azDisp, lat, lon]);

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
    const az = azDispRef.current;
    if (az === null) {
      m.setZoom(zoom);
      return;
    }
    const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
    m.setView(destination(lat, lon, az, pxOffsetRef.current * mpp), zoom, { animate: false });
  }

  // Geste unique : axe dominant horizontal → ROTATION, vertical → PAN (le long de l'axe courant).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const demiH = FRAME_H / 2;
    let dragging = false;
    let mode: "none" | "rotate" | "pan" = "none";
    let startX = 0;
    let startY = 0;
    let azStart = 0;
    let px0 = 0;

    const onDown = (e: PointerEvent) => {
      if (!mapRef.current) return;
      setIndiceRotationVisible(false); // 1er geste → l'indice disparaît
      dragging = true;
      mode = "none";
      startX = e.clientX;
      startY = e.clientY;
      azStart = azDispRef.current ?? 0;
      px0 = pxOffsetRef.current;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const m = mapRef.current;
      if (!dragging || !m) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (mode === "none") {
        if (Math.abs(dx) < SEUIL_AXE_PX && Math.abs(dy) < SEUIL_AXE_PX) return;
        mode = Math.abs(dx) > Math.abs(dy) ? "rotate" : "pan";
      }

      if (mode === "rotate") {
        const azInit = azimutInitialRef.current;
        if (azInit === null) return; // rotation désactivée (orientation indisponible)
        const propose = azStart + dx * SENS_ROT_DEG_PAR_PX;
        const lo = azInit - margeRotDeg;
        const hi = azInit + margeRotDeg;
        const clamped = Math.max(lo, Math.min(hi, propose));
        setEnButee(propose < lo - 0.001 || propose > hi + 0.001);
        setAzDisp(clamped);               // affichage local immédiat (le faisceau reste vertical)
        onAzimutChangeRef.current?.(propose); // le parent clampe et renvoie la valeur officielle
      } else {
        // PAN vertical existant — le long de l'axe courant.
        const az = azDispRef.current;
        if (az === null) return;
        const px = Math.min(demiH - MARGE_BAS_PX, Math.max(MARGE_HAUT_PAN_PX - demiH, px0 + dy));
        pxOffsetRef.current = px;
        const zoom = m.getZoom();
        const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
        m.setView(destination(lat, lon, az, px * mpp), zoom, { animate: false });
      }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      mode = "none";
      setEnButee(false);
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
  }, [lat, lon, margeRotDeg]);

  const rot = -(azDisp ?? 0); // rotation heading-up

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

      {/* Indice éphémère : faisceau FANTÔME qui oscille (au-dessus de la carte, sous les contrôles).
          `inviteRotation` (défaut true = public inchangé) permet au banc de le supprimer sur la carte analysée. */}
      {azDisp !== null && indiceRotationVisible && inviteRotation && (
        <>
          <style>{HINT_KEYFRAMES}</style>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[500]"
            style={{ animation: "svvHint 5.8s ease-in-out forwards" }}
          >
            <svg
              viewBox={`0 0 ${GH_W} ${GH_BEAM_PX}`}
              style={{
                position: "absolute",
                left: "50%",
                bottom: `${MARGE_BAS_PX}px`,
                width: `${GH_W}px`,
                height: `${GH_BEAM_PX}px`,
                transform: "translateX(-50%)",
                overflow: "visible",
              }}
            >
              <g
                style={{
                  transformBox: "view-box",
                  transformOrigin: `${GH_AX}px ${GH_AY}px`,
                  animation: "svvSwing 2.8s ease-in-out 2",
                }}
              >
                <polygon points={GH_CONE_POINTS} fill="#3b82f6" fillOpacity={0.15} stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
                <line x1={GH_AX} y1={GH_AY} x2={GH_AX} y2={0} stroke="#dc2626" strokeWidth={3} opacity={0.55} strokeLinecap="round" />
              </g>
            </svg>
          </div>
        </>
      )}

      {/* Capture du geste (rotation horizontale / pan vertical le long de l'axe). */}
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

      {/* Boussole (droite) : graduations + texte droit + repère Nord tournant. */}
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
        {azDisp !== null && (
          <div className="absolute inset-0" style={{ transform: `rotate(${rot}deg)` }}>
            {/* repère Nord rouge discret sur le pourtour (pointe vers le vrai Nord) */}
            <div className="absolute left-1/2 top-1 h-2.5 w-1 -translate-x-1/2 rounded-full bg-red-600" />
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-lg font-extrabold text-slate-900">{azDisp === null ? "—" : cardinalAbrege(azDisp)}</span>
          <span className={"mt-0.5 text-[11px] font-semibold " + (enButee ? "text-red-600" : "text-slate-500")}>{azDisp === null ? "" : `${Math.round(azDisp)}°`}</span>
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

      {azDisp === null && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[2000] text-center text-xs font-semibold text-red-600">
          Orientation indisponible
        </div>
      )}
    </div>
  );
}
