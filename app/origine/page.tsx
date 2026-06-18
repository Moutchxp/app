"use client";

import { Component, useCallback, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Map as LeafletMap } from "leaflet";

// La carte react-leaflet est chargée côté client uniquement (pas de SSR),
// avec un état de chargement VISIBLE.
const Carte = dynamic(() => import("./Carte"), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: "#C9A84C" }}>Chargement de la carte…</div>,
});

// ErrorBoundary : capture une éventuelle erreur de la carte et affiche un repli propre.
class CarteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Carte : échec de chargement", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, color: "#ff6b6b", fontSize: 13 }}>
          La carte n'a pas pu se charger. Réessayez.
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const mapRef = useRef<LeafletMap | null>(null);
  // Ignore le prochain moveend quand il provient d'un setView programmatique (photo).
  const skipMoveRef = useRef(false);

  const [pos, setPos] = useState<{ lat: number; lon: number }>(DEFAUT);
  const [aDeplace, setADeplace] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [origineValidee, setOrigineValidee] = useState<OrigineValidee | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPos, setPhotoPos] = useState<{ lat: number; lon: number } | null>(null);
  const [messagePhoto, setMessagePhoto] = useState<string | null>(null);

  async function valider(lat: number, lon: number) {
    setADeplace(true);
    setMessagePhoto(null);
    setOrigineValidee(null);
    setLoading(true);
    try {
      const res = await fetch("/api/origine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });
      setResultat((await res.json()) as Resultat);
    } catch {
      setResultat(null);
    } finally {
      setLoading(false);
    }
  }

  // Fin de déplacement de la carte → le CENTRE (réticule) est le point visé.
  // On ignore le moveend déclenché par un setView programmatique (centrage photo).
  const onMoveEnd = useCallback((lat: number, lon: number) => {
    setPos({ lat, lon }); // le réticule = ce centre : toujours refléter l'affichage
    if (skipMoveRef.current) {
      // moveend issu d'un setView programmatique (recentrage photo) → pas de validation
      skipMoveRef.current = false;
      return;
    }
    valider(lat, lon);
  }, []);

  const onMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  // Import photo → centrage carte via GPS EXIF (100 % client, jamais envoyé). Ne valide rien.
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    try {
      const exifr = (await import("exifr")).default;
      const gps = await exifr.gps(file);

      const map = mapRef.current;
      if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number" && map) {
        const lat = gps.latitude;
        const lon = gps.longitude;
        // Recentre la VUE uniquement — ne définit PAS l'origine et ne valide PAS.
        skipMoveRef.current = true; // le moveend du setView ne doit pas valider
        map.setView([lat, lon], map.getZoom());
        setPhotoPos({ lat, lon }); // épingle indicative (où la photo a été prise)
        setADeplace(false); // interacted reste false
        setResultat(null);
        setOrigineValidee(null);
        setMessagePhoto(
          `Vue recentrée sur la photo (${lat.toFixed(6)}, ${lon.toFixed(6)}). Faites glisser la carte pour amener le réticule sur la fenêtre de votre pièce de vie.`,
        );
      } else {
        // Pas de GPS : ne rien recentrer.
        setMessagePhoto("Photo sans coordonnées GPS — placez le point manuellement.");
      }
    } catch (err) {
      console.error("Lecture EXIF échouée :", err);
      setMessagePhoto("Impossible de lire la photo.");
    }
  }

  const couleurs: Record<Statut, { bord: string; fond: string }> = {
    VALIDE: { bord: "#2e7d32", fond: "#10240f" },
    HORS_BATIMENT: { bord: "#c98a1e", fond: "#241a0f" },
    SANS_BATIMENT: { bord: "#b23b3b", fond: "#240f0f" },
  };

  const confirmerActif = aDeplace && resultat?.statut === "VALIDE";

  function confirmer() {
    if (!confirmerActif || !resultat) return;
    setOrigineValidee({
      lat: pos.lat,
      lon: pos.lon,
      batimentOrigine: resultat.batimentOrigine,
      altitudeTerrainOrigineM: resultat.altitudeTerrainOrigineM,
    });
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        overflow: "hidden",
        background: BG,
        color: "#eee",
        fontFamily: "Georgia, 'Times New Roman', serif",
        maxWidth: 860,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* ZONE HAUT — titre, import photo, point visé */}
      <div style={{ flex: "0 0 auto", padding: "14px 20px 8px" }}>
        <h1 style={{ color: OR, fontWeight: 400, letterSpacing: "0.04em", margin: "0 0 2px" }}>
          Point d'origine
        </h1>
        <p style={{ color: "#9a9a9a", margin: "0 0 10px", fontSize: 13 }}>
          Sans Vis-à-Vis<span style={{ color: OR }}>®</span> — placez le point d'observation
        </p>

        {/* Import photo → centrage carte (GPS EXIF côté client) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: `1px solid ${OR}`,
              color: OR,
              background: "#161616",
              cursor: "pointer",
              fontSize: 14,
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
            }}
          >
            Importer une photo
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
          </label>
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="aperçu"
              style={{ height: 40, width: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${OR}55` }}
            />
          )}
          <span style={{ color: "#7a7a7a", fontSize: 11 }}>
            GPS lu localement — la photo n'est pas envoyée.
          </span>
        </div>

        {/* Point visé = centre de la carte sous le réticule (toujours visible) */}
        <div style={{ marginTop: 8, color: OR, fontSize: 12, fontFamily: "monospace" }}>
          Point visé (centre) : {pos.lat.toFixed(6)}, {pos.lon.toFixed(6)}
        </div>
      </div>

      {/* ZONE CARTE — occupe tout l'espace restant (minHeight:0 = peut rétrécir dans le flex) */}
      <div style={{ flex: "1 1 auto", minHeight: 0, padding: "0 20px" }}>
        <CarteErrorBoundary>
          <Carte
            center={[DEFAUT.lat, DEFAUT.lon]}
            photoPos={photoPos}
            onMoveEnd={onMoveEnd}
            onMapReady={onMapReady}
          />
        </CarteErrorBoundary>
      </div>

      {/* ZONE BAS — statut compact + bouton (toujours visibles, sans scroll) */}
      <div style={{ flex: "0 0 auto", padding: "8px 20px 14px" }}>
        {!aDeplace && (
          <div style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${OR}55`, background: "#161616", color: "#cfcfcf", fontSize: 13 }}>
            {messagePhoto ??
              "Faites glisser la carte pour amener le réticule central sur la fenêtre de votre pièce de vie."}
          </div>
        )}

        {aDeplace && loading && (
          <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #444", background: "#161616", color: OR, fontSize: 13 }}>
            validation…
          </div>
        )}

        {/* Indicateur LIVE « validable » — purement informatif, ne verrouille rien. */}
        {aDeplace && !loading && resultat && !origineValidee && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${couleurs[resultat.statut].bord}`,
              background: couleurs[resultat.statut].fond,
              color: "#eee",
              fontSize: 13,
            }}
          >
            {resultat.statut === "VALIDE" &&
              `✓ Point validable — à l'intérieur d'un bâtiment (altitude terrain ${resultat.altitudeTerrainOrigineM ?? "n/d"} m). Appuyez sur « Valider » pour confirmer.`}
            {resultat.statut === "HORS_BATIMENT" &&
              "✗ Point non validable — en dehors d'un bâtiment. Déplacez la carte."}
            {resultat.statut === "SANS_BATIMENT" &&
              "✗ Point non validable — aucun bâtiment ici."}
          </div>
        )}

        {origineValidee && (
          <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #2e7d32", background: "#10240f", color: "#7ee07e", fontSize: 13 }}>
            ✓ Point d'origine validé : {origineValidee.lat.toFixed(6)}, {origineValidee.lon.toFixed(6)} — altitude
            terrain {origineValidee.altitudeTerrainOrigineM ?? "n/d"} m
            {origineValidee.batimentOrigine && ` — bâtiment ${origineValidee.batimentOrigine.cleabs}`}
          </div>
        )}

        {/* Bouton de confirmation */}
        <button
          onClick={confirmer}
          disabled={!confirmerActif}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "14px 28px",
            borderRadius: 6,
            border: "none",
            fontSize: 15,
            cursor: confirmerActif ? "pointer" : "not-allowed",
            background: confirmerActif ? OR : "#333",
            color: confirmerActif ? "#0e0e0e" : "#777",
            fontWeight: 700,
            letterSpacing: "0.03em",
          }}
        >
          Valider ce point d'origine
        </button>
      </div>
    </main>
  );
}
