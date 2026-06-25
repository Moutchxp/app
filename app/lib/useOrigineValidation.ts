"use client";

import { useCallback, useState } from "react";
import type { ModeOrigine } from "./svv/config";

export type StatutOrigine = "VALIDE" | "HORS_BATIMENT" | "SANS_BATIMENT";

// Contrat de sortie de /api/origine (défini une seule fois).
export interface ReponseOrigine {
  statut: StatutOrigine;
  valide: boolean;
  message: string;
  dansBatiment: boolean;
  distanceAuBatimentM: number;
  batimentOrigine: { id: number; cleabs: string } | null;
  altitudeTerrainOrigineM: number | null;
  pointSnappeWgs84: { lat: number; lon: number } | null; // point recalé sur la bordure (pour V2 : affichage)
  pointSnappeL93: { x: number; y: number } | null;
}

export interface OrigineValidee {
  lat: number;
  lon: number;
  batimentOrigine: { id: number; cleabs: string } | null;
  altitudeTerrainOrigineM: number | null;
}

/**
 * Glue d'appel à /api/origine (→ validerOrigine → PostGIS) + machine d'état
 * « validable » (live) ≠ « validé » (figé au clic). UNE seule logique, partageable.
 */
export function useOrigineValidation() {
  const [resultat, setResultat] = useState<ReponseOrigine | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [valide, setValide] = useState<OrigineValidee | null>(null);

  // Évaluation live (au moveend) : statut "validable". Réinitialise le verrou.
  const evaluer = useCallback(async (lat: number, lon: number, mode: ModeOrigine = "semi_auto") => {
    setValide(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/origine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon, mode }),
      });
      setResultat((await res.json()) as ReponseOrigine);
    } catch {
      setResultat(null);
    } finally {
      setEnCours(false);
    }
  }, []);

  // Confirmation au clic : fige le point si le statut courant est VALIDE.
  const confirmer = useCallback(
    (lat: number, lon: number) => {
      if (resultat?.statut !== "VALIDE") return;
      setValide({
        lat,
        lon,
        batimentOrigine: resultat.batimentOrigine,
        altitudeTerrainOrigineM: resultat.altitudeTerrainOrigineM,
      });
    },
    [resultat],
  );

  const reset = useCallback(() => {
    setResultat(null);
    setValide(null);
    setEnCours(false);
  }, []);

  return { resultat, enCours, valide, evaluer, confirmer, reset };
}
