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
  /**
   * Type de saisie pour l'édition (M1) : `nombre` (double precision),
   * `entier` (colonne integer), `enum` (liste fermée), `liste` (text[]).
   */
  type: 'nombre' | 'entier' | 'enum' | 'liste';
  /** Éditable depuis l'admin. VESTIGIALE + `id` (technique) → false. */
  editable: boolean;
  /**
   * Bornes de saisie (min/max) et pas — GARDE-FOUS DE DÉVELOPPEMENT, pas des
   * variables de score : elles protègent le moteur (dénominateurs > 0, etc.) et
   * ne nourrissent AUCUN calcul. Chaque plage contient le `defaut` du seed.
   */
  min?: number;
  max?: number;
  /** Pas de saisie (absent = pas libre, l'UI mettra `step="any"`). */
  pas?: number;
  /** Aide contextuelle courte affichée à l'opérateur. */
  aide?: string;
  /**
   * Texte riche de l'info-bulle « i » (nature, raison d'être, effet réel sur le
   * score — cf. `docs/SPEC_infobulles_variables.md`). DISTINCT de `aide?` (indice
   * court inline) : source unique du contenu des bulles, jamais codé en dur dans le JSX.
   */
  infobulle?: string;
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

// Textes d'info-bulle partagés par des familles à texte groupé (transcrits de
// `docs/SPEC_infobulles_variables.md` — source de vérité des textes).
const IB_MH =
  'Monument Historique. mh_cone / mh_flanc multiplient la distance d’un faisceau qui heurte un MH (cône dans l’axe, flanc sur les côtés) ; mh_distmax_m plafonne le total du faisceau. N’agit que si un MH est dans l’axe. Ex. : MH dans le cône à 150 m, coeff 2,0 → 300 m perçus (capé à 400).';
const IB_INV =
  'Inventaire général (patrimoine répertorié). Même mécanisme que le Monument Historique (multiplicateurs cône/flanc + cap), appliqué en priorité juste après les MH. N’agit que si un bâtiment de l’Inventaire est dans l’axe.';
const IB_A1900 =
  'Bâti ancien (≤ borne 1900). Multiplicateurs cône/flanc + cap, comme le patrimoine mais plus modérés. Appliqués seulement si le bâtiment n’est ni MH ni Inventaire et a une année de construction ≤ la borne « ≤ 1900 ».';
const IB_A1935 =
  'Bâti 1901–1935. Même mécanisme, coefficients encore plus modérés, pour les bâtiments datés entre la borne 1900 (exclue) et la borne 1935 (incluse).';
const IB_ORIENTATION =
  'Points ajoutés selon l’orientation de la vue (secteur de boussole de l’azimut testé). Seul le secteur de la vue analysée compte ; les 7 autres sont sans effet pour un test donné. Ex. : vue plein Est → +5 pts (défaut).';
const IB_VESTIGIALE =
  'Colonne conservée en base mais sans effet sur le score actuel : son mécanisme a été remplacé (l’année de construction et les familles MH/Inventaire ont pris le relais). Non éditable.';

/**
 * Les 46 colonnes de `config_scoring`, ordonnées par famille.
 * Récapitulatif : 38 VIVE · 5 VESTIGIALE · 1 DE GARDE · 1 MIROIR · 1 technique = 46.
 */
export const META: readonly ColonneMeta[] = [
  // Famille 0 — Technique
  { colonne: 'id', libelle: 'Identifiant du profil (singleton)', unite: '— (=1)', famille: F_TECHNIQUE, statut: 'technique', defaut: 1, type: 'entier', editable: false, infobulle: 'Identifiant technique du profil (toujours 1). Non éditable, sans effet sur le score.' },

  // Famille 1 — Distance perçue : base & nature
  { colonne: 'boost_f4', libelle: 'Boost « nature traversée » (F4)', unite: 'coefficient (m perçus / m de nature)', famille: F_DISTANCE, statut: 'VIVE', defaut: 2.5, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: 'Convertit les mètres de nature traversée (eau, végétation) d’un faisceau en mètres de vue perçus ajoutés : chaque mètre de nature compte pour boost_f4 mètres, dans la limite du plafond par faisceau. ↑ = les vues sur de la nature pèsent plus. N’agit que si le faisceau traverse de la nature. Ex. : obstacle à 50 m + 20 m de nature, boost 2,5 → 100 m perçus.' },
  { colonne: 'distance_max_m', libelle: 'Plafond de distance perçue par faisceau', unite: 'mètres', famille: F_DISTANCE, statut: 'VIVE', defaut: 200, type: 'nombre', editable: true, min: 1, max: 2000, pas: 1, infobulle: 'Triple rôle : plafond de la distance perçue par faisceau, distance créditée à un faisceau totalement dégagé, et dénominateur de normalisation de la note. Effet non trivial : l’↑ relève le crédit des faisceaux dégagés et l’échelle de normalisation. Doit rester ≤ la portée d’analyse, sinon toute la config est rejetée.' },

  // Famille 2 — Barème par famille de bâtiment
  { colonne: 'cone_famille_demi_angle_deg', libelle: 'Demi-angle du cône (cône vs flanc)', unite: 'degrés', famille: F_BAREME, statut: 'VIVE', defaut: 60, type: 'nombre', editable: true, min: 0, max: 90, pas: 1, infobulle: 'Sépare, pour un bâtiment patrimonial heurté, le coefficient cône (proche de l’axe, plus fort) du coefficient flanc (sur les côtés) : un faisceau dont l’écart à l’axe est ≤ ce demi-angle prend le coefficient cône. ↑ = plus de faisceaux profitent du coefficient fort. Neutre si aucun bâtiment patrimonial dans l’axe.' },
  { colonne: 'mondial_faisceau_m', libelle: 'Faisceau fixe — Patrimoine mondial', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 800, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: 'Longueur de vue perçue attribuée d’office à un faisceau visant l’un des monuments emblématiques répertoriés (patrimoine mondial), en valeur fixe, sans autre calcul ni plafond. ↑ = ces faisceaux pèsent davantage.' },
  { colonne: 'mh_cone', libelle: 'Monument Historique — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 2.0, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_MH },
  { colonne: 'mh_flanc', libelle: 'Monument Historique — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_MH },
  { colonne: 'mh_distmax_m', libelle: 'Monument Historique — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 400, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: IB_MH },
  { colonne: 'inv_cone', libelle: 'Inventaire — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 2.0, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_INV },
  { colonne: 'inv_flanc', libelle: 'Inventaire — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_INV },
  { colonne: 'inv_distmax_m', libelle: 'Inventaire — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 400, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: IB_INV },
  { colonne: 'a1900_cone', libelle: 'Bâti ≤ 1900 — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.5, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_A1900 },
  { colonne: 'a1900_flanc', libelle: 'Bâti ≤ 1900 — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.2, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_A1900 },
  { colonne: 'a1900_distmax_m', libelle: 'Bâti ≤ 1900 — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 300, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: IB_A1900 },
  { colonne: 'a1935_cone', libelle: 'Bâti 1901–1935 — coeff cône', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.2, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_A1935 },
  { colonne: 'a1935_flanc', libelle: 'Bâti 1901–1935 — coeff flanc', unite: 'coefficient (×)', famille: F_BAREME, statut: 'VIVE', defaut: 1.1, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: IB_A1935 },
  { colonne: 'a1935_distmax_m', libelle: 'Bâti 1901–1935 — cap de distance', unite: 'mètres', famille: F_BAREME, statut: 'VIVE', defaut: 200, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: IB_A1935 },
  { colonne: 'borne_annee_1900', libelle: 'Borne haute — famille « ≤ 1900 »', unite: 'année', famille: F_BAREME, statut: 'VIVE', defaut: 1900, type: 'entier', editable: true, min: 1800, max: 2100, pas: 1, infobulle: 'Année incluse jusqu’à laquelle un bâtiment entre dans la famille « ≤ 1900 » (coefficients plus forts). ↑ = plus de bâtiments profitent de cette famille.' },
  { colonne: 'borne_annee_1935', libelle: 'Borne haute — famille « 1901–1935 »', unite: 'année', famille: F_BAREME, statut: 'VIVE', defaut: 1935, type: 'entier', editable: true, min: 1800, max: 2100, pas: 1, infobulle: 'Année haute incluse de la famille « 1901–1935 » ; au-delà, le bâtiment est ordinaire (aucune pondération). ↑ = plus de bâtiments basculent d’ordinaire vers cette famille.' },

  // Famille 3 — Cumul nature + bâti
  { colonne: 'cumul_seuil_min_m', libelle: 'Nature min. pour déclencher le diviseur', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 30, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: 'Longueur de nature minimale pour déclencher la pénalité de cumul (le diviseur). En dessous, aucune pénalité. ↑ = pénalité déclenchée plus rarement → note plus haute.' },
  { colonne: 'cumul_base_m', libelle: 'Base du palier de diviseur', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 25, type: 'nombre', editable: true, min: 1, max: 200, pas: 1, infobulle: 'Base soustraite avant de compter les paliers de pénalité. ↑ = moins de paliers → pénalité plus faible → note plus haute.' },
  { colonne: 'cumul_pas_m', libelle: 'Pas d’un palier', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 5, type: 'nombre', editable: true, min: 1, max: 200, pas: 1, infobulle: 'Largeur (m de nature) d’un palier de pénalité. ↑ = paliers plus larges → pénalité plus faible → note plus haute. (Jamais 0.)' },
  { colonne: 'cumul_increment', libelle: 'Incrément de diviseur par palier', unite: 'sans unité', famille: F_CUMUL, statut: 'VIVE', defaut: 0.1, type: 'nombre', editable: true, min: 0, max: 10, pas: 0.1, infobulle: 'Montant ajouté au diviseur par palier franchi : c’est le taux de pénalité du cumul. ↑ = pénalité plus forte → note plus basse.' },
  { colonne: 'cumul_plafond', libelle: 'Diviseur maximal', unite: 'sans unité', famille: F_CUMUL, statut: 'VIVE', defaut: 2.0, type: 'nombre', editable: true, min: 1, max: 10, pas: 0.1, infobulle: 'Diviseur maximal de la pénalité de cumul. ↑ = autorise une pénalité plus forte (note plus basse) ; ↓ = protège la note.' },
  { colonne: 'cumul_cap_p1_m', libelle: 'Cap de la Partie 1 (nature classique)', unite: 'mètres', famille: F_CUMUL, statut: 'VIVE', defaut: 200, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: 'Plafond de la part « nature classique » dans le total d’un faisceau en cumul. ↑ = cette part peut peser plus (note plus haute), jusqu’au cap de la famille.' },

  // Famille 4 — Malus couloir
  { colonne: 'couloir_seuil_lateral_m', libelle: 'Seuil latéral « longe l’axe »', unite: 'mètres', famille: F_COULOIR, statut: 'VIVE', defaut: 3, type: 'nombre', editable: true, min: 0, max: 2000, pas: 1, infobulle: 'Distance latérale (⊥ à l’axe) sous laquelle un obstacle est considéré comme longeant l’axe. ↑ = plus d’obstacles forment un « couloir » → malus plus fréquent → note plus basse.' },
  { colonne: 'couloir_fenetre_condition_n', libelle: 'Fenêtre d’enclenchement', unite: 'nb de faisceaux', famille: F_COULOIR, statut: 'VIVE', defaut: 16, type: 'entier', editable: true, min: 0, max: 61, pas: 1, infobulle: 'Nombre de faisceaux consécutifs (du bord vers l’axe) requis pour enclencher un couloir. Effet non monotone : ↑ rend l’enclenchement plus rare (note plus haute en moyenne) mais rallonge la chaîne quand il se produit.' },
  { colonne: 'couloir_tolerance_bord_n', libelle: 'Tolérance de bord', unite: 'nb de faisceaux', famille: F_COULOIR, statut: 'VIVE', defaut: 2, type: 'entier', editable: true, min: 0, max: 61, pas: 1, infobulle: 'Nombre de faisceaux de bord exemptés de la condition de collage (mais comptés dans la chaîne). ↑ = couloir enclenché plus facilement → malus plus fréquent → note plus basse.' },
  { colonne: 'couloir_malus_pct', libelle: 'Malus par faisceau de la chaîne', unite: 'fraction (0–1)', famille: F_COULOIR, statut: 'VIVE', defaut: 0.01, type: 'nombre', editable: true, min: 0, max: 1, infobulle: 'Fraction du cumul retranchée par faisceau de la chaîne couloir (linéaire, sans plafond). ↑ = malus plus fort → note plus basse. Ex. : chaîne de 20 faisceaux, cumul 6000 m, 0,01 → −1200 m.' },

  // Famille 5 — Normalisation, orientation & plafonds
  { colonne: 'plafond_degagement', libelle: 'Coefficient d’échelle du dégagement (×80)', unite: 'points (échelle)', famille: F_NORM, statut: 'VIVE', defaut: 80, type: 'nombre', editable: true, min: 1, max: 1000, pas: 1, infobulle: 'Coefficient d’échelle qui transforme le taux de dégagement (0 à 1) en points — c’est le « ×80 » du score. Levier le plus direct : ↑ augmente proportionnellement toute la composante dégagement.' },
  { colonne: 'orientation_n', libelle: 'Orientation — Nord (N)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 0, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_ne', libelle: 'Orientation — Nord-Est (NE)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 1, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_e', libelle: 'Orientation — Est (E)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 5, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_se', libelle: 'Orientation — Sud-Est (SE)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 8, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_s', libelle: 'Orientation — Sud (S)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 10, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_so', libelle: 'Orientation — Sud-Ouest (SO)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 9, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_o', libelle: 'Orientation — Ouest (O)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 7, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'orientation_no', libelle: 'Orientation — Nord-Ouest (NO)', unite: 'points (0–10)', famille: F_NORM, statut: 'VIVE', defaut: 3, type: 'nombre', editable: true, min: 0, max: 10, pas: 1, infobulle: IB_ORIENTATION },
  { colonne: 'plafond_couche1', libelle: 'Plafond final de la note (clamp)', unite: 'points', famille: F_NORM, statut: 'VIVE', defaut: 90, type: 'nombre', editable: true, min: 1, max: 1000, pas: 1, infobulle: 'Plafond final de la note (écrêtage). N’agit que si la note dépasse ce plafond ; sinon neutre. À ne pas confondre avec le coefficient d’échelle (plafond_degagement).' },

  // Famille 6 — Portée & garde-fou
  { colonne: 'analysis_range_m', libelle: 'Portée d’analyse — garde-fou seul (n’agit pas sur la géométrie)', unite: 'mètres', famille: F_PORTEE, statut: 'MIROIR', defaut: 200, type: 'entier', editable: true, min: 1, max: 2000, pas: 1, aide: 'Garde-fou : n’agit pas sur la géométrie.', infobulle: 'Garde-fou de cohérence : n’entre dans AUCUN calcul de score ni dans la géométrie. Seul rôle : si le plafond de distance perçue (distance_max_m) le dépasse, toute la configuration est rejetée et le moteur repasse aux valeurs par défaut. La portée géométrique réelle est fixée dans le code.' },

  // Famille 7 — Mode de combinaison (de garde)
  { colonne: 'mode_combinaison', libelle: 'Mode de combinaison des familles', unite: 'liste fermée {max, addition, sequentiel}', famille: F_MODE, statut: 'DE GARDE', defaut: 'max', type: 'enum', editable: true, infobulle: '⚠️ Dans le moteur actuel, cette option ne change pas le score : les trois valeurs (max, addition, séquentiel) donnent exactement la même note. La combinaison d’une nature valorisante et d’un bâtiment pondéré sur un même faisceau est gérée par une règle fixe, sans consulter ce mode. Son seul effet réel : une valeur hors de la liste {max, addition, séquentiel} ferait rejeter toute la configuration (retour aux valeurs par défaut). C’est donc aujourd’hui un verrou de sécurité, pas un réglage de calcul.' },

  // Famille 8 — Héritage (vestigiales — sans effet)
  { colonne: 'boost_f2', libelle: 'Ex-boost bâti < 1900 (F2)', unite: 'coefficient — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 0.3, type: 'nombre', editable: false, infobulle: IB_VESTIGIALE },
  { colonne: 'forfait_cone_central', libelle: 'Ex-forfait remarquable — cône (F3)', unite: 'mètres — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 300, type: 'nombre', editable: false, infobulle: IB_VESTIGIALE },
  { colonne: 'forfait_extremites', libelle: 'Ex-forfait remarquable — flancs (F3)', unite: 'mètres — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 200, type: 'nombre', editable: false, infobulle: IB_VESTIGIALE },
  { colonne: 'cone_f3_demi_angle_deg', libelle: 'Ex-demi-angle cône F3', unite: 'degrés — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: 60, type: 'nombre', editable: false, infobulle: IB_VESTIGIALE },
  { colonne: 'natures_remarquables', libelle: 'Ex-libellés natures remarquables (F3)', unite: 'liste de textes — sans effet', famille: F_HERITAGE, statut: 'VESTIGIALE', defaut: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'], type: 'liste', editable: false, infobulle: IB_VESTIGIALE },
] as const;

/** Ordre canonique des familles pour le regroupement à l'affichage (D2). */
export const FAMILLES_ORDRE: readonly string[] = [
  F_TECHNIQUE, F_DISTANCE, F_BAREME, F_CUMUL, F_COULOIR, F_NORM, F_PORTEE, F_MODE, F_HERITAGE,
];

/** Liste fermée des modes de combinaison acceptés (variable DE GARDE). */
export const MODES_COMBINAISON: readonly string[] = ['max', 'addition', 'sequentiel'];

/**
 * Métadonnée d'une colonne par son nom technique, ou `undefined` si inconnue.
 * Sert d'ALLOWLIST à la validation serveur (M1) : seules les colonnes présentes
 * dans `META` — et éditables — peuvent être écrites.
 */
export function metaParColonne(colonne: string): ColonneMeta | undefined {
  return META.find((m) => m.colonne === colonne);
}

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
