/**
 * ══ 🔴🔴 TUILE LOCATION — LES FLÈCHES ▲ ▼ DE « ÉTAGE » ET DE « NOMBRE DE PIÈCES » (Arno, 18/10/2026). PUR. ═══════════════
 *
 * « Deux petits boutons ▲ ▼ qui ajoutent / retirent 1 étage au clic. Bornes : −5 à 60 ; 0 s'affiche “RDC” ; saisie manuelle
 * toujours possible (texte libre conservé si non numérique, ex. “mezzanine”). Même principe sur “Nombre de pièces”
 * (minimum 1, pas de négatif). » (Arno) — Un texte libre n'est jamais réécrit par la saisie ; seules les flèches le
 * remplacent, en partant de 0 (RDC) pour l'étage, de 1 pour les pièces (vide ou texte libre + ▲ ⇒ 1, + ▼ ⇒ −1 / 1).
 */

export const ETAGE_MIN = -5;
export const ETAGE_MAX = 60;
export const PIECES_MIN = 1;
export const PIECES_MAX = 50;

/** L'étage lu en nombre : « RDC » (toute casse) = 0 ; un entier ; sinon `null` (texte libre). PUR. */
export function etageEnNombre(v: string): number | null {
  const t = v.trim();
  if (/^rdc$/i.test(t) || /^rez/i.test(t)) return 0;
  return /^-?\d+$/.test(t) ? Number(t) : null;
}

/** Ce qu'affiche l'étage `n` : « RDC » pour 0, sinon le nombre. PUR. */
export function etageAffiche(n: number): string {
  return n === 0 ? 'RDC' : String(n);
}

/** L'étage après un clic sur ▲ (+1) ou ▼ (−1), borné à [−5 ; 60]. PUR. */
export function pasEtage(v: string, sens: 1 | -1): string {
  // Vide ou texte libre : on part du rez-de-chaussée (0).
  const base = (etageEnNombre(v) ?? 0) + sens;
  return etageAffiche(Math.min(ETAGE_MAX, Math.max(ETAGE_MIN, base)));
}

/** Une flèche d'étage est-elle utilisable ? (désactivée en butée). PUR. */
export function etagePossible(v: string, sens: 1 | -1): boolean {
  const n = etageEnNombre(v);
  if (n === null) return true;
  return sens === 1 ? n < ETAGE_MAX : n > ETAGE_MIN;
}

/** Le nombre de pièces après ▲ / ▼ : minimum 1, maximum 50 ; un texte vide ou libre part de 1. PUR. */
export function pasPieces(v: string, sens: 1 | -1): string {
  const t = v.trim();
  const n = /^\d+$/.test(t) ? Number(t) : null;
  const suivant = n === null ? PIECES_MIN : n + sens;
  // Vide : ▲ donne 1 (le minimum), ▼ aussi.
  return String(Math.min(PIECES_MAX, Math.max(PIECES_MIN, suivant)));
}

export function piecesPossible(v: string, sens: 1 | -1): boolean {
  const t = v.trim();
  const n = /^\d+$/.test(t) ? Number(t) : null;
  if (n === null) return true;
  return sens === 1 ? n < PIECES_MAX : n > PIECES_MIN;
}
