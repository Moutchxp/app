/**
 * ══ 🔴 Arno (24/10/2026) — LA LIGNE DE TOTAUX D'UNE CARTE D'APPORTEUR TIENT SUR UNE LIGNE ═══════════════════════════════════════════
 * « Dossiers · Honoraires HT · Dû à l'apporteur HT · [Dû au collègue HT] · Net agence HT » ne passe JAMAIS à la ligne à 1200 px : la
 * police (montants ET libellés, proportionnellement) réduit selon la largeur disponible — la MÊME pour toutes les cartes (celle qu'exige
 * la carte la plus longue), pour que la liste reste homogène. Plancher lisible : 13 px pour les montants. Sous le plancher (écran
 * étroit), on garde le plancher et la ligne se replie en deux lignes équilibrées, centrées — jamais un débordement. PUR.
 */

/** La taille des montants à l'échelle 1 (rem → px) et le plancher lisible. */
export const TAILLE_MONTANT_PX = 1.05 * 16;
export const PLANCHER_MONTANT_PX = 13;
export const ECHELLE_MIN = PLANCHER_MONTANT_PX / TAILLE_MONTANT_PX;
/** Une marge pour les arrondis de mesure (sous-pixels, polices) : on vise un peu sous la largeur disponible. */
const MARGE = 0.995;

/** Une ligne mesurée À L'ÉCHELLE 1 : la largeur qu'elle demande (`besoin`) et celle dont elle dispose (`dispo`), en px. */
export interface MesureLigne { besoin: number; dispo: number }

/**
 * L'échelle commune : la plus grande qui fait tenir TOUTES les lignes (≤ 1 : on ne grossit jamais), bornée au plancher ; `replie` :
 * même au plancher, au moins une ligne ne tient pas (elle se repliera). Sans mesure exploitable : 1. PUR.
 */
export function echelleTotaux(mesures: readonly MesureLigne[]): { echelle: number; replie: boolean } {
  const utiles = mesures.filter((m) => m.besoin > 0 && m.dispo > 0);
  if (utiles.length === 0) return { echelle: 1, replie: false };
  const requise = Math.min(1, ...utiles.map((m) => (m.dispo / m.besoin) * MARGE));
  return requise >= ECHELLE_MIN ? { echelle: requise, replie: false } : { echelle: ECHELLE_MIN, replie: true };
}

/**
 * La largeur maximale d'une ligne repliée pour qu'elle se coupe en DEUX rangées ÉQUILIBRÉES (jamais trois) : parmi les coupures possibles,
 * la plus petite largeur avec laquelle le retour à la ligne naturel (glouton, celui du navigateur) donne au plus deux rangées. `largeurs` :
 * les éléments dans l'ordre, à l'échelle retenue ; `ecart` : l'espace entre deux éléments. PUR.
 */
export function largeurDeuxRangees(largeurs: readonly number[], ecart: number): number {
  const rangee = (de: number, a: number): number => largeurs.slice(de, a).reduce((s, x) => s + x, 0) + ecart * Math.max(0, a - de - 1);
  const rangees = (max: number): number => {
    let n = 1; let courant = 0;
    for (const x of largeurs) {
      const avec = courant === 0 ? x : courant + ecart + x;
      if (avec <= max + 0.5) courant = avec; else { n += 1; courant = x; }
    }
    return n;
  };
  const candidats = largeurs.slice(1).map((_, i) => Math.max(rangee(0, i + 1), rangee(i + 1, largeurs.length))).sort((x, y) => x - y);
  for (const w of candidats) if (rangees(w) <= 2) return Math.ceil(w);
  return Math.ceil(rangee(0, largeurs.length));
}
