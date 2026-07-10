import 'server-only';
import { lireGrandLivre } from './requete';

/**
 * M2 — LOT 4. k-ANONYMAT À LA RESTITUTION (le point sensible). On n'efface RIEN en base ; on REFUSE de
 * restituer un chiffre ré-identifiant. Deux garanties, alignées sur `SPEC_M2_rgpd` §A.3-A.5 :
 *  - SUPPRESSION PRIMAIRE : une cellule (commune, provenance…) dont le compte est < k est masquée.
 *  - SUPPRESSION SECONDAIRE / COMPLÉMENTAIRE (§A.5) : masquer une cellule tout en publiant un total la
 *    rendrait déductible par soustraction. On ne restitue donc le total du groupe masqué QUE s'il agrège
 *    ≥ 2 cellules ET ≥ k (sinon = une identité) ; et on n'expose JAMAIS le grand total incluant les
 *    masquées (pas de canal de soustraction). Si le résidu masqué est une seule cellule ou < k, son total
 *    est CACHÉ (on ne montre que « N zones masquées »).
 *
 * Le seuil k est LU AU RUNTIME depuis la config (`analytics_config.k_anonymat_min`, migration 020) → un
 * changement en base modifie le masquage sans redéploiement. Repli sûr = 11 (plancher SPEC §A.3.4).
 */

/** Plancher INSEE (SPEC §A.3.4) : repli si la config est absente/illisible. À CONFIRMER PAR DPO. */
export const K_DEFAUT = 11;

/** Lit le seuil k depuis la config au runtime (repli 11). Un entier ≤ 0 ou illisible → repli. */
export async function lireSeuilK(): Promise<number> {
  try {
    const rows = await lireGrandLivre<{ valeur: string }>(
      `SELECT valeur FROM analytics_config WHERE cle = 'k_anonymat_min'`,
    );
    const v = Number(rows[0]?.valeur);
    return Number.isInteger(v) && v > 0 ? v : K_DEFAUT;
  } catch {
    return K_DEFAUT;
  }
}

/** Agrégat du groupe masqué : ≥ 2 cellules ET ≥ k (sinon la ventilation entière est déclarée `insuffisant`). */
export interface GroupeMasque {
  nbCellules: number;
  total: number;
}

/**
 * Résultat d'une ventilation k-anonymisée. Soit une restitution SÛRE (`visibles` + éventuel `masque`
 * agrégé ≥ 2 cellules ≥ k), soit `insuffisant: true` (RIEN n'est restitué : ni cellules, ni compte de
 * masquées). ⚠️ Le mode `insuffisant` est INDISPENSABLE contre la SOUSTRACTION par une métrique frère :
 * une autre métrique du payload expose le total EXACT de la même population (ex. `trafic` = Σ session_fin,
 * `analyses.resultats` = Σ resultat). Si l'on exposait des `visibles` (ou un `nbCellules`) alors qu'il
 * reste un résidu masqué non sécurisable, l'attaquant ferait `total_frère − Σ(visibles)` = la cellule
 * masquée. On supprime donc TOUT dès que le résidu masqué ne peut agréger ≥ 2 cellules ET ≥ k.
 */
export interface VentilationSure<T> {
  visibles: T[];
  masque: GroupeMasque | null;
  insuffisant?: boolean;
}

/**
 * Applique les suppressions primaire ET secondaire à une ventilation par une dimension ré-identifiante
 * (commune, campagne, referer…). PURE et déterministe. `cells` : cellules `{…, n}`. `k` : seuil runtime.
 *
 * Algorithme : masque les cellules < k, puis TANT QUE le groupe masqué pourrait isoler une cellule
 * (1 seule masquée, ou somme masquée < k), tire la PLUS PETITE visible dans le masqué. Si le résidu masqué
 * final agrège ≥ 2 cellules ET ≥ k → restitution sûre (visibles + total du masqué). Sinon → `insuffisant`
 * (tout supprimé) : c'est le seul état où aucune soustraction par un total frère ne peut isoler une cellule.
 */
export function ventilerSous_k<T extends { n: number }>(cells: T[], k: number): VentilationSure<T> {
  const somme = (arr: T[]) => arr.reduce((s, c) => s + c.n, 0);
  // Tri croissant : on tirera les plus petites visibles en secondaire.
  const tri = [...cells].sort((a, b) => a.n - b.n);
  const masque: T[] = tri.filter((c) => c.n < k);
  const visibles: T[] = tri.filter((c) => c.n >= k);
  while (masque.length >= 1 && (masque.length < 2 || somme(masque) < k) && visibles.length > 0) {
    masque.push(visibles.shift()!); // la plus petite visible bascule dans le masqué
  }
  if (masque.length === 0) return { visibles, masque: null }; // tout ≥ k → aucune masquée, aucune soustraction possible
  const s = somme(masque);
  if (masque.length >= 2 && s >= k) return { visibles, masque: { nbCellules: masque.length, total: s } };
  // Résidu masqué NON sécurisable (< 2 cellules OU < k) : exposer visibles/nbCellules laisserait déduire la
  // cellule masquée par soustraction d'un total frère → on SUPPRIME toute la ventilation.
  return { visibles: [], masque: null, insuffisant: true };
}
