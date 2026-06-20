"use client";

import Image from "next/image";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import MapSelector from "./MapSelector";
import dynamic from "next/dynamic";
import { useOrigineValidation } from "./lib/useOrigineValidation";
import { cardinal } from "./lib/cardinal";

type Etape = "accueil" | "photo" | "localisation" | "orientation" | "infos" | "resultat";

// Forme (partielle) de la réponse succès de /api/analyse (cf. app/api/analyse/route.ts).
interface ReponseAnalyse {
  ok: true;
  validation: { valide: boolean; raison?: string } & Record<string, unknown>;
  resultat:
    | {
        verdict: {
          verdict: "SANS_VIS_A_VIS" | "VIS_A_VIS" | "INDETERMINE";
          distanceM: number | null;
          obstacle: unknown;
          analyseDegradee: boolean;
          messageDegrade: string | null;
          raison: string;
        };
        score: { total: number; libelle: string | null; scorePartiel: boolean } & Record<string, unknown>;
        distanceAxePrincipalM: number | null;
      }
    | null;
}

// Carte du faisceau (affichage seul), client-only.
const FaisceauMap = dynamic(() => import("./FaisceauMap"), { ssr: false });

export default function Home() {
  const [etape, setEtape] = useState<Etape>("accueil");
  const [address, setAddress] = useState("");
  const [addressInfo, setAddressInfo] = useState(""); // message d'info SOUS le champ, jamais dans sa valeur
  const origine = useOrigineValidation();
  const [pointDeplace, setPointDeplace] = useState(false); // true au 1er geste utilisateur sur la carte
  const [etage, setEtage] = useState("");
  const [dernierEtage, setDernierEtage] = useState(false);
  // Résultat de l'analyse (/api/analyse) — écran "resultat".
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [analyse, setAnalyse] = useState<ReponseAnalyse | null>(null);
  const [analyseErreur, setAnalyseErreur] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreNextReverseRef = useRef(false);
  const conserverPositionRef = useRef(false); // au redo : garder le marqueur, ne pas réécrire via GPS

  const [position, setPosition] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  // États pour la photo et les capteurs
  const [photo, setPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [angles, setAngles] = useState({ pitch: 0, roll: 0, heading: 0 });
  const [isLevel, setIsLevel] = useState(false);
  const [capturedOrientation, setCapturedOrientation] = useState<number | null>(null);

  // États de validation individuels pour l'aide visuelle
  const [pitchValid, setPitchValid] = useState(false);
  const [rollValid, setRollValid] = useState(false);

  // Références pour le lissage anti-saccades (Filtre passe-bas)
  const smoothRollRef = useRef(0);
  const smoothPitchOffsetRef = useRef(0);
  
  // États lissés pour animer les éléments graphiques séparés
  const [visualRoll, setVisualRoll] = useState(0);
  const [visualPitchOffset, setVisualPitchOffset] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Moteur de calcul de l'adresse et validation bâtiment
  async function getAddressFromGPS(latitude: number, longitude: number) {
    // Après une sélection d'adresse : sauter UN reverse-geocode pour ne pas écraser le label.
    if (ignoreNextReverseRef.current) {
      ignoreNextReverseRef.current = false;
      return;
    }
    setAddressInfo(""); // on a un point → plus de message de statut
    try {
      // Reverse BAN (cohérent avec l'autocomplétion) : le label inclut le numéro si le point
      // est proche d'une adresse de type housenumber.
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/reverse/?lat=${latitude}&lon=${longitude}`,
      );
      const data: { features?: { properties?: { label?: string } }[] } = await response.json();
      const label = data.features?.[0]?.properties?.label;
      if (label) {
        setAddress(label);
      } else {
        // Pas d'adresse exploitable (point loin de toute adresse) : champ vide, info de repli.
        setAddress("");
        setAddressInfo("Position trouvée — saisissez l'adresse ou ajustez le repère");
      }
    } catch {
      setAddressInfo("Adresse récupérée - Ajustez la position sur la carte");
    }
  }

  // --- Autocomplétion d'adresse (BAN) : parcours de secours sans GPS ---
  function onChangeAdresse(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setAddress(v); // champ contrôlé
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (v.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    suggestTimerRef.current = setTimeout(() => fetchSuggestions(v), 300); // débounce ~300 ms
  }

  async function fetchSuggestions(q: string) {
    type BanFeature = { properties?: { label?: string }; geometry?: { coordinates?: number[] } };
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`,
      );
      const data: { features?: BanFeature[] } = await res.json();
      const items = (data.features ?? [])
        .map((f) => ({
          label: f.properties?.label ?? "",
          lon: f.geometry?.coordinates?.[0],
          lat: f.geometry?.coordinates?.[1],
        }))
        .filter(
          (s): s is { label: string; lat: number; lon: number } =>
            s.label !== "" && typeof s.lat === "number" && typeof s.lon === "number",
        );
      setSuggestions(items);
    } catch {
      setSuggestions([]);
    }
  }

  function selectSuggestion(s: { label: string; lat: number; lon: number }) {
    setAddress(s.label);
    setAddressInfo(""); // efface "Position introuvable…"
    setSuggestions([]);
    // Anti-écrasement : saute le reverse-geocode du moveend déclenché par le recentrage.
    ignoreNextReverseRef.current = true;
    // Filet : désarme le flag si aucun moveend ne survient (adresse ~ au centre actuel).
    setTimeout(() => {
      ignoreNextReverseRef.current = false;
    }, 1500);
    // Recentrage via le MÊME mécanisme que le GPS (setPosition → setView). Ne touche pas pointDeplace.
    setPosition({ latitude: s.lat, longitude: s.lon });
  }

  // Purge du timer de débounce au démontage.
  useEffect(() => {
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, []);

  // Écoute du gyroscope et de la boussole optimisée
  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      const pitch = event.beta ? Math.round(event.beta) : 0;
      const roll = event.gamma ? Math.round(event.gamma) : 0;
      
      let heading = 0;
      if ('webkitCompassHeading' in event) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha) {
        heading = 360 - event.alpha;
      }
      heading = Math.round(heading);

      // 1. Validation de la Verticale (Pitch) : Stricte à ±3°
      const absPitch = Math.abs(pitch);
      const isPValid = (absPitch >= 87 && absPitch <= 94) || Math.abs(pitch - 90) <= 3 || Math.abs(pitch + 90) <= 3;
      
      // 2. Validation de l'Horizontale (Roll) : Souple à ±30°
      const isRValid = Math.abs(roll) <= 30;

      setAngles({ pitch, roll, heading });
      setPitchValid(isPValid);
      setRollValid(isRValid);
      
      const levelState = isPValid && isRValid;
      setIsLevel(levelState);

      // Calcul des écarts pour l'animation de la croix centrale
      let targetPitchOffset = 0;
      if (isPValid) {
        targetPitchOffset = 0; 
      } else if (absPitch < 87) {
        targetPitchOffset = 87 - absPitch; 
      } else {
        targetPitchOffset = absPitch - 94; 
        targetPitchOffset = -targetPitchOffset; 
      }

      // Application du filtre passe-bas (0.15)
      smoothRollRef.current = smoothRollRef.current + (roll - smoothRollRef.current) * 0.15;
      smoothPitchOffsetRef.current = smoothPitchOffsetRef.current + (targetPitchOffset - smoothPitchOffsetRef.current) * 0.15;

      setVisualRoll(smoothRollRef.current);
      setVisualPitchOffset(smoothPitchOffsetRef.current);
    }

    if (isCameraActive) {
      window.addEventListener("deviceorientation", handleOrientation);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [isCameraActive]);

  // Allumer la caméra et demander les permissions de gyroscope
  async function startCamera() {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
        if (permissionState === "granted") {
          console.log("Gyroscope autorisé.");
        }
      } catch (err) {
        console.log("Erreur capteurs :", err);
      }
    } else if (typeof window !== "undefined" && !('ontouchstart' in window)) {
      setIsLevel(true);
      setPitchValid(true);
      setRollValid(true);
    }

    setIsCameraActive(true);
    setPhoto(null);

    const constraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false,
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Tentative caméra standard...", err);
      try {
        const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = basicStream;
        if (videoRef.current) {
          videoRef.current.srcObject = basicStream;
        }
      } catch (fallbackErr) {
        console.error("Erreur caméra :", fallbackErr);
        alert("Impossible d'accéder à la caméra.");
        setIsCameraActive(false);
      }
    }
  }

  // Demande de géolocalisation, réutilisable : capturePhoto ET bouton "Utiliser ma position".
  function demanderPositionGPS() {
    if (navigator.geolocation) {
      setAddress("");
      setAddressInfo("Calcul de votre position GPS…");

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const photoPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          // Met à jour la carte et lance le calcul d'adresse automatique (evaluer suit via moveend)
          setPosition(photoPosition);
          await getAddressFromGPS(photoPosition.latitude, photoPosition.longitude);
        },
        (error) => {
          console.warn("Géoloc refusée/indisponible — code:", error?.code, "message:", error?.message);
          if (error?.code === 1) {
            // Refus : sans impact (le GPS ne sert qu'au centrage ; le point est posé à la main).
            setAddressInfo(
              "Géolocalisation non partagée — saisissez votre adresse ci-dessus, ou déplacez la carte directement sur la fenêtre du logement.",
            );
          } else {
            setAddressInfo("Géolocalisation introuvable — saisissez l'adresse ou déplacez le repère sur la carte.");
          }
        },
        {
          enableHighAccuracy: false, // position approx suffit (origine posée à la main) ; évite les timeouts en intérieur
          timeout: 20000,
          maximumAge: 60000 // accepte une position en cache (≤ 60 s)
        }
      );
    } else {
      // Fallback si le navigateur ne gère pas la géolocalisation
      setAddressInfo("Géolocalisation indisponible — saisissez l'adresse ou déplacez le repère.");
    }
  }

  // 🛠️ CAPTURE DOUBLE : PHOTO + POSITION GPS SIMULTANÉE
  function capturePhoto() {
    if (!isLevel) return; 

    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // 1. On fige la photo immédiatement
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/jpeg"));
        setCapturedOrientation(angles.heading); 
        
        // 2. On éteint proprement le flux caméra
        stopCamera();

        // 3. On déclenche la géolocalisation pour placer le point sur la carte
        if (conserverPositionRef.current) {
          conserverPositionRef.current = false;
          origine.evaluer(position.latitude, position.longitude); // re-évalue le point conservé (sans GPS)
        } else {
          demanderPositionGPS();
        }
        setEtape("localisation");
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsCameraActive(false);
  }

  async function handleAnalyse() {
    // Garde-fous AVANT tout appel réseau (restent sur l'écran "infos" si KO).
    if (!origine.valide) {
      setAnalyseErreur(
        "Point d'origine non validé. Revenez à l'étape carte et validez un point dans un bâtiment.",
      );
      return;
    }
    const lat = origine.valide.lat;
    const lon = origine.valide.lon;
    const azimut = capturedOrientation;
    if (azimut === null) {
      setAnalyseErreur(
        "Orientation manquante. Reprenez la photo pour capturer le cap (boussole).",
      );
      return;
    }
    const etageNum = etage.trim() === "" ? NaN : Number(etage);
    if (!Number.isInteger(etageNum) || etageNum < 0) {
      setAnalyseErreur(
        "Indiquez un étage valide (nombre entier, 0 = rez-de-chaussée).",
      );
      return;
    }

    // Tout est bon : bascule sur l'écran résultat en mode chargement.
    setAnalyseErreur(null);
    setAnalyse(null);
    setAnalyseEnCours(true);
    setEtape("resultat");
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 100);

    try {
      const r = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, azimut, etage: etageNum, dernierEtage }),
      });
      const data = await r.json();
      if (!r.ok || data.ok === false) {
        setAnalyseErreur(data?.erreur ?? "Erreur lors de l'analyse.");
      } else {
        setAnalyse(data as ReponseAnalyse);
      }
    } catch {
      setAnalyseErreur("Connexion impossible au service d'analyse.");
    } finally {
      setAnalyseEnCours(false);
    }
  }

  // « Mauvaise orientation » : reprendre la photo en conservant le point d'origine déjà placé.
  function reprendrePhoto() {
    setPhoto(null);
    setCapturedOrientation(null);
    origine.reset();                     // repasse en non-validé
    conserverPositionRef.current = true; // garde la position du marqueur (GPS ne l'écrase pas)
    setEtape("photo");
  }

  // Calculs mécaniques de l'instrumentation de bord
  const lineTranslateY = Math.max(-45, Math.min(45, visualPitchOffset * 2.5));
  const cursorRotationDeg = Math.max(-50, Math.min(50, visualRoll));

  return (
    <main className="min-h-[100dvh] bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/Logo-Jorel-SVV-2019v.2.png"
            alt="Sans Vis-à-Vis"
            width={260}
            height={260}
            priority
          />
        </div>

        <section className="rounded-3xl bg-white p-6 shadow">
          {etape === "accueil" && (
            <div className="flex flex-col">
              <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight text-svv-ink">
                Découvrez <span className="text-svv-red">la vraie qualité</span> de votre vue
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-svv-muted">
                {"Une analyse objective, basée sur la géolocalisation, les altitudes et l'intelligence artificielle."}
              </p>

              <button
                type="button"
                onClick={() => setEtape("photo")}
                className="svv-btn svv-btn-primary relative mt-6"
              >
                Évaluer ma vue
                <span className="absolute right-5 text-xl leading-none">›</span>
              </button>

              <button
                type="button"
                onClick={() => setEtape("photo")}
                className="svv-btn svv-btn-outline mt-3"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="11" width="3" height="7" />
                  <rect x="13" y="7" width="3" height="11" />
                </svg>
                <span className="text-left leading-tight">Estimer la valeur<br />de mon bien</span>
              </button>

              <p className="mt-5 text-center text-[11.5px] leading-snug text-svv-muted">
                Sans Vis-à-Vis® : le premier obstacle réel à + de 40 mètres
              </p>
            </div>
          )}

{etape === "photo" && (
  <>
    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
      Photo de la vue
    </h1>
    <p className="mt-2 mb-5 text-sm leading-relaxed text-svv-muted">
      {"Prenez une photo bien droite depuis votre fenêtre. Notre système calcule l'orientation et la position automatiquement."}
    </p>

    <div>
      {!isCameraActive && !photo && (
        <button type="button" onClick={startCamera} className="svv-btn svv-btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7l2-3h4l2 3" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          Ouvrir l&apos;appareil photo
        </button>
      )}

      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black select-none">
          <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

          {/* Barre supérieure */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-12 pb-4">
            <button
              type="button"
              onClick={() => { conserverPositionRef.current = false; stopCamera(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white text-lg"
              aria-label="Fermer"
            >
              ✕
            </button>
            <div className="flex flex-col items-center text-center leading-tight">
              <span className={`text-sm font-semibold ${isLevel ? "text-[#7CE2A0]" : "text-white"}`}>
                {isLevel ? "Bien droit" : "Ajustez le niveau"}
              </span>
              <span className="mt-0.5 text-[11px] text-white/80">
                Inclinaison {angles.pitch}° · Roulis {angles.roll}°
              </span>
              <span className="text-[11px] text-white/80">
                Azimut{" "}
                {typeof angles.heading === "number"
                  ? `${Math.round(angles.heading)}° (${cardinal(angles.heading)})`
                  : "en attente…"}
              </span>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white text-base" aria-hidden="true">⚡</div>
          </div>

          {/* HUD niveau : arc de roulis + croix de pitch (conservé à l'identique) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="relative w-44 h-16 flex items-center justify-center overflow-hidden">
              <div className={`absolute top-2 w-32 h-32 rounded-full border-4 bg-transparent transition-colors duration-300 ${
                rollValid ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-red-500'
              }`} style={{ clipPath: 'ellipse(100% 35% at 50% 0%)' }} />
              <div className="absolute top-[2px] w-1 h-2 bg-white rounded-full z-10" />
              <div
                className="absolute top-2 w-32 h-32 origin-center transition-transform duration-75 ease-out flex justify-center"
                style={{ transform: `rotate(${cursorRotationDeg}deg)` }}
              >
                <div className="w-3 h-3 bg-white rounded-full shadow-md border border-slate-900 -mt-[4px] animate-pulse" />
              </div>
              <span className={`absolute bottom-0 text-[10px] font-black uppercase tracking-wider ${rollValid ? 'text-green-400' : 'text-red-400'}`}>
                {rollValid ? "Horizontal OK" : "Téléphone penché"}
              </span>
            </div>

            <div className="relative w-36 h-36 flex items-center justify-center mt-2">
              <div className={`absolute w-14 h-14 rounded-full border border-dashed transition-colors ${pitchValid ? 'border-green-500/60 bg-green-500/5' : 'border-white/20'}`} />
              <div className="absolute w-0.5 h-28 bg-white/30" />
              <div className="absolute w-6 h-0.5 bg-white/50 left-12" />
              <div className="absolute w-6 h-0.5 bg-white/50 right-12" />
              <div
                className={`absolute w-24 h-0.5 left-6 transition-transform duration-75 ease-out shadow-sm ${
                  pitchValid ? 'bg-green-500 h-[3px] shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500'
                }`}
                style={{ transform: `translateY(${lineTranslateY}px)` }}
              />
            </div>
          </div>

          {/* Barre inférieure : Grand-angle · déclencheur · Aide */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-6 pb-10">
            <p className="mb-5 text-center text-sm text-white/90" style={{ textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>
              Cadrez votre vue et maintenez votre téléphone bien droit.
            </p>
            <div className="flex items-center justify-between">
              <span className="w-16 text-center text-[11px] text-white/85">Grand-angle</span>
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!isLevel}
                aria-label="Prendre la photo"
                className={`h-[74px] w-[74px] rounded-full border-[5px] transition-all duration-300 ${
                  isLevel ? "bg-white border-[#7CE2A0]/80 active:scale-95" : "bg-white/50 border-white/30 cursor-not-allowed"
                }`}
              />
              <span className="w-16 text-center text-[11px] text-white/85">Aide</span>
            </div>
          </div>
        </div>
      )}

      {photo && (
        <div className="relative overflow-hidden rounded-2xl border border-svv-line">
          <img src={photo} alt="Vue séjour capturée" className="h-48 w-full object-cover" />
          <div className="absolute bottom-2 left-2 rounded-md bg-svv-ink/85 px-2 py-1 text-[11px] text-white">
            🧭 Orientation : {capturedOrientation}° (Azimut)
          </div>
          <button
            type="button"
            onClick={startCamera}
            className="absolute top-2 right-2 rounded-lg bg-svv-red px-3 py-1.5 text-xs font-semibold text-white shadow"
          >
            Refaire la photo
          </button>
        </div>
      )}
    </div>
  </>
)}

          {/* ZONE 2 : ADRESSE + CARTE */}
          {etape === "localisation" && (
            <div className="mb-6 border-t border-slate-100 pt-4 animate-fadeIn">
              <label className="mb-2 block font-semibold text-slate-800">2. Votre adresse</label>
              
              <input
                value={address}
                onChange={onChangeAdresse}
                className="mb-4 w-full rounded-xl border border-slate-300 p-3 text-base font-semibold text-slate-900 placeholder:text-slate-400 bg-slate-50"
                placeholder="Saisissez l'adresse, ou déplacez le repère sur la carte"
              />
              {suggestions.length > 0 && (
                <ul className="-mt-3 mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow divide-y divide-slate-100">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => selectSuggestion(s)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-800 active:bg-slate-100"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {addressInfo && (
                <p className="-mt-3 mb-3 text-xs text-amber-600">{addressInfo}</p>
              )}

              <MapSelector
                latitude={position.latitude}
                longitude={position.longitude}
                onPositionChange={(newPosition) => {
                  setPosition(newPosition);
                  getAddressFromGPS(newPosition.latitude, newPosition.longitude);
                  origine.evaluer(newPosition.latitude, newPosition.longitude);
                }}
                onUserMove={() => setPointDeplace(true)}
              />
              <p className="mt-2 text-xs text-slate-500">
                🎯 Déplacez la carte pour caler précisément le repère rouge sur la façade de votre pièce.
              </p>

              {/* Tant que l'utilisateur n'a pas déplacé le point : consigne en rouge. */}
              {!pointDeplace && (
                <div className="mt-3 rounded-xl border border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-800">
                  📍 Placez précisément le point GPS sur la fenêtre du point de vue que vous voulez faire
                  valider : déplacez la carte pour amener le repère rouge sur cette fenêtre.
                </div>
              )}

              {/* Validation du point d'origine (PostGIS via /api/origine) — après 1er déplacement */}
              {pointDeplace && origine.enCours && (
                <p className="mt-3 text-sm text-slate-500">Vérification du point…</p>
              )}

              {pointDeplace && !origine.enCours && origine.resultat && !origine.valide && (
                <div
                  className={
                    "mt-3 rounded-xl border p-3 text-sm font-medium " +
                    (origine.resultat.statut === "VALIDE"
                      ? "border-green-300 bg-green-50 text-green-800"
                      : origine.resultat.statut === "HORS_BATIMENT"
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-red-300 bg-red-50 text-red-800")
                  }
                >
                  {origine.resultat.statut === "VALIDE" &&
                    `✓ Point validable — à l'intérieur d'un bâtiment (altitude terrain ${origine.resultat.altitudeTerrainOrigineM ?? "n/d"} m). Appuyez sur « Valider » pour confirmer.`}
                  {origine.resultat.statut === "HORS_BATIMENT" &&
                    `✗ Point non validable — en dehors d'un bâtiment (à ${origine.resultat.distanceAuBatimentM.toFixed(2)} m). Déplacez la carte.`}
                  {origine.resultat.statut === "SANS_BATIMENT" &&
                    "✗ Point non validable — aucun bâtiment ici."}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  origine.confirmer(position.latitude, position.longitude);
                  setEtape("orientation");
                }}
                disabled={!pointDeplace || origine.resultat?.statut !== "VALIDE" || !!origine.valide}
                className={
                  "mt-3 w-full rounded-xl px-6 py-3 font-bold text-white transition-colors " +
                  (pointDeplace && origine.resultat?.statut === "VALIDE" && !origine.valide
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-slate-300 cursor-not-allowed")
                }
              >
                Valider ce point d'origine
              </button>
            </div>
          )}

          {/* ÉCRAN 3 : VALIDATION DE L'ORIENTATION */}
          {etape === "orientation" && (
            <div className="mb-6 border-t border-slate-100 pt-4 animate-fadeIn">
              <label className="mb-1 block font-semibold text-slate-800">3. Vérifiez le faisceau d'analyse</label>
              <p className="mb-3 text-sm text-slate-600">
                Le faisceau rouge correspond-il bien à l'axe de votre vue ?
              </p>

              {photo && (
                <div className="relative -mx-6 mb-3 aspect-[2/1] overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt="Vue capturée"
                    className="w-full h-full object-cover object-center"
                  />
                  {/* Croix de visée centrale (faisceau de contrôle) */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-6 w-6">
                      <div className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 bg-[#dc2626] shadow-[0_0_2px_rgba(0,0,0,0.85)]" />
                      <div className="absolute left-1/2 top-1/2 h-px w-9 -translate-x-1/2 -translate-y-1/2 bg-white shadow-[0_0_2px_rgba(0,0,0,0.85)]" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-3">
                <FaisceauMap
                  lat={origine.valide?.lat ?? position.latitude}
                  lon={origine.valide?.lon ?? position.longitude}
                  azimutDeg={capturedOrientation}
                />
              </div>

              <button
                type="button"
                onClick={() => setEtape("infos")}
                className="w-full rounded-2xl bg-green-600 py-3 text-base font-bold text-white transition-colors active:bg-green-700"
              >
                Valider mon orientation
              </button>
              <button
                type="button"
                onClick={reprendrePhoto}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
              >
                Mauvaise orientation — reprendre la photo
              </button>
            </div>
          )}

          {etape === "infos" && (
            <>
          {/* INFORMATIONS COMPLÉMENTAIRES */}
          <div className="mb-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Étage du séjour</label>
              <input
                type="number"
                inputMode="numeric"
                value={etage}
                onChange={(e) => setEtage(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-base font-semibold text-slate-900 placeholder:text-slate-400 bg-slate-50"
                placeholder="Ex : 4"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Dernier étage ?</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDernierEtage(true)}
                  className={
                    "rounded-xl py-3 text-sm font-semibold " +
                    (dernierEtage ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800")
                  }
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => setDernierEtage(false)}
                  className={
                    "rounded-xl py-3 text-sm font-semibold " +
                    (!dernierEtage ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-800")
                  }
                >
                  Non
                </button>
              </div>
            </div>
          </div>

          <button type="button" onClick={handleAnalyse} className="mt-4 w-full rounded-2xl bg-red-700 py-4 text-lg font-bold text-white shadow-lg shadow-red-700/20 active:bg-red-800 transition-colors">
            Lancer l’analyse de vis-à-vis
          </button>
          {analyseErreur && (
            <p className="mt-3 text-sm font-medium text-red-700">{analyseErreur}</p>
          )}
            </>
          )}

          {etape === "resultat" && (
            <div className="border-t border-slate-100 pt-4 animate-fadeIn">
              <p className="text-sm font-semibold text-red-700">Résultat de l’analyse</p>

              {analyseEnCours ? (
                /* a) chargement */
                <p className="mt-4 text-sm text-slate-500">
                  Analyse en cours… Lecture du terrain et des toits…
                </p>
              ) : analyseErreur ? (
                /* b) erreur */
                <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">
                  <p>{analyseErreur}</p>
                  <button
                    type="button"
                    onClick={handleAnalyse}
                    className="mt-3 w-full rounded-xl bg-red-700 py-2.5 text-sm font-bold text-white active:bg-red-800"
                  >
                    Réessayer
                  </button>
                </div>
              ) : analyse &&
                (!analyse.resultat ||
                  analyse.resultat.verdict.verdict === "INDETERMINE") ? (
                /* c) indéterminé */
                <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
                  <p className="text-lg font-bold text-slate-900">Analyse indéterminée</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {analyse.resultat?.verdict?.raison ??
                      analyse.validation?.raison ??
                      "Couverture insuffisante ou origine hors bâtiment. Aucun certificat ne peut être émis."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEtape("localisation")}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-100"
                  >
                    Modifier le point
                  </button>
                </div>
              ) : analyse && analyse.resultat ? (
                /* d) vrai résultat */
                <>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-4xl font-bold text-slate-900">
                        {Math.round(analyse.resultat.score.total)}/100
                      </p>
                      <p className="text-slate-600">Score Sans Vis-à-Vis</p>
                    </div>
                    <div
                      className={
                        "rounded-full px-4 py-2 font-bold " +
                        (analyse.resultat.verdict.verdict === "SANS_VIS_A_VIS"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-800")
                      }
                    >
                      {analyse.resultat.verdict.verdict === "SANS_VIS_A_VIS"
                        ? "Sans Vis-à-Vis® certifié"
                        : "Vis-à-vis"}
                    </div>
                  </div>

                  {analyse.resultat.score.libelle && (
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      {analyse.resultat.score.libelle}
                    </p>
                  )}
                  {analyse.resultat.score.scorePartiel && (
                    <p className="mt-1 text-xs text-slate-500">
                      Score partiel — photo insuffisante
                    </p>
                  )}

                  <p className="mt-3 text-sm text-slate-700">
                    {Number.isFinite(analyse.resultat.verdict.distanceM)
                      ? "Premier obstacle à " +
                        (analyse.resultat.verdict.distanceM as number)
                          .toFixed(1)
                          .replace(".", ",") +
                        " m"
                      : "Aucun obstacle détecté sur l'axe (200 m)"}
                  </p>

                  {analyse.resultat.verdict.analyseDegradee && (
                    <p className="mt-2 text-xs text-amber-700">
                      Analyse dégradée (donnée altimétrique de repli)
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}