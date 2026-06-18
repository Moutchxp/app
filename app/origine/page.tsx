"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// Centre par défaut : 8 rue Denfert-Rochereau, 92600 Asnières-sur-Seine (coords de test).
const DEFAUT = { lat: 48.906982, lon: 2.269398 };

const OR = "#C9A84C";
const BG = "#0e0e0e";

type Statut = "VALIDE" | "HORS_BATIMENT" | "SANS_BATIMENT";
interface Resultat {
  statut: Statut;
  valide: boolean;
  message: string;
  altitudeTerrainOrigineM: number | null;
  distanceAuBatimentM: number;
  batimentOrigine: { id: number; cleabs: string } | null;
}
interface OrigineValidee {
  lat: number;
  lon: number;
  batimentOrigine: { id: number; cleabs: string } | null;
  altitudeTerrainOrigineM: number | null;
}

export default function OriginePage() {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const lastLatLng = useRef<{ lat: number; lon: number }>(DEFAUT);

  const [aDeplace, setADeplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [origineValidee, setOrigineValidee] = useState<OrigineValidee | null>(null);

  async function valider(lat: number, lon: number) {
    lastLatLng.current = { lat, lon };
    setADeplace(true);
    setOrigineValidee(null);
    setLoading(true);
    try {
      const res = await fetch("/api/origine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      const json = (await res.json()) as Resultat;
      setResultat(json);
    } catch {
      setResultat(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current || mapRef.current) return;

      // Corrige les chemins d'icônes cassés en bundler.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(divRef.current, { center: [DEFAUT.lat, DEFAUT.lon], zoom: 18 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([DEFAUT.lat, DEFAUT.lon], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        valider(p.lat, p.lng);
      });
      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        valider(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const couleurs: Record<Statut, { bord: string; fond: string }> = {
    VALIDE: { bord: "#2e7d32", fond: "#10240f" },
    HORS_BATIMENT: { bord: "#c98a1e", fond: "#241a0f" },
    SANS_BATIMENT: { bord: "#b23b3b", fond: "#240f0f" },
  };

  const continuerActif = aDeplace && resultat?.statut === "VALIDE";

  function continuer() {
    if (!continuerActif || !resultat) return;
    setOrigineValidee({
      lat: lastLatLng.current.lat,
      lon: lastLatLng.current.lon,
      batimentOrigine: resultat.batimentOrigine,
      altitudeTerrainOrigineM: resultat.altitudeTerrainOrigineM,
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: BG, color: "#eee", fontFamily: "Georgia, 'Times New Roman', serif", padding: "24px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ color: OR, fontWeight: 400, letterSpacing: "0.04em", marginBottom: 4 }}>
          Point d'origine
        </h1>
        <p style={{ color: "#9a9a9a", marginTop: 0, fontSize: 14 }}>
          Sans Vis-à-Vis<span style={{ color: OR }}>®</span> — placez le point d'observation
        </p>

        <div
          ref={divRef}
          style={{ height: 460, width: "100%", borderRadius: 8, border: `1px solid ${OR}33`, overflow: "hidden", marginTop: 12 }}
        />

        {/* Panneau de statut */}
        <div style={{ marginTop: 16 }}>
          {!aDeplace && (
            <div style={{ padding: 16, borderRadius: 8, border: `1px solid ${OR}55`, background: "#161616", color: "#cfcfcf" }}>
              Placez le point d'origine en déplaçant le marqueur sur la fenêtre de votre pièce de vie.
            </div>
          )}

          {aDeplace && loading && (
            <div style={{ padding: 16, borderRadius: 8, border: "1px solid #444", background: "#161616", color: OR }}>
              validation…
            </div>
          )}

          {aDeplace && !loading && resultat && (
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${couleurs[resultat.statut].bord}`,
                background: couleurs[resultat.statut].fond,
                color: "#eee",
              }}
            >
              <div style={{ fontSize: 15 }}>{resultat.message}</div>
              {resultat.statut === "VALIDE" && (
                <div style={{ marginTop: 6, color: OR }}>
                  Altitude terrain {resultat.altitudeTerrainOrigineM ?? "n/d"} m
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bouton Continuer */}
        <button
          onClick={continuer}
          disabled={!continuerActif}
          style={{
            marginTop: 16,
            padding: "12px 28px",
            borderRadius: 6,
            border: "none",
            fontSize: 15,
            cursor: continuerActif ? "pointer" : "not-allowed",
            background: continuerActif ? OR : "#333",
            color: continuerActif ? "#0e0e0e" : "#777",
            fontWeight: 700,
            letterSpacing: "0.03em",
          }}
        >
          Continuer
        </button>

        {origineValidee && (
          <div style={{ marginTop: 14, color: "#bdbdbd", fontSize: 14 }}>
            Origine validée : {origineValidee.lat.toFixed(6)}, {origineValidee.lon.toFixed(6)} — altitude
            terrain {origineValidee.altitudeTerrainOrigineM ?? "n/d"} m
            {origineValidee.batimentOrigine && ` — bâtiment ${origineValidee.batimentOrigine.cleabs}`}
          </div>
        )}
      </div>
    </main>
  );
}
