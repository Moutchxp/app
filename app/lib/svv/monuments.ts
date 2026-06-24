// Table curée des monuments de renommée mondiale (Strate 2).
// Coordonnées Lambert-93 (EPSG:2154) et courbe de distance RECOPIÉES VERBATIM depuis la
// table Strate 2 de SPEC_score_qualite_vue.md. Aucune logique ici — données uniquement.
import type { MonumentId } from "./contratIaPhoto";
import type { MonumentCandidatFusionne } from "./entreePaysage";

/** Une entrée monument : id stable + position L93 + courbe de distance (+ nom debug). */
export type MonumentL93 = {
  id: MonumentId;
  nom: string; // libellé lisible — debug uniquement, n'entre dans aucun calcul
  X_L93: number;
  Y_L93: number;
  courbe: MonumentCandidatFusionne["courbe"];
};

/** Les 14 monuments (verbatim spec Strate 2). */
export const MONUMENTS_L93: readonly MonumentL93[] = [
  { id: "EIFFEL", nom: "Tour Eiffel", X_L93: 648235.8, Y_L93: 6862268.4, courbe: "EIFFEL" },
  { id: "SACRE_COEUR", nom: "Sacré-Cœur", X_L93: 651829.2, Y_L93: 6865387.7, courbe: "SACRE_COEUR" },
  { id: "NOTRE_DAME", nom: "Notre-Dame de Paris", X_L93: 652294.0, Y_L93: 6861631.9, courbe: "AUTRES" },
  { id: "ARC_TRIOMPHE", nom: "Arc de Triomphe", X_L93: 648292.2, Y_L93: 6863981.5, courbe: "AUTRES" },
  { id: "LOUVRE", nom: "Louvre (Pyramide)", X_L93: 651404.5, Y_L93: 6862488.9, courbe: "AUTRES" },
  { id: "PANTHEON", nom: "Panthéon", X_L93: 652033.9, Y_L93: 6860882.4, courbe: "AUTRES" },
  { id: "INVALIDES", nom: "Invalides (Dôme)", X_L93: 649554.6, Y_L93: 6861876.4, courbe: "AUTRES" },
  { id: "OPERA_GARNIER", nom: "Opéra Garnier", X_L93: 650989.6, Y_L93: 6863756.7, courbe: "AUTRES" },
  { id: "CONCIERGERIE_SAINTE_CHAPELLE", nom: "Conciergerie/Sainte-Chapelle", X_L93: 651959.6, Y_L93: 6861928.3, courbe: "AUTRES" },
  { id: "TOUR_SAINT_JACQUES", nom: "Tour Saint-Jacques", X_L93: 652235.2, Y_L93: 6862153.9, courbe: "AUTRES" },
  { id: "POMPIDOU", nom: "Centre Pompidou", X_L93: 652474.2, Y_L93: 6862493.4, courbe: "AUTRES" },
  { id: "GRAND_PALAIS", nom: "Grand Palais", X_L93: 649565.4, Y_L93: 6863120.7, courbe: "AUTRES" },
  { id: "SAINT_DENIS", nom: "Basilique Saint-Denis (93)", X_L93: 653084.8, Y_L93: 6870824.1, courbe: "AUTRES" },
  { id: "VERSAILLES", nom: "Château de Versailles (78)", X_L93: 635400.6, Y_L93: 6856445.9, courbe: "AUTRES" },
];
