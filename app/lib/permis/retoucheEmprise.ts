/**
 * PROJ-3s — RETOUCHE d'un anneau d'emprise (édition à la main d'un contour existant). PUR, aucune I/O.
 *
 * Opérations sur un anneau (liste ordonnée de sommets Lambert-93, contour extérieur simple, sans point de fermeture dupliqué) :
 * DÉPLACER, INSÉRER (sur un bord), SUPPRIMER un sommet. GARDE MÉTIER : un polygone garde AU MOINS 3 sommets — la suppression du 3ᵉ
 * est REFUSÉE (résultat discriminé, jamais une exception). La détection du sommet / du bord le plus proche d'un clic est faite en
 * COORDONNÉES DE BOÎTE (schéma), pour un ciblage tactile ; la géométrie finale reste recalculée et validée CÔTÉ SERVEUR.
 */
import type { PointLambert } from './calageEmprise';

export type ResultatRetouche =
  | { ok: true; anneau: PointLambert[] }
  | { ok: false; motif: string };

/** Déplace le sommet `i` vers `pt`. PUR. */
export function deplacerSommet(anneau: PointLambert[], i: number, pt: PointLambert): ResultatRetouche {
  if (i < 0 || i >= anneau.length) return { ok: false, motif: 'sommet introuvable' };
  return { ok: true, anneau: anneau.map((p, k) => (k === i ? { x: pt.x, y: pt.y } : p)) };
}

/** Insère un sommet `pt` APRÈS le sommet `i` (sur le bord i → i+1, le dernier bord reboucle sur 0). PUR. */
export function insererSommet(anneau: PointLambert[], i: number, pt: PointLambert): ResultatRetouche {
  if (i < 0 || i >= anneau.length) return { ok: false, motif: 'bord introuvable' };
  const out = anneau.slice();
  out.splice(i + 1, 0, { x: pt.x, y: pt.y });
  return { ok: true, anneau: out };
}

/** Supprime le sommet `i`. REFUSÉ si l'anneau tomberait sous 3 sommets (un polygone en exige au moins 3). PUR. */
export function supprimerSommet(anneau: PointLambert[], i: number): ResultatRetouche {
  if (i < 0 || i >= anneau.length) return { ok: false, motif: 'sommet introuvable' };
  if (anneau.length <= 3) return { ok: false, motif: 'un contour garde au moins 3 sommets : supprimez-en un autre ou abandonnez la retouche' };
  return { ok: true, anneau: anneau.filter((_, k) => k !== i) };
}

/** Index du sommet le plus proche du point `clic` (mêmes coordonnées), dans le rayon `seuil`, sinon -1. PUR. */
export function sommetProche(sommets: PointLambert[], clic: PointLambert, seuil: number): number {
  let best = -1, bestD = seuil * seuil;
  for (let i = 0; i < sommets.length; i++) {
    const dx = sommets[i].x - clic.x, dy = sommets[i].y - clic.y, d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Index du bord (i → i+1, dernier bouclant sur 0) dont le clic est le plus proche. PUR. -1 si l'anneau a < 2 sommets. */
export function bordProche(sommets: PointLambert[], clic: PointLambert): number {
  const n = sommets.length;
  if (n < 2) return -1;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = sommets[i], b = sommets[(i + 1) % n];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((clic.x - a.x) * vx + (clic.y - a.y) * vy) / len2));
    const px = a.x + t * vx, py = a.y + t * vy;
    const dx = clic.x - px, dy = clic.y - py, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
