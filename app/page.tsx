"use client";

import Image from "next/image";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import MapSelector from "./MapSelector";
import dynamic from "next/dynamic";
import { useOrigineValidation } from "./lib/useOrigineValidation";
import { cardinal } from "./lib/cardinal";
import { SceauCertifie } from "./components/SceauCertifie";
import type { Orientation, TypePaysage } from "./lib/svv/config";
import type { LibelleScore } from "./lib/svv/scoreTotal";
import {
  libelleScore,
  libelleTypePaysage,
  libelleOrientation,
  libelleRemarquables,
  libelleDegagement,
  type RemarquablesSource,
} from "./lib/libelles";

type Etape = "accueil" | "photo" | "localisation" | "orientation" | "infos" | "resultat";

// Forme (partielle) de la réponse succès de /api/analyse (cf. app/api/analyse/route.ts).
interface ReponseAnalyse {
  ok: true;
  validation: { valide: boolean; raison?: string } & Record<string, unknown>;
  // Miroir de ResultatComplet (lib/svv/analyse.ts) — verdict + score (famille1/2).
  resultat:
    | {
        verdict: {
          verdict: "SANS_VIS_A_VIS" | "VIS_A_VIS" | "INDETERMINE";
          distanceM: number | null;
          obstacle: {
            distanceM: number;
            altitudeSommetM: number | null;
            source: "LIDAR_HD" | "BD_TOPO" | "NONE";
          } | null;
          analyseDegradee: boolean;
          messageDegrade: string | null;
          raison: string;
        };
        score: {
          total: number;
          libelle: LibelleScore;
          scorePartiel: boolean;
          famille1: {
            total: number; // /50
            distance: number; // /20
            amplitude: number; // /20
            orientation: number; // /10
            detail: {
              amplitudePartA: number;
              amplitudePartB: number;
              penaliteFlancAppliquee: boolean;
              moyenneProfondeurM: number;
              pourcentageFaisceauxDegages: number;
              secteurOrientation: Orientation;
              bonusDernierEtage: number;
            };
          };
          famille2: {
            total: number; // /50
            typeDominant: number; // /25
            remarquables: number; // /15
            proprete: number; // /10
            scorePartiel: boolean;
            detail: {
              typeEnum: TypePaysage | null;
              remarquablesSource: RemarquablesSource;
              malusPropreteApplique: number;
            };
          };
        };
        distanceAxePrincipalM: number | null;
      }
    | null;
}

// Carte du faisceau (affichage seul), client-only.
const FaisceauMap = dynamic(() => import("./FaisceauMap"), { ssr: false });
// Miniature statique recolorable pour l'écran résultat (compagnon de FaisceauMap).
const FaisceauMini = dynamic(() => import("./FaisceauMini"), { ssr: false });

// Étapes affichées (présentation uniquement) sur l'écran « Analyse en cours ».
// N'a AUCUN lien avec le pipeline réel : c'est une checklist animée par minuteur.
const ETAPES_ANALYSE = [
  "Localisation",
  "Obstacles",
  "Altitudes terrain",
  "Hauteurs des bâtiments",
  "Analyse photo (IA)",
  "Calcul du résultat",
] as const;

type ResultatReussi = NonNullable<ReponseAnalyse["resultat"]>;

/**
 * Écran résultat 7A (certifié) / 7B (vis-à-vis) — PRÉSENTATION uniquement.
 * Ne lit que des champs déjà présents dans la réponse ; aucun calcul de verdict/score.
 */
/* onClick TODO (écrans 8 / 10 pas encore construits) — non câblé volontairement. */
const todoEcranAVenir = () => undefined;

function EcranResultat({
  resultat,
  photo,
  lat,
  lon,
  azimutDeg,
  onRecommencer,
}: {
  resultat: ResultatReussi;
  photo: string | null;
  lat: number;
  lon: number;
  azimutDeg: number | null;
  onRecommencer: () => void;
}) {
  const certifie = resultat.verdict.verdict === "SANS_VIS_A_VIS";
  const score = Math.round(resultat.score.total);
  const C = 2 * Math.PI * 44; // circonférence de la jauge (rayon 44)
  const offset = C * (1 - Math.max(0, Math.min(100, resultat.score.total)) / 100);
  const arc = certifie ? "var(--color-svv-green)" : "var(--color-svv-red)";
  const f1 = resultat.score.famille1;
  const f2 = resultat.score.famille2;

  const distanceM = resultat.verdict.distanceM;
  const distanceTxt = Number.isFinite(distanceM)
    ? `${Math.round(distanceM as number)} m`
    : "Aucun (≥ 200 m)";

  const badges = [
    libelleTypePaysage(f2.detail.typeEnum),
    libelleDegagement(f1.detail.pourcentageFaisceauxDegages),
    libelleOrientation(f1.detail.secteurOrientation),
    libelleRemarquables(f2.detail.remarquablesSource),
  ].filter((b): b is string => b != null);

  return (
    <div className="flex flex-1 flex-col">
      {/* 1. EN-TÊTE — 7A rouge / 7B sombre ; bandeau haut, icône + titre 2 lignes centrés */}
      <div
        className={
          "-mx-6 -mt-6 mb-5 flex items-center gap-3.5 rounded-t-3xl px-6 py-4 text-white " +
          (certifie ? "bg-svv-red" : "bg-svv-ink")
        }
      >
        {certifie ? (
          // sceau officiel « certifié » (composant SceauCertifie, vectorisé, ratio haut → dimensionné par la hauteur)
          <SceauCertifie className="h-12 w-auto shrink-0 text-white" />
        ) : (
          // triangle d'alerte avec point d'exclamation (inchangé)
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3.2L21.5 20H2.5z" />
            <path d="M12 9.5v4.5" />
            <path d="M12 17.4h.01" />
          </svg>
        )}
        <span className="text-2xl font-extrabold uppercase leading-[1.05] tracking-tight">
          {certifie ? (
            <>
              Sans Vis-à-Vis®
              <br />
              certifié
            </>
          ) : (
            <>
              Vis-à-vis
              <br />
              détecté
            </>
          )}
        </span>
      </div>

      {/* 2. JAUGE + OBSTACLE */}
      <div className="flex items-start gap-5">
        <div className="shrink-0 text-center">
          <div className="relative h-28 w-28">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-svv-line)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke={arc}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <div className="flex items-baseline">
                <span className="text-3xl font-extrabold text-svv-ink">{score}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-svv-muted">/100</span>
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] font-semibold leading-tight text-svv-muted">
            {resultat.score.scorePartiel ? "Score partiel — photo inexploitable" : "Score global"}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-svv-muted">Premier obstacle réel</p>
          <p className="text-2xl font-extrabold text-svv-ink">{distanceTxt}</p>
          <p className="mt-2 text-xs text-svv-muted">Distance minimale requise</p>
          <p className="text-base font-bold text-svv-gray">40 m</p>
        </div>
      </div>

      {/* 3. ZONE CENTRALE — bascule selon verdict */}
      {certifie ? (
        <div className="mt-6">
          <p className="text-sm font-bold text-svv-ink">Qualité de votre vue</p>
          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span key={b} className="svv-pill">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm font-bold text-svv-ink">Obstacle détecté :</p>
          <p className="mt-1 text-sm text-svv-gray">
            Bâtiment à {Number.isFinite(distanceM) ? Math.round(distanceM as number) : "—"}{" "}
            mètres dans l&apos;axe de vision.
          </p>
        </div>
      )}

      {/* 4. DEUX VIGNETTES — même boîte, côte à côte */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div>
          <p className="svv-label mb-1">Carte du faisceau</p>
          <div className="h-32 overflow-hidden rounded-xl border border-svv-line bg-svv-field">
            {/* Vraie miniature (plan + faisceau recoloré) — compagnon statique de FaisceauMap */}
            <FaisceauMini lat={lat} lon={lon} azimutDeg={azimutDeg} couleur={certifie ? "#2e9e5b" : "#a30402"} />
          </div>
        </div>
        <div>
          <p className="svv-label mb-1">Votre photo</p>
          <div className="relative h-32 overflow-hidden rounded-xl border border-svv-line bg-svv-field">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Vue capturée" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-svv-muted">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="7" width="18" height="13" rx="2" />
                  <path d="M8 7l2-3h4l2 3" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. NOTE (le « score partiel » vit sous le cercle, plus ici) */}
      {resultat.verdict.analyseDegradee && (
        <p className="mt-3 text-xs text-amber-700">
          Analyse dégradée (donnée altimétrique de repli)
        </p>
      )}

      {/* 6. BOUTONS + LIEN — gap avant boutons = même rythme que les autres sections */}
      <div className="mt-6">
        {certifie ? (
          <>
            <button type="button" onClick={todoEcranAVenir} className="svv-btn svv-btn-primary">
              <SceauCertifie className="h-7 w-auto shrink-0 text-white" />
              Obtenir mon certificat
            </button>
            <button type="button" onClick={todoEcranAVenir} className="svv-btn svv-btn-outline mt-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v18h18" />
                <rect x="7" y="11" width="3" height="7" />
                <rect x="13" y="7" width="3" height="11" />
              </svg>
              Calculer la plus-value de ma vue
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onRecommencer} className="svv-btn svv-btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Refaire le test
            </button>
            <button type="button" onClick={todoEcranAVenir} className="svv-btn svv-btn-outline mt-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v10h14V10" />
              </svg>
              Estimation immobilière
            </button>
          </>
        )}
        <button type="button" onClick={onRecommencer} className="svv-link mt-1">
          ← Retour à l&apos;accueil
        </button>
      </div>
    </div>
  );
}

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
  // Étape animée de la checklist « Analyse en cours » (présentation seule, pas le pipeline).
  const [analyseEtape, setAnalyseEtape] = useState(0);

  // Minuteur d'animation : avance la checklist tant que l'analyse réelle tourne.
  // Reste sur la dernière étape « en cours » jusqu'à l'arrivée du vrai résultat.
  // Ne déclenche NI ne modifie l'analyse (aucun appel réseau, aucune logique de verdict).
  useEffect(() => {
    if (!analyseEnCours) {
      setAnalyseEtape(0);
      return;
    }
    const id = setInterval(() => {
      setAnalyseEtape((e) => Math.min(e + 1, ETAPES_ANALYSE.length - 1));
    }, 700);
    return () => clearInterval(id);
  }, [analyseEnCours]);
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

  // L'écran « vrai résultat » (7A/7B) est pleine hauteur comme l'accueil/chargement.
  const resultatReussi =
    etape === "resultat" &&
    !analyseEnCours &&
    !analyseErreur &&
    analyse?.resultat != null &&
    analyse.resultat.verdict.verdict !== "INDETERMINE";

  return (
    <main className="flex min-h-[100dvh] flex-col bg-slate-100 px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <section
          className={
            "rounded-3xl bg-white p-6 shadow" +
            (etape === "accueil" ||
            (etape === "resultat" && analyseEnCours) ||
            resultatReussi
              ? " flex flex-1 flex-col"
              : "")
          }
        >
          {etape === "accueil" && (
            <div className="flex flex-1 flex-col">
              {/* Logo — uniquement sur l'accueil (firmware écran 1) */}
              <div className="mb-6 flex justify-center">
                <Image
                  src="/images/logo-svv-lockup.png"
                  alt="Sans Vis-à-Vis®"
                  width={1840}
                  height={413}
                  priority
                  style={{ width: "auto", height: "auto", maxWidth: "330px" }}
                />
              </div>

              <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight text-svv-ink">
                Découvrez <span className="text-svv-red">la vraie qualité</span> de votre vue
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-svv-muted">
                {"Une analyse objective, basée sur la géolocalisation, les altitudes et l'intelligence artificielle."}
              </p>

              {/* Skyline (asset stylisé) — bande pleine largeur qui prend la hauteur
                  de la zone basse, sous le sous-titre et au-dessus des boutons */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/skyline.svg"
                alt=""
                aria-hidden="true"
                className="-mx-6 mt-6 mb-9 max-w-none w-[calc(100%+3rem)] flex-1 object-contain object-bottom"
              />

              <button
                type="button"
                onClick={() => setEtape("photo")}
                className="svv-btn svv-btn-primary relative"
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
  <div className="animate-fadeIn">
    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
      Localisation
    </h1>
    <p className="mt-2 mb-4 text-sm leading-relaxed text-svv-muted">
      Saisissez votre adresse, puis calez précisément le repère rouge sur la façade concernée.
    </p>

    <input
      value={address}
      onChange={onChangeAdresse}
      className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
      placeholder="Saisissez l'adresse, ou déplacez le repère sur la carte"
    />
    {suggestions.length > 0 && (
      <ul className="mt-2 mb-3 overflow-hidden rounded-xl border border-svv-line bg-white shadow-sm divide-y divide-svv-line">
        {suggestions.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => selectSuggestion(s)}
              className="w-full px-3 py-2 text-left text-sm text-svv-ink active:bg-svv-field"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    )}
    {addressInfo && (
      <p className="mt-2 mb-3 text-xs text-svv-muted">{addressInfo}</p>
    )}

    <div className="mt-3 overflow-hidden rounded-2xl border border-svv-line">
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
    </div>
    <p className="mt-2 text-xs text-svv-muted">
      🎯 Déplacez la carte pour caler précisément le repère rouge sur la façade de votre pièce.
    </p>

    {/* Tant que l'utilisateur n'a pas déplacé le point : consigne. */}
    {!pointDeplace && (
      <div className="mt-3 rounded-xl border border-svv-red/30 bg-svv-red/5 p-3 text-sm font-semibold text-svv-red">
        📍 Placez précisément le point GPS sur la fenêtre du point de vue que vous voulez faire valider : déplacez la carte pour amener le repère rouge sur cette fenêtre.
      </div>
    )}

    {/* Validation du point d'origine (PostGIS via /api/origine) — après 1er déplacement */}
    {pointDeplace && origine.enCours && (
      <p className="mt-3 text-sm text-svv-muted">Vérification du point…</p>
    )}

    {pointDeplace && !origine.enCours && origine.resultat && !origine.valide && (
      <div
        className={
          "mt-3 rounded-xl border p-3 text-sm font-medium " +
          (origine.resultat.statut === "VALIDE"
            ? "border-svv-green/40 bg-svv-green-soft text-svv-green-ink"
            : origine.resultat.statut === "HORS_BATIMENT"
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-svv-red/30 bg-svv-red/5 text-svv-red")
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
        "mt-4 " +
        (pointDeplace && origine.resultat?.statut === "VALIDE" && !origine.valide
          ? "svv-btn svv-btn-primary"
          : "svv-btn cursor-not-allowed bg-svv-field text-svv-muted")
      }
    >
      Valider ce point d&apos;origine
    </button>
  </div>
)}

          {/* ÉCRAN 3 : VALIDATION DE L'ORIENTATION */}
{etape === "orientation" && (
  <div className="animate-fadeIn">
    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
      Vérifiez le faisceau d&apos;analyse
    </h1>
    <p className="mt-2 mb-4 text-sm leading-relaxed text-svv-muted">
      Le faisceau rouge correspond-il bien à l&apos;axe de votre vue ?
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
      className="svv-btn svv-btn-primary"
    >
      Valider mon orientation
    </button>
    <button
      type="button"
      onClick={reprendrePhoto}
      className="svv-btn svv-btn-outline mt-2"
    >
      Mauvaise orientation — reprendre la photo
    </button>
  </div>
)}

{etape === "infos" && (
  <div className="animate-fadeIn">
    <h1 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-svv-ink">
      Votre logement
    </h1>
    <p className="mt-2 mb-4 text-sm leading-relaxed text-svv-muted">
      Encore deux infos avant de lancer l&apos;analyse.
    </p>

    {/* INFORMATIONS COMPLÉMENTAIRES */}
    <div className="mb-4 grid grid-cols-2 gap-4">
      <div>
        <label className="mb-1 block text-sm font-semibold text-svv-gray">Étage du séjour</label>
        <input
          type="number"
          inputMode="numeric"
          value={etage}
          onChange={(e) => setEtage(e.target.value)}
          className="w-full rounded-xl border border-svv-line bg-white p-3 text-base font-semibold text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
          placeholder="Ex : 4"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-svv-gray">Dernier étage ?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDernierEtage(true)}
            className={
              "rounded-xl py-3 text-sm font-semibold " +
              (dernierEtage ? "bg-svv-ink text-white" : "border border-svv-line bg-white text-svv-ink")
            }
          >
            Oui
          </button>
          <button
            type="button"
            onClick={() => setDernierEtage(false)}
            className={
              "rounded-xl py-3 text-sm font-semibold " +
              (!dernierEtage ? "bg-svv-ink text-white" : "border border-svv-line bg-white text-svv-ink")
            }
          >
            Non
          </button>
        </div>
      </div>
    </div>

    <button type="button" onClick={handleAnalyse} className="svv-btn svv-btn-primary mt-4">
      Lancer l&apos;analyse de vis-à-vis
    </button>
    {analyseErreur && (
      <p className="mt-3 text-sm font-medium text-svv-red">{analyseErreur}</p>
    )}
  </div>
)}

{etape === "resultat" && (
  <div className={"animate-fadeIn" + (analyseEnCours || resultatReussi ? " flex flex-1 flex-col" : "")}>
    {!analyseEnCours && !resultatReussi && (
      <p className="text-sm font-semibold text-svv-muted">Résultat de l&apos;analyse</p>
    )}

    {analyseEnCours ? (
      /* a) chargement — écran « Analyse en cours » (firmware #6) */
      <div className="flex flex-1 flex-col">
        {/* Logo (identique à l'accueil) */}
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/logo-svv-lockup.png"
            alt="Sans Vis-à-Vis®"
            width={1840}
            height={413}
            priority
            style={{ width: "auto", height: "auto", maxWidth: "330px" }}
          />
        </div>

        <h1 className="text-[1.4rem] font-extrabold leading-tight tracking-tight text-svv-ink">
          Analyse de votre vue en cours…
        </h1>

        {/* Checklist animée (présentation seule) */}
        <ul className="mt-6 flex flex-col gap-3">
          {ETAPES_ANALYSE.map((label, i) => {
            const fait = i < analyseEtape;
            const enCours = i === analyseEtape;
            return (
              <li key={label} className="flex items-center gap-3">
                {fait ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-svv-green-soft">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-svv-green"
                      aria-hidden="true"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : enCours ? (
                  <span
                    className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-svv-red border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border-2 border-svv-line"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    "text-sm " +
                    (fait || enCours ? "font-medium text-svv-ink" : "text-svv-muted")
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Barre de progression + mention, ancrées en bas */}
        <div className="mt-auto pt-8">
          <div className="h-2 w-full overflow-hidden rounded-full bg-svv-line">
            <div
              className="h-full rounded-full bg-svv-green transition-all duration-500"
              style={{
                width: `${Math.min(95, Math.round(((analyseEtape + 0.5) / ETAPES_ANALYSE.length) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-svv-muted">
            Cela peut prendre quelques secondes.
          </p>
        </div>
      </div>
    ) : analyseErreur ? (
      /* b) erreur */
      <div className="mt-4 rounded-xl border border-svv-red/30 bg-svv-red/5 p-3 text-sm font-medium text-svv-red">
        <p>{analyseErreur}</p>
        <button
          type="button"
          onClick={handleAnalyse}
          className="svv-btn svv-btn-primary mt-3"
        >
          Réessayer
        </button>
      </div>
    ) : analyse &&
      (!analyse.resultat ||
        analyse.resultat.verdict.verdict === "INDETERMINE") ? (
      /* c) indéterminé */
      <div className="mt-4 rounded-xl border border-svv-line bg-svv-field p-4">
        <p className="text-lg font-bold text-svv-ink">Analyse indéterminée</p>
        <p className="mt-1 text-sm text-svv-muted">
          {analyse.resultat?.verdict?.raison ??
            analyse.validation?.raison ??
            "Couverture insuffisante ou origine hors bâtiment. Aucun certificat ne peut être émis."}
        </p>
        <button
          type="button"
          onClick={() => setEtape("localisation")}
          className="svv-btn svv-btn-outline mt-3"
        >
          Modifier le point
        </button>
      </div>
    ) : analyse && analyse.resultat ? (
      /* d) vrai résultat — écrans 7A (certifié) / 7B (vis-à-vis) */
      <EcranResultat
        resultat={analyse.resultat}
        photo={photo}
        lat={origine.valide?.lat ?? position.latitude}
        lon={origine.valide?.lon ?? position.longitude}
        azimutDeg={capturedOrientation}
        onRecommencer={() => setEtape("accueil")}
      />
    ) : null}
  </div>
)}
        </section>
      </div>
    </main>
  );
}