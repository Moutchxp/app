/**
 * LOT 23 — PRÉCHARGEMENT des pièces voisines du best-of + CACHE LRU BORNÉ de la liseuse. LOGIQUE PURE (aucun DOM, aucun pdf.js),
 * extraite pour être TESTÉE : QUELLES pièces précharger autour du plan courant, et QUELLE pièce évincer quand le cache déborde.
 * Le composant `LiseusePieces.tsx` pilote son `Map` de documents pdf.js avec EXACTEMENT ces décisions → une SEULE vérité (jamais
 * une 2e implémentation de la règle d'éviction dispersée dans le composant).
 */

/** Nombre maximum de DOCUMENTS pdf.js gardés en mémoire simultanément : courant + les 2 voisins préchargés + 1 déjà consulté. */
export const MAX_DOCS_CACHE = 4;

/**
 * LOT 25 — Nombre maximum de RENDUS peints (ImageBitmap) gardés en mémoire. Poids d'un bitmap = largeur·hauteur·4 octets à la
 * résolution d'affichage réelle (mesuré : ≈ 2,6 Mo pour un canvas 960×679 en portrait mobile, ≈ 11 Mo pour 2000×1414 en desktop,
 * ≤ 16 Mo au plafond de 2400 px). La borne 6 couvre un best-of complet (le dossier de référence Aubervilliers a 6 plans) → un
 * aller-retour sur TOUTE la bande reste instantané ; plafond mémoire ≈ 6·16 = 98 Mo dans le pire cas (A0 au plafond), ~68 Mo en
 * desktop typique, et seulement ~16 Mo sur mobile (les bitmaps rétrécissent avec l'affichage, là où la mémoire est comptée).
 */
export const MAX_BITMAPS_RENDU = 6;

/**
 * Pièces VOISINES à précharger autour du plan courant d'une bande best-of : la SUIVANTE **puis** la PRÉCÉDENTE (ordre de
 * priorité — on avance plus souvent qu'on ne recule), DÉDUPLIQUÉES et SANS la pièce courante (déjà affichée). Des planches
 * consécutives peuvent partager la même pièce (même PDF) → un seul document à précharger, jamais deux fois. Hors bornes de la
 * bande → simplement ignoré. PUR (testable sans DOM).
 */
export function voisinsAPrecharger(bandePieceIds: number[], index: number): number[] {
  const courant = bandePieceIds[index];
  const out: number[] = [];
  for (const j of [index + 1, index - 1]) {
    const id = bandePieceIds[j];
    if (id === undefined) continue;
    if (id === courant) continue; // le voisin est déjà la pièce affichée (planche de la même pièce) → rien à précharger
    if (!out.includes(id)) out.push(id); // dédup (les deux voisins peuvent partager la même pièce)
  }
  return out;
}

/**
 * Remonte une clé en position la plus FRAÎCHE (fin de liste) si elle est présente ; sinon renvoie l'ordre inchangé. PUR.
 * Générique sur le type de clé `T` : les documents sont indexés par n° de pièce (number), les rendus par clé composite
 * « pièce:page:échelle » (string) — même règle LRU pour les deux.
 */
export function toucher<T>(ordre: T[], cle: T): T[] {
  if (!ordre.includes(cle)) return ordre;
  return [...ordre.filter((k) => k !== cle), cle];
}

/**
 * Range une clé comme la plus FRAÎCHE puis, si le cache dépasse `max`, désigne les clés à ÉVINCER — les plus ANCIENNES d'abord
 * (`ordre` = du plus ancien au plus frais). La clé qu'on vient de ranger n'est JAMAIS évincée (elle est la plus fraîche) → l'objet
 * COURANT (document ou rendu) ne peut pas être libéré sous les pieds de l'affichage. PUR : aucune destruction ici, l'appelant
 * `destroy()` / `close()` les objets désignés dans `evincees`. Générique sur le type de clé `T` (number pour les docs, string pour les rendus).
 */
export function rangerEtEvincer<T>(ordre: T[], cle: T, max: number): { ordre: T[]; evincees: T[] } {
  const base = ordre.filter((k) => k !== cle);
  base.push(cle);
  const evincees: T[] = [];
  while (base.length > max) evincees.push(base.shift() as T);
  return { ordre: base, evincees };
}
