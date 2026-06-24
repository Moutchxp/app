// Contrat IA photo — type de la réponse brute du modèle.
// Fidèle à SPEC_contrat_ia_photo.md. Indépendant du fournisseur (l'adaptateur convertira
// cette réponse en entrée de score plus tard). Aucune logique ici, types uniquement.

// Identifiants stables des monuments (cf. table Strate 2, colonne Id).
export type MonumentId =
  | 'EIFFEL' | 'SACRE_COEUR' | 'NOTRE_DAME' | 'ARC_TRIOMPHE' | 'LOUVRE'
  | 'PANTHEON' | 'INVALIDES' | 'OPERA_GARNIER' | 'CONCIERGERIE_SAINTE_CHAPELLE'
  | 'TOUR_SAINT_JACQUES' | 'POMPIDOU' | 'GRAND_PALAIS' | 'SAINT_DENIS' | 'VERSAILLES';

// Fraction de hauteur visible d'un monument (4 paliers).
export type FractionVisible =
  | 'PLUS_DES_TROIS_QUARTS' | 'AU_MOINS_LA_MOITIE' | 'AU_MOINS_UN_QUART' | 'MOINS_DUN_QUART';

// Nuisances majeures détectées par l'IA.
export type NuisanceMajeure =
  | 'LIGNE_HAUTE_TENSION' | 'INDUSTRIEL_FRICHE' | 'SILO_CHATEAU_EAU';

// Nuisances mineures détectées par l'IA.
export type NuisanceMineure =
  | 'ANTENNE_TELECOM' | 'PANNEAU_PUBLICITAIRE' | 'MUR_AVEUGLE' | 'GRAND_PARKING';

// Évaluation d'un monument candidat.
export interface MonumentVisible {
  id: MonumentId;
  fractionVisible: FractionVisible;
}

// Réponse brute de l'IA, telle que décrite par le contrat.
export interface ReponseIaPhoto {
  photoExploitable: boolean;
  monuments: MonumentVisible[];
  nuisancesMajeures: NuisanceMajeure[];
  nuisancesMineures: NuisanceMineure[];
}
