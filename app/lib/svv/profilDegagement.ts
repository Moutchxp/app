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
  /** F4 — longueur de nature traversée : boost de la distance perçue (longueur × (1 + boostF4)). */
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
  /** Libellés F3 remarquables — calés sur `bdtopo_batiment.nature` (casse/accents EXACTS). */
  naturesRemarquables: readonly string[];
}

export const PROFIL_DEGAGEMENT_DEFAUT: ProfilDegagement = {
  boostF2: 0.3,
  boostF4: 2.0,
  forfaitConeCentral: 300,
  forfaitExtremites: 200,
  coneF3DemiAngleDeg: 60,
  distanceMaxM: 200,
  plafondCouche1: 90,
  modeCombinaison: 'max',
  // Libellés EXACTS de bdtopo_batiment.nature (vérifiés en base).
  naturesRemarquables: ['Eglise', 'Monument', 'Chapelle', 'Château', 'Tour, donjon', 'Arc de triomphe'],
};
