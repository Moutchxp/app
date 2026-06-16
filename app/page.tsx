"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import MapSelector from "./MapSelector";

export default function Home() {
  const [showResult, setShowResult] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [address, setAddress] = useState("");

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Moteur de calcul de l'adresse et validation bâtiment
  async function getAddressFromGPS(latitude: number, longitude: number) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            "User-Agent": "SansVisAVisMVP/1.0 (a.jorel@sansvisavis.com)"
          }
        }
      );

      const data = await response.json();

      if (data && data.display_name) {
        const number = data.address?.house_number || "";
        const road = data.address?.road || data.address?.pedestrian || "";
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        
        if (number && road && city) {
          setAddress(`${number} ${road}, ${city}`);
        } else if (data.address?.building || road) {
          const shortAddress = `${number} ${road}`.trim();
          setAddress(shortAddress || data.display_name);
        } else {
          setAddress("Point GPS sélectionné");
        }
      }

      const buildingResponse = await fetch("/api/check-building", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ latitude, longitude }),
      });

      const buildingData = await buildingResponse.json();
      console.log("Réponse API bâtiment :", buildingData);

    } catch {
      setAddress("Adresse imprécise - positionnez le repère sur votre logement");
    }
  }

  // Écoute du gyroscope et de la boussole
  // Écoute du gyroscope et de la boussole ajustée pour smartphone vertical
  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      // pitch (beta) : inclinaison avant/arrière | roll (gamma) : inclinaison gauche/droite
      const pitch = event.beta ? Math.round(event.beta) : 0;
      const roll = event.gamma ? Math.round(event.gamma) : 0;
      
      let heading = 0;
      if ('webkitCompassHeading' in event) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha) {
        heading = 360 - event.alpha;
      }
      heading = Math.round(heading);

      setAngles({ pitch, roll, heading });

      // AJUSTEMENT DES AXES : L'utilisateur tient son téléphone face à la fenêtre (vertical)
      // Le roll (gauche/droite) doit rester aligné avec l'horizon (0° ± 10°)
      // Le pitch (avant/arrière) doit rester perpendiculaire au sol (90° ± 10° ou -90° ± 10°)
      const isRollCorrect = Math.abs(roll) <= 10;
      const isPitchCorrect = Math.abs(pitch - 90) <= 10 || Math.abs(pitch + 90) <= 10;

      setIsLevel(isRollCorrect && isPitchCorrect);
    }

    if (isCameraActive) {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === "granted") {
              window.addEventListener("deviceorientation", handleOrientation);
            }
          })
          .catch(console.error);
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
      }
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [isCameraActive]);

  // Allumer la caméra du smartphone
  async function startCamera() {
    setIsCameraActive(true);
    setPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Utilise la caméra arrière
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erreur accès caméra :", err);
      alert("Impossible d'accéder à la caméra arrière.");
      setIsCameraActive(false);
    }
  }

  // Capturer la photo uniquement si le niveau est au vert
  function capturePhoto() {
    if (!isLevel) return; // Sécurité : bloque la capture si hors tolérance

    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/jpeg"));
        setCapturedOrientation(angles.heading); // Sauvegarde l'orientation exacte (Azimut) de la fenêtre !
        stopCamera();
      }
    }
  }

  // Éteindre la caméra
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsCameraActive(false);
  }

  function handleLocate() {
    setAddress("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newPosition = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setPosition(newPosition);
        setShowMap(true);
        await getAddressFromGPS(newPosition.latitude, newPosition.longitude);
      },
      () => {
        alert("Impossible d'obtenir votre position. Une position par défaut va être affichée.");
        setShowMap(true);
      }
    );
  }

  function handleAnalyse() {
    setShowResult(true);
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
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
          <h1 className="mb-2 text-3xl font-bold text-slate-900">
            Analyse Sans Vis-à-Vis®
          </h1>

          <p className="mb-6 text-slate-600">
            Vérifiez objectivement la qualité de votre vue grâce à la
            localisation, l’orientation et la photo du séjour.
          </p>

          <label className="mb-2 block font-semibold">Adresse du bien</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-300 p-3"
            placeholder="Ex : 8 rue Denfert-Rochereau"
          />

          <button
            type="button"
            onClick={handleLocate}
            className="mb-5 w-full rounded-xl bg-red-700 py-3 font-bold text-white"
          >
            Localiser mon logement
          </button>

          {showMap && (
            <div className="mb-5">
              <MapSelector
                latitude={position.latitude}
                longitude={position.longitude}
                onPositionChange={(newPosition) => {
                  setPosition(newPosition);
                  getAddressFromGPS(newPosition.latitude, newPosition.longitude);
                }}
              />
              <p className="mt-2 text-sm text-slate-500">
                Déplacez la carte sous le repère rouge pour placer précisément la fenêtre du séjour.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Position sélectionnée : {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
              </p>
            </div>
          )}

          <label className="mb-2 block font-semibold">Étage du séjour</label>
          <input
            type="number"
            className="mb-4 w-full rounded-xl border border-slate-300 p-3"
            placeholder="Ex : 4"
          />

          <label className="mb-2 block font-semibold">Dernier étage ?</label>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <button type="button" className="rounded-xl bg-red-700 py-3 font-semibold text-white">Oui</button>
            <button type="button" className="rounded-xl border border-slate-300 bg-white py-3 font-semibold">Non</button>
          </div>

          {/* ZONE PHOTO INTELLIGENTE METTEUR À NIVEAU */}
          <label className="mb-2 block font-semibold">Photo de la vue (Séjour)</label>
          
          <div className="mb-6">
            {!isCameraActive && !photo && (
              <button
                type="button"
                onClick={startCamera}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                📸 Ouvrir l'appareil photo intelligent
              </button>
            )}

            {isCameraActive && (
              <div className="relative overflow-hidden rounded-2xl bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full h-64 object-cover" />
                
                {/* Interface du Niveau à bulle en overlay sur l'image */}
                <div className="absolute inset-x-0 top-4 flex flex-col items-center justify-center gap-1 bg-black/40 py-2 text-white text-xs">
                  <div className={`px-3 py-1 rounded-full font-bold ${isLevel ? 'bg-green-600' : 'bg-red-600'}`}>
                    {isLevel ? "🟢 Téléphone Horizontal" : "🔴 Ajustez l'inclinaison (Marge ±3%)"}
                  </div>
                  <p>Axe latéral : {angles.roll}° | Axe vertical : {angles.pitch}°</p>
                </div>

                <div className="absolute bottom-4 inset-x-0 flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={!isLevel}
                    className={`px-6 py-3 rounded-full font-bold text-white shadow-lg transition ${
                      isLevel ? 'bg-green-600 active:bg-green-700' : 'bg-slate-500 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    Prendre la photo
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-3 bg-slate-800 text-white rounded-full font-medium shadow-lg"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {photo && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-300">
                <img src={photo} alt="Vue séjour capturée" className="w-full h-48 object-cover" />
                <div className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[11px] px-2 py-1 rounded-md">
                  🧭 Orientation enregistrée : {capturedOrientation}° (Azimut)
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="absolute top-2 right-2 bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow"
                >
                  Refaire la photo
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAnalyse}
            className="w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white"
          >
            Lancer l’analyse
          </button>
        </section>

        {showResult && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-semibold text-red-700">Résultat de l’analyse</p>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-slate-900">92/100</p>
                <p className="text-slate-600">Score Sans Vis-à-Vis</p>
              </div>
              <div className="rounded-full bg-green-100 px-4 py-2 font-bold text-green-700">Certifié</div>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-100 p-4">
              <p className="font-semibold">Premier obstacle réel</p>
              <p className="text-3xl font-bold text-red-700">83 m</p>
              <p className="text-sm text-slate-600">Minimum requis : 40 mètres</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}