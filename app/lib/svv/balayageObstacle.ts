/**
 * Détecteur d'obstacle « plein-couloir » (spec §4-§9).
 *
 * Logique PURE (aucune DB, aucun I/O). On reçoit le couloir d'analyse déjà
 * échantillonné en 4 colonnes de cellules (altitude de toit bâti NGF + couverture
 * LiDAR), et on rend la PREMIÈRE cellule qui matérialise un obstacle barrant tout
 * le couloir. Le calage façade BD TOPO et la distance métrique Lambert-93 se font
 * à l'étape DB ; ici on ne rend que l'indice de cellule + sa distance « grille ».
 *
 * Un obstacle = un mur/bâti qui coupe LES 4 colonnes (pas de connexité exigée)
 * à l'intérieur d'une même fenêtre glissante de `profondeurFenetre` cellules.
 */
import { THRESHOLD_M } from "./config";

export interface CelluleCouloir {
  altM: number | null; // altitude toit bâti NGF ; null = pas de bâti
  couvert: boolean; // couverture LiDAR présente ?
  origine?: boolean; // true = cellule du bâtiment d'origine → forcée « dégagée »
}

export interface ParamsBalayage {
  colonnes: CelluleCouloir[][]; // 4 colonnes de même longueur ; ligne 0 = la plus proche de l'origine
  hOeilM: number; // altitude œil NGF
  pasM?: number; // défaut 0.5
  profondeurFenetre?: number; // défaut 6 (lignes)
  seuilM?: number; // défaut THRESHOLD_M (40)
}

export type StatutBalayage = "OBSTACLE" | "DEGAGE" | "INDETERMINE";

export interface ResultatBalayage {
  statut: StatutBalayage;
  ligne: number | null; // ligne de la cellule retenue
  colonne: number | null;
  distanceCelluleM: number | null; // (ligne + 0.5) * pasM
  degrade: boolean; // trou ≥ seuil → scoring incomplet (n'affecte pas le statut)
  raison: string;
}

/** Cellule BLOQUÉE : couverte, hors bâtiment d'origine, toit bâti ≥ altitude de l'œil. */
function estBloquee(c: CelluleCouloir, hOeilM: number): boolean {
  return c.couvert && !c.origine && c.altM !== null && c.altM >= hOeilM;
}

/** Cellule SANS_DONNÉE : pas de couverture LiDAR (trou). */
function estSansDonnee(c: CelluleCouloir): boolean {
  return !c.couvert;
}

export function balayerObstacle(p: ParamsBalayage): ResultatBalayage {
  const pas = p.pasM ?? 0.5;
  const prof = p.profondeurFenetre ?? 6;
  const seuil = p.seuilM ?? THRESHOLD_M;
  const cols = p.colonnes;
  const nCols = cols.length;
  const nLignes = nCols > 0 ? cols[0].length : 0;

  const distance = (ligne: number) => (ligne + 0.5) * pas;

  // 1) Détection de l'obstacle : 1ère fenêtre [i .. i+prof-1] où CHAQUE colonne
  //    possède ≥1 cellule BLOQUÉE (pas de connexité). Cellule retenue = la BLOQUÉE
  //    la plus proche (plus petite ligne, puis plus petite colonne) dans cette fenêtre.
  let obstacleLigne: number | null = null;
  let obstacleColonne: number | null = null;

  for (let i = 0; i + prof <= nLignes; i++) {
    let toutesQualifient = true;
    for (let col = 0; col < nCols; col++) {
      let trouve = false;
      for (let l = i; l < i + prof; l++) {
        if (estBloquee(cols[col][l], p.hOeilM)) {
          trouve = true;
          break;
        }
      }
      if (!trouve) {
        toutesQualifient = false;
        break;
      }
    }
    if (!toutesQualifient) continue;

    // Fenêtre qualifiante : cellule bloquée la plus proche.
    for (let l = i; l < i + prof && obstacleLigne === null; l++) {
      for (let col = 0; col < nCols; col++) {
        if (estBloquee(cols[col][l], p.hOeilM)) {
          obstacleLigne = l;
          obstacleColonne = col;
          break;
        }
      }
    }
    break;
  }

  // 2) Trous de couverture LiDAR.
  //    a) trou < seuil ET avant l'obstacle (ou avant tout obstacle si aucun) → INDETERMINE.
  //    b) trou ≥ seuil quelque part → degrade (scoring incomplet, n'affecte pas le statut).
  let trouAvantSousSeuil = false;
  let trouSurSeuil = false;
  for (let l = 0; l < nLignes; l++) {
    for (let col = 0; col < nCols; col++) {
      if (!estSansDonnee(cols[col][l])) continue;
      const d = distance(l);
      if (d >= seuil) trouSurSeuil = true;
      if (d < seuil && (obstacleLigne === null || l < obstacleLigne)) trouAvantSousSeuil = true;
    }
  }

  if (trouAvantSousSeuil) {
    return {
      statut: "INDETERMINE",
      ligne: null,
      colonne: null,
      distanceCelluleM: null,
      degrade: trouSurSeuil,
      raison: "Trou de couverture LiDAR (< seuil) avant tout obstacle confirmé.",
    };
  }

  if (obstacleLigne !== null) {
    return {
      statut: "OBSTACLE",
      ligne: obstacleLigne,
      colonne: obstacleColonne,
      distanceCelluleM: distance(obstacleLigne),
      degrade: trouSurSeuil,
      raison: `Obstacle plein-couloir (toutes colonnes) à la cellule ligne ${obstacleLigne}.`,
    };
  }

  return {
    statut: "DEGAGE",
    ligne: null,
    colonne: null,
    distanceCelluleM: null,
    degrade: trouSurSeuil,
    raison: trouSurSeuil
      ? "Aucun obstacle plein-couloir ; couverture incomplète au-delà du seuil (scoring dégradé)."
      : "Aucun obstacle plein-couloir détecté.",
  };
}
