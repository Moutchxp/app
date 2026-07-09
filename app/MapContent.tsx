"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ModeOrigine } from "./lib/svv/config";

// Indice « glissez la carte » : fondu d'apparition qui RESTE visible (svvFadeIn, opacity 0→1,
// pas d'extinction) + glissement horizontal en boucle infinie (svvDragSlide, ~±28px). Keyframes
// injectées en <style> inline, volontairement PAS dans globals.css. PUREMENT VISUEL : aucun event Leaflet.
const HINT_KEYFRAMES =
  "@keyframes svvFadeIn{0%{opacity:0}100%{opacity:1}}" +
  "@keyframes svvDragSlide{0%{transform:translateX(-28px)}50%{transform:translateX(28px)}100%{transform:translateX(-28px)}}";

type MapContentProps = {
  latitude: number;
  longitude: number;
  onPositionChange: (position: {
    latitude: number;
    longitude: number;
  }) => void;
  onUserMove?: () => void;
  onMove?: (position: { latitude: number; longitude: number }) => void; // centre en TEMPS RÉEL (event Leaflet `move`) — affichage seul
  pointSnappe?: { lat: number; lon: number } | null; // point recalé sur la bordure (V2) ; null = pas de fantôme
  mode: ModeOrigine; // mode de saisie de l'origine (semi_auto | manuel)
  onModeChange: (m: ModeOrigine) => void;
  zoomAncreCentre?: boolean; // ancre pincement/molette/double-clic sur le CENTRE (point immobile au zoom) ; défaut = comportement Leaflet (pointeur)
};

export default function MapContent({
  latitude,
  longitude,
  onPositionChange,
  onUserMove,
  onMove,
  pointSnappe,
  mode,
  onModeChange,
  zoomAncreCentre,
}: MapContentProps) {
  // Toujours pointer sur la DERNIÈRE prop onPositionChange : le handler moveend est branché une
  // seule fois (effet deps []) ; sans cette ref il appellerait le onPositionChange du MONTAGE,
  // dont la closure fige `mode` (ex. "manuel" au retour de « Refaire ») → bug A.
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  });
  // Idem pour onMove (temps réel) : handler branché une seule fois, ref toujours à jour.
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });

  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapMode, setMapMode] = useState<"map" | "satellite">("map");
  const [infoModeOuvert, setInfoModeOuvert] = useState(false); // modal local « 2 modes de saisie »

  // Halo du bouton semi_auto pendant le recentrage de la carte sur le point recalé.
  const [animating, setAnimating] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pulse couleur du bouton « Façade » : durée de vie 3 s DÉCOUPLÉE de `animating` (450 ms).
  // `pulseTick` change la key du bouton → redémarre l'animation à chaque recadrage, même rapproché.
  const [colorPulsing, setColorPulsing] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  // Cible du dernier recentrage automatique. Si le centre s'y arrête, c'est NOUS → on ignore.
  // Sinon c'est un vrai déplacement utilisateur → on évalue. Auto-correcteur, aucun blocage possible.
  const programmaticTarget = useRef<{ lat: number; lon: number } | null>(null);

  // Indice « faites glisser la carte » : la main tourne en boucle JUSQU'AU 1er geste
  // (disparition gérée dans handleUserMove). Pas de timer de sécurité.
  const [indiceDragVisible, setIndiceDragVisible] = useState(true);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    // Zoom ancré CENTRE (banc) : pincement/molette/double-clic zooment sur le centre → le point (= centre)
    // reste immobile, comme les boutons +/−. Absent (parcours public) → options NON passées = défaut Leaflet
    // inchangé (ancrage sur le pointeur). `'center'` est la valeur Leaflet 1.9 pour ces trois options.
    const zoomOpts = zoomAncreCentre
      ? { touchZoom: "center" as const, scrollWheelZoom: "center" as const, doubleClickZoom: "center" as const }
      : {};
    leafletMap.current = L.map(mapRef.current, {
      center: [latitude, longitude],
      zoom: 19,
      zoomControl: true,
      ...zoomOpts,
    });

    leafletMap.current.on("moveend", () => {
      // Notre flyTo de recentrage : si le centre s'arrête à < 0,5 m de la cible mémorisée, c'est
      // NOUS → on consomme et on ignore. Sinon = vrai déplacement utilisateur → on évalue.
      const map = leafletMap.current;
      if (
        map &&
        programmaticTarget.current &&
        map.distance(map.getCenter(), [programmaticTarget.current.lat, programmaticTarget.current.lon]) < 0.5
      ) {
        programmaticTarget.current = null; // c'était notre flyTo → consommé et ignoré
        return;
      }
      programmaticTarget.current = null; // vrai déplacement utilisateur → on continue (débounce → evaluer)
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
      }

      moveTimer.current = setTimeout(() => {
        const center = leafletMap.current?.getCenter();

        if (!center) return;

        onPositionChangeRef.current({
          latitude: center.lat,
          longitude: center.lng,
        });
      }, 500);
    });

    // Geste utilisateur uniquement : dragstart n'est jamais déclenché par setView.
    const handleUserMove = () => {
      setIndiceDragVisible(false); // 1er geste → l'indice disparaît (cf. FaisceauMap)
      onUserMove?.();
    };
    leafletMap.current.on("dragstart", handleUserMove);

    // Centre en TEMPS RÉEL (pan/flyTo) → affichage des coordonnées, sans débounce. Purement lecture.
    const handleMove = () => {
      const c = leafletMap.current?.getCenter();
      if (c) onMoveRef.current?.({ latitude: c.lat, longitude: c.lng });
    };
    leafletMap.current.on("move", handleMove);

    return () => {
      if (moveTimer.current) {
        clearTimeout(moveTimer.current);
      }
      leafletMap.current?.off("dragstart", handleUserMove);
      leafletMap.current?.off("move", handleMove);

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

  // À chaque nouveau point recalé (semi_auto), recentre la carte EN DOUCEUR dessus : le curseur
  // central fixe « tombe » sur la façade. Anti-boucle via programmaticTarget (le moveend du flyTo,
  // qui s'arrête sur la cible, est ignoré). Mode manuel : pointSnappe est null → return tôt.
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !pointSnappe) return;
    // Cible déjà (quasi) au centre → flyTo serait un no-op inutile. Rien à recentrer.
    const distM = map.distance(map.getCenter(), [pointSnappe.lat, pointSnappe.lon]);
    if (distM < 0.5) return; // seuil sous-métrique
    programmaticTarget.current = { lat: pointSnappe.lat, lon: pointSnappe.lon };
    setAnimating(true);
    setColorPulsing(true);
    setPulseTick((t) => t + 1);
    map.flyTo([pointSnappe.lat, pointSnappe.lon], map.getZoom(), { duration: 0.45 });
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimating(false), 450);
    const colorTimer = setTimeout(() => setColorPulsing(false), 3000);
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      clearTimeout(colorTimer);
    };
  }, [pointSnappe]);

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

      {/* Sélecteur de mode de saisie de l'origine (bas-gauche). Actif = anneau rouge. */}
      <div className="absolute left-3 bottom-3 z-[2000] flex gap-1">
        {(["semi_auto", "manuel"] as const).map((m) => (
          <button
            key={m === "semi_auto" ? `facade-${pulseTick}` : m}
            type="button"
            onClick={() => onModeChange(m)}
            aria-pressed={mode === m}
            className={
              "rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow" +
              (mode === m ? " ring-1 ring-red-500" : "") +
              (animating && m === "semi_auto" ? " svvInfoBump" : "") +
              (colorPulsing && m === "semi_auto" ? " svvColorPulse3s" : "")
            }
          >
            {m === "semi_auto" ? "Façade" : "Libre"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setInfoModeOuvert(true)}
          aria-label="À propos des modes de saisie"
          className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow"
        >
          <span className="italic">i</span>
        </button>
      </div>

      {/* Modal local « 2 modes de saisie » — overlay FIXED (échappe à l'overflow-hidden de la carte). */}
      {infoModeOuvert && (
        <div onClick={() => setInfoModeOuvert(false)} className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/45 p-5">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-extrabold text-svv-ink">Deux modes de saisie</h2>
            <h3 className="mt-4 text-sm font-semibold text-svv-ink">Façade (activé par défaut)</h3>
            <p className="mt-1 text-sm leading-relaxed text-svv-gray">Votre point est automatiquement recalé sur la façade du bâtiment la plus proche. Cette option est sélectionnée par défaut pour vous aider à fiabiliser votre diagnostic «&nbsp;sans vis-à-vis&nbsp;» : la mesure part toujours de la façade, de façon cohérente d&apos;un bien à l&apos;autre. À conserver dans la grande majorité des cas.</p>
            <h3 className="mt-4 text-sm font-semibold text-svv-ink">Libre</h3>
            <p className="mt-1 text-sm leading-relaxed text-svv-gray">En mode Libre, votre point reste exactement là où vous l&apos;avez posé, sans recalage. Utile lorsque la fenêtre est en retrait de la façade, par exemple une terrasse ou une baie au dernier étage. Dans les deux modes, le point doit rester à l&apos;intérieur de l&apos;emprise d&apos;un bâtiment, sinon la mesure n&apos;est pas certifiable.</p>
            <button type="button" onClick={() => setInfoModeOuvert(false)} className="svv-btn svv-btn-primary mt-5">Compris</button>
          </div>
        </div>
      )}

      {/* Indice éphémère PUREMENT VISUEL (aucun event Leaflet) : l'emoji main 👆 (rendu natif Apple
          sur iPhone), dans le TIERS BAS de la carte (pas sur le repère central), qui glisse ↔ pour
          mimer le geste de pan. Le vrai repère central (z-[1500]) reste figé. z-[500] = au-dessus
          des tuiles, SOUS le repère et le bouton satellite (z-[2000]). AUCUNE ombre / filter. */}
      {indiceDragVisible && (
        <>
          <style>{HINT_KEYFRAMES}</style>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[500]"
            style={{ animation: "svvFadeIn 0.6s ease-out forwards" }}
          >
            {/* ancre : tiers bas, centrée horizontalement (transform de centrage) */}
            <div className="absolute left-1/2 top-[70%] -translate-x-1/2">
              {/* l'emoji glisse ↔ (transform composé avec le centrage de l'ancre) */}
              <span
                style={{
                  display: "block",
                  fontSize: "60px",
                  lineHeight: 1,
                  animation: "svvDragSlide 2.4s ease-in-out infinite",
                }}
              >
                👆
              </span>
            </div>
          </div>
        </>
      )}

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