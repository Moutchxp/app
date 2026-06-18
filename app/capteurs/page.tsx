"use client";

import { useEffect, useRef, useState } from "react";

const OR = "#C9A84C";
const BG = "#0e0e0e";

// DeviceOrientationEvent.requestPermission n'est pas dans les types standards (iOS only).
type OrientationPermissionCtor = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};
interface OrientationEventIOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

const CARDINAUX = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
function cardinal(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % CARDINAUX.length;
  return CARDINAUX[i];
}

export default function CapteursPage() {
  const [actif, setActif] = useState(false);
  const [capDeg, setCapDeg] = useState<number | null>(null);
  const [capSource, setCapSource] = useState<"webkitCompassHeading" | "alpha" | null>(null);
  const [beta, setBeta] = useState<number | null>(null); // tangage (inclinaison verticale)
  const [gamma, setGamma] = useState<number | null>(null); // roulis (inclinaison horizontale)
  const [position, setPosition] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [erreurOrientation, setErreurOrientation] = useState<string | null>(null);
  const [erreurPosition, setErreurPosition] = useState<string | null>(null);

  const handlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Nettoyage de l'écouteur au démontage.
  useEffect(() => {
    return () => {
      if (handlerRef.current) {
        window.removeEventListener("deviceorientation", handlerRef.current);
        handlerRef.current = null;
      }
    };
  }, []);

  async function activer() {
    setErreurOrientation(null);
    setErreurPosition(null);

    // a. Permission orientation (obligatoire au clic sur iOS).
    const ctor = (typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as OrientationPermissionCtor)
      : null);

    if (ctor && typeof ctor.requestPermission === "function") {
      try {
        const etat = await ctor.requestPermission();
        if (etat !== "granted") {
          setErreurOrientation("Permission orientation refusée. Autorisez « Mouvement et orientation » dans Safari.");
          return;
        }
      } catch (e) {
        setErreurOrientation("Impossible de demander la permission orientation.");
        console.error("requestPermission orientation:", e);
        return;
      }
    }

    // b. Écoute en direct de l'orientation.
    const onOrient = (e: DeviceOrientationEvent) => {
      const iosEvt = e as OrientationEventIOS;
      if (typeof iosEvt.webkitCompassHeading === "number") {
        setCapDeg(iosEvt.webkitCompassHeading);
        setCapSource("webkitCompassHeading");
      } else if (typeof e.alpha === "number") {
        // alpha : 0 = orientation initiale ; cap ≈ 360 - alpha (approx, non calibré boussole).
        setCapDeg(((360 - e.alpha) % 360 + 360) % 360);
        setCapSource("alpha");
      }
      setBeta(typeof e.beta === "number" ? e.beta : null);
      setGamma(typeof e.gamma === "number" ? e.gamma : null);
    };
    if (handlerRef.current) window.removeEventListener("deviceorientation", handlerRef.current);
    handlerRef.current = onOrient;
    window.addEventListener("deviceorientation", onOrient, true);
    setActif(true);

    // c. Position GPS haute précision.
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
        (err) => {
          setErreurPosition(`Position refusée ou indisponible (${err.message}).`);
          console.error("geolocation:", err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    } else {
      setErreurPosition("Géolocalisation non supportée par ce navigateur.");
    }
  }

  const fmt = (v: number | null, u = "°") => (v === null ? "—" : `${v.toFixed(1)} ${u}`);

  const ligne = { padding: "12px 14px", borderRadius: 8, border: `1px solid ${OR}33`, background: "#161616", marginTop: 10 };
  const label = { color: "#9a9a9a", fontSize: 12 };
  const valeur = { color: OR, fontSize: 22, fontFamily: "monospace", marginTop: 2 };

  return (
    <main style={{ minHeight: "100dvh", background: BG, color: "#eee", fontFamily: "Georgia, 'Times New Roman', serif", padding: 24 }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ color: OR, fontWeight: 400, letterSpacing: "0.04em", marginBottom: 2 }}>
          Test des capteurs
        </h1>
        <p style={{ color: "#9a9a9a", marginTop: 0, fontSize: 14 }}>
          Sans Vis-à-Vis<span style={{ color: OR }}>®</span> — boussole, inclinaison, position
        </p>

        {!actif && (
          <button
            onClick={activer}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "14px 28px",
              borderRadius: 6,
              border: "none",
              fontSize: 15,
              cursor: "pointer",
              background: OR,
              color: "#0e0e0e",
              fontWeight: 700,
              letterSpacing: "0.03em",
            }}
          >
            Activer les capteurs
          </button>
        )}

        {actif && (
          <div style={{ marginTop: 8 }}>
            <div style={ligne}>
              <div style={label}>Cap (boussole) — source : {capSource ?? "—"}</div>
              <div style={valeur}>
                {capDeg === null ? "—" : `${capDeg.toFixed(1)}° ${cardinal(capDeg)}`}
              </div>
            </div>
            <div style={ligne}>
              <div style={label}>Inclinaison verticale (tangage, beta)</div>
              <div style={valeur}>{fmt(beta)}</div>
            </div>
            <div style={ligne}>
              <div style={label}>Roulis horizontal (gamma)</div>
              <div style={valeur}>{fmt(gamma)}</div>
            </div>
            <div style={ligne}>
              <div style={label}>Position GPS (haute précision)</div>
              <div style={{ ...valeur, fontSize: 16 }}>
                {position
                  ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}  (±${position.acc.toFixed(0)} m)`
                  : erreurPosition
                    ? "—"
                    : "acquisition…"}
              </div>
            </div>
            <p style={{ color: "#7a7a7a", fontSize: 12, marginTop: 12 }}>
              Bougez le téléphone : les valeurs se mettent à jour en direct.
            </p>
          </div>
        )}

        {erreurOrientation && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #c98a1e", background: "#241a0f", color: "#e0a23c", fontSize: 13 }}>
            {erreurOrientation}
          </div>
        )}
        {erreurPosition && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid #b23b3b", background: "#240f0f", color: "#ff9b9b", fontSize: 13 }}>
            {erreurPosition}
          </div>
        )}
      </div>
    </main>
  );
}
