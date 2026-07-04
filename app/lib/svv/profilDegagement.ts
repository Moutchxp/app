/**
 * Profil de pondération du Résultat B / Couche 1 (note de dégagement /80).
 *
 * Pilote UNIQUEMENT la note /80. N'affecte JAMAIS le verdict ni le Résultat A.
 * Module pur : aucune donnée, aucune IA. VALEURS DE DÉPART À CALIBRER (non figées).
 */
import type { Orientation } from './config';

export type ModeCombinaison = 'max' | 'addition' | 'sequentiel';

/** Coefficients d'une famille pondérée (Étape 2) : multiplicateur cône, flanc + plafond de distance. */
export interface FamilleCoeff {
  /** Multiplicateur de la distance réelle dans le cône (|offsetDeg| ≤ coneFamilleDemiAngleDeg). */
  cone: number;
  /** Multiplicateur sur les flancs (au-delà du cône). */
  flanc: number;
  /** Distance max (m) de valorisation du faisceau pour cette famille (cap du total). */
  distMaxM: number;
}

/** Barème de pondération par famille (Étape 2). UNE SEULE famille s'applique par bâti (priorité). */
export interface FamillesPonderation {
  /** Patrimoine mondial : faisceau FIXE (m), cône ET flancs, aucun calcul. */
  mondialFaisceauM: number;
  /** Monument Historique (classé OU inscrit — mêmes coefficients). */
  mh: FamilleCoeff;
  /** Bâti patrimonial Inventaire IA (inventaire_general, badge actif). */
  inventaire: FamilleCoeff;
  /** Bâti construit ≤ 1900. */
  ancien1900: FamilleCoeff;
  /** Bâti construit 1901–1935. */
  ancien1935: FamilleCoeff;
}

/** Règle de cumul nature + bâti (Étape 2) : diviseur par paliers de nature + caps. */
export interface CumulNature {
  /** Longueur de nature (m) sous laquelle le diviseur vaut 1,0 (pas de division). */
  seuilMinM: number;
  /** Base soustraite dans le palier : floor((nature − baseM) / pasM). */
  baseM: number;
  /** Pas (m) d'un palier de diviseur. */
  pasM: number;
  /** Incrément de diviseur par palier. */
  increment: number;
  /** Plafond du diviseur. */
  plafond: number;
  /** Cap (m) de la Partie 1 (valeur nature classique) dans le cumul. */
  capP1M: number;
}

export interface ProfilDegagement {
  /** F2 — bâti construit avant 1900 : boost de la distance perçue (impact × (1 + boostF2)). */
  boostF2: number;
  /** F4 — longueur de nature traversée : boost additif de la distance perçue (min(base + boostF4 × longueur, distanceMaxM)). */
  boostF4: number;
  /** F3 — monument remarquable DANS le cône central : distance perçue forfaitaire. */
  forfaitConeCentral: number;
  /** F3 — monument remarquable HORS cône central : distance perçue forfaitaire. */
  forfaitExtremites: number;
  /** Demi-angle (deg) du cône central F3, autour de l'axe de visée (|offsetDeg| <= …). */
  coneF3DemiAngleDeg: number;
  /** Plafond de distance perçue par faisceau (m) pour F1/F2/F4 (F3 forfaitaire peut le dépasser). */
  distanceMaxM: number;
  /** Note max de la Couche 1 (les 20 restants = Couche 2). BORNE DE CLAMP finale uniquement. */
  plafondCouche1: number;
  /** Coefficient du dégagement PUR (ratio cumul/portée × ce facteur), hors orientation ajoutée ensuite. */
  plafondDegagement: number;
  /** Mode de combinaison des familles déclenchées (seul "max" actif ici). */
  modeCombinaison: ModeCombinaison;
  /** Couloir — largeur : distance ⊥ à l'axe (m) sous laquelle un obstacle « longe » le regard. */
  couloirSeuilLateralM: number;
  /** Couloir — fenêtre (nb de faisceaux depuis le bord) sur laquelle la condition d'enclenchement s'applique. */
  couloirFenetreConditionN: number;
  /** Couloir — faisceaux du bord exemptés de la condition (tolérance d'enclenchement). */
  couloirToleranceBordN: number;
  /** Couloir — malus (fraction du cumul brut S) par faisceau de la chaîne (linéaire, sans plafond). */
  couloirMalusPct: number;
  /** Libellés F3 remarquables — calés sur `bdtopo_batiment.nature` (casse/accents EXACTS). */
  naturesRemarquables: readonly string[];
  /** Demi-angle (deg) du cône pour la distinction cône/flanc du barème de familles (Étape 2). */
  coneFamilleDemiAngleDeg: number;
  /** Barème de pondération par famille (Étape 2). */
  famillesPonderation: FamillesPonderation;
  /** Règle de cumul nature + bâti (Étape 2). */
  cumulNature: CumulNature;
  /** Barème d'orientation : points (0..10) par secteur (externalisé — mapping azimut→secteur reste en code). */
  orientationPts: Record<Orientation, number>;
  /** Borne haute INCLUSE de la famille « ≤ 1900 » (année ≤ borneAnnee1900). */
  borneAnnee1900: number;
  /** Borne haute INCLUSE de la famille « 1901–1935 » (borneAnnee1900 < année ≤ borneAnnee1935). */
  borneAnnee1935: number;
  /** Portée d'analyse (m) — miroir runtime de ANALYSIS_RANGE_M ; garde-fou distanceMaxM ≤ analysisRangeM au chargement. */
  analysisRangeM: number;
}

export const PROFIL_DEGAGEMENT_DEFAUT: ProfilDegagement = {
  boostF2: 0.3,
  boostF4: 2.5,
  forfaitConeCentral: 300,
  forfaitExtremites: 200,
  coneF3DemiAngleDeg: 60,
  distanceMaxM: 200,
  plafondCouche1: 90,
  plafondDegagement: 80,
  modeCombinaison: 'max',
  couloirSeuilLateralM: 3,
  couloirFenetreConditionN: 16,
  couloirToleranceBordN: 2,
  couloirMalusPct: 0.01,
  // Libellés EXACTS de bdtopo_batiment.nature (vérifiés en base).
  naturesRemarquables: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'],
  coneFamilleDemiAngleDeg: 60,
  famillesPonderation: {
    mondialFaisceauM: 800,
    mh: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
    inventaire: { cone: 2.0, flanc: 1.5, distMaxM: 400 },
    ancien1900: { cone: 1.5, flanc: 1.2, distMaxM: 300 },
    ancien1935: { cone: 1.2, flanc: 1.1, distMaxM: 200 },
  },
  cumulNature: {
    seuilMinM: 30,
    baseM: 25,
    pasM: 5,
    increment: 0.1,
    plafond: 2.0,
    capP1M: 200,
  },
  orientationPts: { N: 0, NE: 1, E: 5, SE: 8, S: 10, SO: 9, O: 7, NO: 3 },
  borneAnnee1900: 1900,
  borneAnnee1935: 1935,
  analysisRangeM: 200,
};
