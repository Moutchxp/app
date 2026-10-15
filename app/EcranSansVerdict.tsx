"use client";

/**
 * ÉCRAN « SANS VERDICT » du tunnel (écran résultat, cas c) : l'analyse n'a pas rendu de verdict certifiable. Titre, message
 * et bouton selon la CAUSE, ordre B → A → E → C → D (E = zone sans LiDAR, motif rendu par la route). Sorti de `app/page.tsx`
 * (lot ZONE SANS LiDAR, 15/10/2026) pour pouvoir être monté seul et capturé ; les cas A à D sont rendus à l'identique.
 */

import type { MotifSansResultat } from "./lib/tunnel/motifSansResultat";

/** Message d'une zone sans relevés LiDAR (lot ZONE SANS LiDAR, 15/10/2026). Il ne dit jamais POURQUOI les relevés manquent :
 *  une zone interdite de survol et une livraison IGN incomplète s'affichent à l'identique. */
export const MESSAGE_PAS_DE_LIDAR = "Nous ne disposons pas encore des relevés aériens nécessaires pour certifier cette adresse.";

/** Ce que l'écran lit de la réponse de /api/analyse (cf. `ReponseAnalyse`, `app/page.tsx`). */
export interface ReponseSansVerdict {
  validation: { valide: boolean; altitudeTerrainOrigineM?: unknown } & Record<string, unknown>;
  resultat: { verdict: { verdict: "SANS_VIS_A_VIS" | "VIS_A_VIS" | "INDETERMINE" } } | null;
  motif?: MotifSansResultat;
}

export function EcranSansVerdict({ analyse, onModifierPoint }: { analyse: ReponseSansVerdict; onModifierPoint: () => void }) {
  const v = analyse.validation;
  const r = analyse.resultat;
  let titre: string;
  let message: string;
  let bouton: string;
  if (r != null && r.verdict.verdict === "INDETERMINE") {
    // (B) Zone non couverte par les données de relief (trou de couverture LiDAR).
    titre = "Zone non couverte par nos données";
    message =
      "Cette zone n'est pas encore couverte par les données de relief nécessaires à l'analyse. Nous ne pouvons donc pas certifier la vue depuis ce point. Notre couverture s'étend régulièrement.";
    bouton = "Essayer un autre point";
  } else if (r == null && v.valide === false) {
    // (A) Point hors bâtiment / origine invalide.
    titre = "Point en dehors d'un bâtiment";
    message =
      "Le repère doit être posé à l'intérieur de votre bâtiment, à l'emplacement de votre fenêtre. Là, il est tombé sur une rue ou un espace extérieur.";
    bouton = "Repositionner le point";
  } else if (r == null && analyse.motif === "pas_de_lidar") {
    // (E) Zone SANS relevés LiDAR : aucune dalle ne couvre le point — déplacer le repère n'y changerait rien.
    titre = "Adresse pas encore couverte";
    message = MESSAGE_PAS_DE_LIDAR;
    bouton = "Choisir un autre point";
  } else if (r == null && v.valide === true && v.altitudeTerrainOrigineM == null) {
    // (C) Altitude du sol (MNT) indisponible à l'origine.
    titre = "Altitude du sol indisponible";
    message =
      "Nous n'avons pas l'altitude du terrain exactement à cet emplacement. Déplacez légèrement le repère sur votre bâtiment et réessayez.";
    bouton = "Ajuster le point";
  } else {
    // (D) Fallback (autre indétermination).
    titre = "Analyse indéterminée";
    message = "L'analyse n'a pas pu aboutir pour ce point. Réessayez ou déplacez légèrement le repère.";
    bouton = "Modifier le point";
  }
  return (
    <div className="mt-4 rounded-xl border border-svv-line bg-svv-field p-4">
      <p className="text-lg font-bold text-svv-ink">{titre}</p>
      <p className="mt-1 text-sm text-svv-muted">{message}</p>
      <button
        type="button"
        onClick={onModifierPoint}
        className="svv-btn svv-btn-outline mt-3"
      >
        {bouton}
      </button>
    </div>
  );
}
