import type { MonumentId, FractionVisible, NuisanceMajeure, NuisanceMineure } from './contratIaPhoto';

// Entrée d'un monument candidat, après fusion géométrie + IA.
// distanceM et courbe viennent de la géométrie ; fractionVisible vient de l'IA.
export interface MonumentCandidatFusionne {
  id: MonumentId;
  distanceM: number;                       // distance L93 entre origine et monument (géométrie)
  courbe: 'EIFFEL' | 'SACRE_COEUR' | 'AUTRES'; // courbe de distance (géométrie, table Strate 2)
  fractionVisible: FractionVisible;        // critère A (IA photo)
}

// Entrée fusionnée complète du calcul de score Famille 2.
export interface EntreePaysage {
  photoExploitable: boolean;

  // Strate 1 — couverture valorisante (géométrie) :
  // nombre de faisceaux du cône central (±60°) touchant au moins un élément valorisant.
  faisceauxValorisants: number;
  faisceauxConeTotal: number;              // nombre total de faisceaux du cône central

  // Strate 2 — monuments candidats déjà fusionnés (géométrie + IA).
  monuments: MonumentCandidatFusionne[];

  // Propreté — nuisances IA (photo).
  nuisancesMajeures: NuisanceMajeure[];
  nuisancesMineures: NuisanceMineure[];

  // Propreté — nuisances géométriques (BD TOPO). Débranchées tant que les couches
  // ne sont pas importées : la préparation les laisse à false dans ce cas.
  carrefourMajeur: boolean;                // carrefour ≥ 4 voies sans valorisant au centre
  cimetiere: boolean;
}

// Sortie du calcul de score Famille 2.
export interface ScorePaysage {
  total: number;                           // /50, clampé
  strate1: number;                         // /40
  strate2: number;                         // /10
  malusProprete: number;                   // valeur du malus appliqué (≤ plafond)
  scorePartiel: boolean;                   // true si photo inexploitable
  detail: {
    faisceauxValorisants: number;
    monumentsComptes: { id: MonumentId; points: number }[];
    nuisancesMajeuresAppliquees: NuisanceMajeure[];
    nuisancesMineuresAppliquees: NuisanceMineure[];
    carrefourApplique: boolean;
    cimetiereApplique: boolean;
  };
}
