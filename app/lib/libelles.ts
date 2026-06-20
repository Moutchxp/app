/**
 * Libellés FR (PRÉSENTATION uniquement) — tables de correspondance enum → texte.
 * Aucun calcul, aucune incidence sur le verdict/score : seulement des lookups.
 * Les enums sont importés (type-only) depuis la logique Bloc A pour rester en miroir.
 */
import type { TypePaysage, Orientation } from "./svv/config";
import type { LibelleScore } from "./svv/scoreTotal";

/** Libellé du score global. null → pas de libellé (score < seuil « Excellente »). */
export function libelleScore(l: LibelleScore): string | null {
  switch (l) {
    case "EXCEPTIONNELLE":
      return "Vue exceptionnelle";
    case "EXCELLENTE":
      return "Excellente vue";
    default:
      return null;
  }
}

const TYPE_PAYSAGE_FR: Record<TypePaysage, string> = {
  mer_panoramique: "Vue mer / panorama",
  fleuve_lac: "Fleuve ou lac",
  nature_parc: "Nature / parc",
  espaces_verts: "Espaces verts",
  urbain_harmonieux: "Urbain harmonieux",
  urbain_standard: "Urbain",
  urbain_dense: "Urbain dense",
};

/** Type de paysage dominant. null si non déterminé (photo insuffisante). */
export function libelleTypePaysage(t: TypePaysage | null): string | null {
  return t ? TYPE_PAYSAGE_FR[t] : null;
}

const ORIENTATION_FR: Record<Orientation, string> = {
  N: "Nord",
  NE: "Nord-Est",
  E: "Est",
  SE: "Sud-Est",
  S: "Sud",
  SO: "Sud-Ouest",
  O: "Ouest",
  NO: "Nord-Ouest",
};

/** Orientation cardinale du secteur de vue. */
export function libelleOrientation(o: Orientation): string {
  return ORIENTATION_FR[o];
}

export type RemarquablesSource = "monument" | "facades" | "aucun";

/** Élément remarquable de la vue. null si « aucun » (pas de badge). */
export function libelleRemarquables(s: RemarquablesSource): string | null {
  switch (s) {
    case "monument":
      return "Monument remarquable";
    case "facades":
      return "Façades historiques";
    default:
      return null;
  }
}

/**
 * Niveau de dégagement dérivé de la part de faisceaux dégagés.
 * La logique renvoie une FRACTION (0–1) ; on tolère aussi 0–100 par sécurité.
 * Libellés d'affichage ajustables — aucune incidence sur le score.
 */
export function libelleDegagement(pourcentageFaisceauxDegages: number): string {
  const p =
    pourcentageFaisceauxDegages <= 1
      ? pourcentageFaisceauxDegages * 100
      : pourcentageFaisceauxDegages;
  if (p >= 75) return "Très dégagé";
  if (p >= 50) return "Bien dégagé";
  if (p >= 25) return "Partiellement dégagé";
  return "Peu dégagé";
}
