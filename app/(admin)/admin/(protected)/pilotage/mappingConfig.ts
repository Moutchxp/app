/**
 * Table de correspondance UI pour les 46 colonnes du singleton `config_scoring`
 * (Couche 1 — dégagement). Purement déclaratif : libellé lisible, unité, famille,
 * statut et valeur par défaut de chaque variable.
 *
 * ISOLATION (invariant SVAV) : ce fichier NE dépend d'AUCUN module métier. Les
 * défauts sont CODÉS EN DUR — copiés verbatim du seed de la migration
 * `db/migrations/003_config_scoring_create.sql` (= PROFIL_DEGAGEMENT_DEFAUT) —
 * et NON importés de `profilDegagement.ts`. Aucun `server-only` : ce mapping est
 * consommé par la page client Pilotage.
 */

export type StatutColonne = 'VIVE' | 'VESTIGIALE' | 'DE GARDE' | 'MIROIR' | 'technique';

export interface ColonneMeta {
  /** Nom de colonne technique exact en base (traçabilité — D3, toujours visible). */
  colonne: string;
  /** Libellé lisible affiché à l'opérateur. */
  libelle: string;
  /** Unité lisible (ou « — » si sans unité). */
  unite: string;
  /** Famille d'appartenance (regroupement à l'affichage — D2). */
  famille: string;
  /** Statut fonctionnel de la variable. */
  statut: StatutColonne;
  /** Valeur par défaut (seed migration 003), codée en dur. */
  defaut: number | string | readonly string[];
}

// Familles (ordre d'affichage).
const F_TECHNIQUE = 'Technique';
const F_DISTANCE = 'Distance perçue : base & nature';
const F_BAREME = 'Barème par famille de bâtiment';
const F_CUMUL = 'Cumul nature + bâti';
const F_COULOIR = 'Malus couloir';
const F_NORM = 'Normalisation, orientation & plafonds';
const F_PORTEE = 'Portée & garde-fou';
const F_MODE = 'Mode de combinaison';
const F_HERITAGE = 'Héritage (variables sans effet)';

/**
 * Les 46 colonnes de `config_scoring`, ordonnées par famille.
 * Récapitulatif : 38 VIVE · 5 VESTIGIALE · 1 DE GARDE · 1 MIROIR · 1 technique = 46.
 */
export const META: readonly ColonneMeta[] = [
  // Famille 0 — Technique
  { colonne: 'id', libelle: 'Identifiant du profil (singleton)', unite: '— (=1)', famille: F_TECHNIQUE, statut: 'technique', defaut: 1 },

  // Famille 1 — Distance perçue : base & nature
  { colonne: 'boost_f4', libelle: 'Boost « nature traversée » (F4)', unite: 'coefficient (m perçus / m de nature)', famille: F_DISTANCE, statut: 'VIVE', defaut: 2.5 },
  { colonne: 'distance_max_m', libelle: 'Plafond de distance perçue par faisceau', unite: 'mètres', famille: F_DISTANCE, statut: 'VIVE', defaut: 200 },

  // Famille 2 — Barème par famille de bâtiment
  { colonne: 'cone_famille_demi_angle_deg', libelle: 'Demi-angle du cône (cône vs flanc)', unite: 'degrés', famille: F_BAREME, statut: 'VIVE', defaut: 60 },
  { colonne: 'mondial_faisceau_m', libelle: 'Faisceau fixe — Patrimoine mondial', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 800 },
  { colonne: 'mh_cone', libelle: 'Monument Historique — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 2.0 },
  { colonne: 'mh_flanc', libelle: 'Monument Historique — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5 },
  { colonne: 'mh_distmax_m', libelle: 'Monument Historique — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 400 },
  { colonne: 'inv_cone', libelle: 'Inventaire — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 2.0 },
  { colonne: 'inv_flanc', libelle: 'Inventaire — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5 },
  { colonne: 'inv_distmax_m', libelle: 'Inventaire — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 400 },
  { colonne: 'a1900_cone', libelle: 'Bâti ≤ 1900 — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5 },
  { colonne: 'a1900_flanc', libelle: 'Bâti ≤ 1900 — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.2 },
  { colonne: 'a1900_distmax_m', libelle: 'Bâti ≤ 1900 — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 300 },
  { colonne: 'a1935_cone', libelle: 'Bâti 1901–1935 — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.2 },
  { colonne: 'a1935_flanc', libelle: 'Bâti 1901–1935 — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.1 },
  { colonne: 'a1935_distmax_m', libelle: 'Bâti 1901–1935 — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 200 },
  { colonne: 'borne_annee_1900', libelle: 'Borne haute — famille « ≤ 1900 »', unite: 'année', famille: F_BAREME, statut: 'VIVE', defaut: 1900 },
  { colonne: 'borne_annee_1935', libelle: 'Borne haute — famille « 1901–1935 »', unite: 'année', famille: F_BAREME, statut: 'VIVE', defaut: 1935 },

  // Famille 3 — Cumul nature + bâti
  { colonne: 'cumul_seuil_min_m', libelle: 'Nature min. pour déclencher le diviseur', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 30 },
  { colonne: 'cumul_base_m', libelle: 'Base du palier de diviseur', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 25 },
  { colonne: 'cumul_pas_m', libelle: 'Pas d’un palier', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 5 },
  { colonne: 'cumul_increment', libelle: 'Incrément de diviseur par palier', unite: 'sans unité', famille: F_CUMUL, statut: 'VIVE', defaut: 0.1 },
  { colonne: 'cumul_plafond', libelle: 'Diviseur maximal', unite: 'sans unité', famille: F_CUMUL, statut: 'VIVE', defaut: 2.0 },
  { colonne: 'cumul_cap_p1_m', libelle: 'Cap de la Partie 1 (nature classique)', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 200 },

  // Famille 4 — Malus couloir
  { colonne: 'couloir_seuil_lateral_m', libelle: 'Seuil latéral « longe l’axe »', unite: 'mètres', famille: F_COULOIR, statut: 'VIVE', defaut: 3 },
  { colonne: 'couloir_fenetre_condition_n', libelle: 'Fenêtre d’enclenchement', unite: 'nb de faisceaux', famille: F_COULOIR, statut: 'VIVE', defaut: 16 },
  { colonne: 'couloir_tolerance_bord_n', libelle: 'Tolérance de bord', unite: 'nb de faisceaux', famille: F_COULOIR, statut: 'VIVE', defaut: 2 },
  { colonne: 'couloir_malus_pct', libelle: 'Malus par faisceau de la chaîne', unite: 'fraction (0–1)', famille: F_COULOIR, statut: 'VIVE', defaut: 0.01 },

  // Famille 5 — Normalisation, orientation & plafonds
  { colonne: 'plafond_degagement', libelle: 'Coefficient d’échelle du dégagement (×80)', unite: 'points (échelle)', famille: F_NORM, statut: 'VIVE', defaut: 80 },
  { colonne: 'orientation_n', libelle: 'Orientation — Nord (N)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 0 },
  { colonne: 'orientation_ne', libelle: 'Orientation — Nord-Est (NE)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 1 },
  { colonne: 'orientation_e', libelle: 'Orientation — Est (E)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 5 },
  { colonne: 'orientation_se', libelle: 'Orientation — Sud-Est (SE)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 8 },
  { colonne: 'orientation_s', libelle: 'Orientation — Sud (S)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 10 },
  { colonne: 'orientation_so', libelle: 'Orientation — Sud-Ouest (SO)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 9 },
  { colonne: 'orientation_o', libelle: 'Orientation — Ouest (O)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 7 },
  { colonne: 'orientation_no', libelle: 'Orientation — Nord-Ouest (NO)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 3 },
  { colonne: 'plafond_couche1', libelle: 'Plafond final de la note (clamp)', unite: 'points', famille: F_NORM, statut: 'VIVE', defaut: 90 },

  // Famille 6 — Portée & garde-fou
  { colonne: 'analysis_range_m', libelle: 'Portée d’analyse — garde-fou seul (n’agit pas sur la géométrie)', unite: 'mètres', famille: F_PORTEE, statut: 'MIROIR', defaut: 200 },

  // Famille 7 — Mode de combinaison (de garde)
  { colonne: 'mode_combinaison', libelle: 'Mode de combinaison des familles', unite: 'liste fermée {max, addition, sequentiel}', famille: F_MODE, statut: 'DE GARDE', defaut: 'max' },

  // Famille 8 — Héritage (vestigiales — sans effet)
  { colonne: 'boost_f2', libelle: 'Ex-boost bâti < 1900 (F2)', unite: 'coefficient — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 0.3 },
  { colonne: 'forfait_cone_central', libelle: 'Ex-forfait remarquable — cône (F3)', unite: 'mètres — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 300 },
  { colonne: 'forfait_extremites', libelle: 'Ex-forfait remarquable — flancs (F3)', unite: 'mètres — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 200 },
  { colonne: 'cone_f3_demi_angle_deg', libelle: 'Ex-demi-angle cône F3', unite: 'degrés — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 60 },
  { colonne: 'natures_remarquables', libelle: 'Ex-libellés natures remarquables (F3)', unite: 'liste de textes — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'] },
] as const;

/** Ordre canonique des familles pour le regroupement à l'affichage (D2). */
export const FAMILLES_ORDRE: readonly string[] = [
  F_TECHNIQUE, F_DISTANCE, F_BAREME, F_CUMUL, F_COULOIR, F_NORM, F_PORTEE, F_MODE, F_HERITAGE,
];

/** Liste fermée des modes de combinaison acceptés (variable DE GARDE). */
export const MODES_COMBINAISON: readonly string[] = ['max', 'addition', 'sequentiel'];

/** Vrai si la colonne fait partie du barème d'orientation (affichage côte à côte — EX-18). */
export function estOrientation(colonne: string): boolean {
  return colonne.startsWith('orientation_');
}

/**
 * Formate le malus couloir en « fraction brute (= X %/faisceau) » (EX-19).
 * La fraction est rendue EXACTE via `String()` (plus court round-trip fidèle) : jamais d'arrondi
 * ni de troncature (invariant « aucun arrondi côté interne », EX-7 / §5). `toLocaleString` par défaut
 * arrondissait à 3 décimales (0,0125 → « 0,013 ») — proscrit.
 * Ex. 0.01 → « 0,01 (= 1 %/faisceau) » ; 0.0125 → « 0,0125 (= 1,25 %/faisceau) ».
 */
export function formaterMalusPct(valeur: number): string {
  const fraction = String(valeur).replace('.', ',');
  // Équivalent lisible en % : ×100 nettoyé des seuls artefacts flottants (toPrecision), sans jamais
  // arrondir la fraction ci-dessus. Les valeurs de config restent bien en deçà de 15 chiffres significatifs.
  const pourcent = String(Number((valeur * 100).toPrecision(15))).replace('.', ',');
  return `${fraction} (= ${pourcent} %/faisceau)`;
}
