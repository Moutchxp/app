// BAT (défaut E) — ANCRAGE des poignées d'ajustement sur le CENTRE VISUEL du polygone tel qu'AFFICHÉ (delta compris).
//
// Deux fonctions PURES, sans effet de bord, agnostiques de l'unité (mètres Lambert OU unités boîte du schéma) :
//   1. `ancragePoignees` : où sont les poignées, en fonction de la GÉOMÉTRIE affichée (centroïde d'aire, jamais un coin/sommet ni l'origine
//      du repère) et de la rotation courante. La tige est PROPORTIONNELLE à la taille du polygone.
//   2. `placerPoigneeDansCadre` : borne la LONGUEUR de tige (min/max) et REPLIE la poignée dans le cadre visible — préhensible sur un tout
//      petit polygone, jamais hors champ sur un très grand ou près d'un bord. À appliquer dans l'espace ÉCRAN (unités boîte) car les bornes
//      (taille d'une bulle, dimensions du viewBox) y ont un sens ; le rendu ET le hit-test s'en servent → jamais divergents.
import { centroideAnneaux, rotePoint, type PointLambert } from '../../../../lib/permis/calageEmprise';

/** Facteur tige/rayon : les poignées se posent à 40 % AU-DELÀ du sommet le plus lointain → nettement HORS de la forme, sans jamais s'en détacher (la tige les relie). */
export const FACTEUR_TIGE = 1.4;

export interface AncragePoignees {
  centre: PointLambert;          // centroïde d'aire du polygone affiché (delta compris) — racine des tiges et pivot perçu
  rayon: number;                 // longueur de tige BRUTE, proportionnelle au polygone (bornée ensuite par placerPoigneeDansCadre côté écran)
  poigneeRotation: PointLambert; // ↻ « au nord » de l'emprise
  poigneeEchelle: PointLambert;  // ⤢ « à l'est » de l'emprise
}

/**
 * Ancre les poignées sur le CENTRE VISUEL (centroïde d'aire) de `anneaux` — la géométrie RÉELLEMENT affichée (base + delta). Le centre SUIT
 * donc n'importe quelle transformation (translation de plusieurs dizaines de mètres, rotation, échelle) par construction, puisqu'il est
 * recalculé sur les anneaux transformés. Ce n'est JAMAIS un sommet ni l'origine du repère. Les poignées tournent AVEC le polygone (`rotDeg`).
 * PUR — aucune borne ici : la longueur de tige (min/max) et le repli dans le cadre relèvent de l'écran (cf. `placerPoigneeDansCadre`).
 */
export function ancragePoignees(anneaux: PointLambert[][], rotDeg: number, facteur: number = FACTEUR_TIGE): AncragePoignees {
  const centre = centroideAnneaux(anneaux);
  let R = 0;
  for (const a of anneaux) for (const p of a) { const d = Math.hypot(p.x - centre.x, p.y - centre.y); if (d > R) R = d; }
  const rayon = (R > 0 ? R : 1) * facteur;
  const pt = (angleDeg: number): PointLambert => rotePoint({ x: centre.x + rayon, y: centre.y }, centre, angleDeg);
  return { centre, rayon, poigneeRotation: pt(90 + rotDeg), poigneeEchelle: pt(rotDeg) };
}

/** Rectangle du cadre visible (viewBox), en unités boîte. */
export interface CadreBoite { minX: number; minY: number; w: number; h: number }
/** Bornes de LONGUEUR de tige, en unités boîte (min = les bulles ne se chevauchent jamais ; max = les poignées restent bien dans le cadre). */
export interface BornesTige { min: number; max: number }

/**
 * Place une poignée dans le cadre visible, en unités boîte, en préservant la DIRECTION de la tige depuis le centre :
 *   1. borne la LONGUEUR de tige à [min, max] (préhensible sur un polygone minuscule, sans fuser sur un très grand) ;
 *   2. si la poignée sort quand même du cadre (centre près d'un bord), la REPLIE de l'autre côté du centre (même longueur, sens opposé — la
 *      tige émane toujours du centre, la poignée reste dans le champ) ;
 *   3. en dernier recours (les deux sens sortent), la RAMÈNE dans le cadre (clamp).
 * PUR. Le rendu et le hit-test appellent la MÊME fonction → ce qu'on voit est exactement ce qu'on peut saisir.
 */
export function placerPoigneeDansCadre(centre: PointLambert, poignee: PointLambert, cadre: CadreBoite, bornes: BornesTige): PointLambert {
  const dx = poignee.x - centre.x, dy = poignee.y - centre.y;
  const dist = Math.hypot(dx, dy) || 1;
  const long = Math.min(bornes.max, Math.max(bornes.min, dist)); // (1) longueur de tige bornée
  const ux = dx / dist, uy = dy / dist;
  const dedans = (px: number, py: number) => px >= cadre.minX && px <= cadre.minX + cadre.w && py >= cadre.minY && py <= cadre.minY + cadre.h;
  let x = centre.x + ux * long, y = centre.y + uy * long;
  if (!dedans(x, y)) { const rx = centre.x - ux * long, ry = centre.y - uy * long; if (dedans(rx, ry)) { x = rx; y = ry; } } // (2) repli symétrique
  x = Math.min(cadre.minX + cadre.w, Math.max(cadre.minX, x)); // (3) clamp
  y = Math.min(cadre.minY + cadre.h, Math.max(cadre.minY, y));
  return { x, y };
}
