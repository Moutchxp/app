"use client";

import Image from "next/image";
import { useState } from "react";
import MapSelector from "./MapSelector";

export default function Home() {
  const [showResult, setShowResult] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [address, setAddress] = useState("");

  const [position, setPosition] = useState({
    latitude: 48.8566,
    longitude: 2.3522,
  });

  // SEULE MODIFICATION DU MOTEUR DE CALCUL ICI
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
        body: JSON.stringify({
          latitude,
          longitude,
        }),
      });

      const buildingData = await buildingResponse.json();
      console.log("Réponse API bâtiment :", buildingData);

    } catch {
      setAddress(
        "Adresse imprécise - positionnez le repère sur votre logement"
      );
    }
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
        alert(
          "Impossible d'obtenir votre position. Une position par défaut va être affichée."
        );
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
                  getAddressFromGPS(
                    newPosition.latitude,
                    newPosition.longitude
                  );
                }}
              />

              <p className="mt-2 text-sm text-slate-500">
                Déplacez la carte sous le repère rouge pour placer précisément la
                fenêtre du séjour.
              </p>

              <p className="mt-2 text-xs text-slate-400">
                Position sélectionnée : {position.latitude.toFixed(6)},{" "}
                {position.longitude.toFixed(6)}
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
            <button
              type="button"
              className="rounded-xl bg-red-700 py-3 font-semibold text-white"
            >
              Oui
            </button>

            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white py-3 font-semibold"
            >
              Non
            </button>
          </div>

          <label className="mb-2 block font-semibold">Photo de la vue</label>

          <input className="mb-6 w-full" type="file" />

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
            <p className="text-sm font-semibold text-red-700">
              Résultat de l’analyse
            </p>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-slate-900">92/100</p>
                <p className="text-slate-600">Score Sans Vis-à-Vis</p>
              </div>

              <div className="rounded-full bg-green-100 px-4 py-2 font-bold text-green-700">
                Certifié
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-100 p-4">
              <p className="font-semibold">Premier obstacle réel</p>
              <p className="text-3xl font-bold text-red-700">83 m</p>
              <p className="text-sm text-slate-600">
                Minimum requis : 40 mètres
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}