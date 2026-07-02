/**
 * Profil de pondération du Résultat B / Couche 1 (note de dégagement /80).
 *
 * Pilote UNIQUEMENT la note /80. N'affecte JAMAIS le verdict ni le Résultat A.
 * Module pur : aucune donnée, aucune IA. VALEURS DE DÉPART À CALIBRER (non figées).
 */

export type ModeCombinaison = 'max' | 'addition' | 'sequentiel';

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
  /** Note max de la Couche 1 (les 20 restants = Couche 2). */
  plafondCouche1: number;
  /** Mode de combinaison des familles déclenchées (seul "max" actif ici). */
  modeCombinaison: ModeCombinaison;
  /** Couloir — largeur : distance ⊥ à l'axe (m) sous laquelle un obstacle « longe » le regard. */
  couloirSeuilLateralM: number;
  /** Couloir — fenêtre (nb de faisceaux depuis le bord) sur laquelle la condition d'enclenchement s'applique. */
  couloirFenetreConditionN: number;
  /** Couloir — faisceaux du bord exemptés de la condition (tolérance d'enclenchement). */
  couloirToleranceBordN: number;
  /** Couloir — malus (fraction du cumul brut S) par faisceau, positions 1..couloirFenetreConditionN de la chaîne. */
  couloirMalusPct1: number;
  /** Couloir — malus (fraction du cumul brut S) par faisceau, positions au-delà de couloirFenetreConditionN. */
  couloirMalusPct2: number;
  /** Libellés F3 remarquables — calés sur `bdtopo_batiment.nature` (casse/accents EXACTS). */
  naturesRemarquables: readonly string[];
}

export const PROFIL_DEGAGEMENT_DEFAUT: ProfilDegagement = {
  boostF2: 0.3,
  boostF4: 2.5,
  forfaitConeCentral: 300,
  forfaitExtremites: 200,
  coneF3DemiAngleDeg: 60,
  distanceMaxM: 200,
  plafondCouche1: 90,
  modeCombinaison: 'max',
  couloirSeuilLateralM: 3,
  couloirFenetreConditionN: 16,
  couloirToleranceBordN: 2,
  couloirMalusPct1: 0.01,
  couloirMalusPct2: 0.005,
  // Libellés EXACTS de bdtopo_batiment.nature (vérifiés en base).
  naturesRemarquables: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'],
};
