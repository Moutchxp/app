/**
 * LOT 23 — PRÉCHARGEMENT des pièces voisines du best-of + CACHE LRU BORNÉ de la liseuse. LOGIQUE PURE (aucun DOM, aucun pdf.js),
 * extraite pour être TESTÉE : QUELLES pièces précharger autour du plan courant, et QUELLE pièce évincer quand le cache déborde.
 * Le composant `LiseusePieces.tsx` pilote son `Map` de documents pdf.js avec EXACTEMENT ces décisions → une SEULE vérité (jamais
 * une 2e implémentation de la règle d'éviction dispersée dans le composant).
 */

/** Nombre maximum de DOCUMENTS pdf.js gardés en mémoire simultanément : courant + les 2 voisins préchargés + 1 déjà consulté. */
export const MAX_DOCS_CACHE = 4;

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

/** Remonte une clé en position la plus FRAÎCHE (fin de liste) si elle est présente ; sinon renvoie l'ordre inchangé. PUR. */
export function toucher(ordre: number[], cle: number): number[] {
  if (!ordre.includes(cle)) return ordre;
  return [...ordre.filter((k) => k !== cle), cle];
}

/**
 * Range une clé comme la plus FRAÎCHE puis, si le cache dépasse `max`, désigne les clés à ÉVINCER — les plus ANCIENNES d'abord
 * (`ordre` = du plus ancien au plus frais). La clé qu'on vient de ranger n'est JAMAIS évincée (elle est la plus fraîche) → le
 * document COURANT ne peut pas être libéré sous les pieds de l'affichage. PUR : aucune destruction ici, l'appelant `destroy()`
 * les documents désignés dans `evincees`.
 */
export function rangerEtEvincer(ordre: number[], cle: number, max: number): { ordre: number[]; evincees: number[] } {
  const base = ordre.filter((k) => k !== cle);
  base.push(cle);
  const evincees: number[] = [];
  while (base.length > max) evincees.push(base.shift() as number);
  return { ordre: base, evincees };
}
