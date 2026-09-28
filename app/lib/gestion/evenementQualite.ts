/**
 * MODULE « GESTION » — LOT CONTACTS-ET-EVENEMENT : DE QUOI S'AGIT-IL, ET EST-CE URGENT ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE À PART. Ces listes et ces mots sont lus des DEUX côtés de la frontière : par le geste
 * serveur qui écrit la carte (`gestes.ts`, qui tire `pg`) ET par le bloc « Événement rattaché », qui est un
 * composant de NAVIGATEUR. Les laisser dans `gestes.ts` obligeait le navigateur à importer un module qui remonte
 * jusqu'à `pg`, donc jusqu'à `dns` — et webpack refuse alors de construire TOUTE l'application, page de connexion
 * comprise. C'est l'incident du 24/09/2026, et le garde `clientBoundary.guard.test.ts` l'a rattrapé ici même
 * pendant l'écriture de ce lot.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE BASE, AUCUN React. Des constantes et quatre fonctions pures.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les quatre catégories d'Arno, mot pour mot. La base les tient aussi (migration 268). */
export const CATEGORIES_EVENEMENT = ['travaux', 'fuite_eau', 'administratif', 'litige'] as const;

/** Les trois degrés d'urgence. Le MOT est toujours écrit à l'écran, jamais une couleur seule. */
export const URGENCES_EVENEMENT = ['normale', 'haute', 'critique'] as const;

/**
 * La catégorie retenue, ou `null`. PUR.
 *
 * ⚠️ ON N'INVENTE JAMAIS UNE CATÉGORIE QU'ON N'A PAS COMPRISE. Une valeur hors liste vaut « non précisé » — et la
 * contrainte de la base la refuserait de toute façon : deux gardes pour la même règle, parce qu'un garde applicatif
 * se contourne au prochain script et une contrainte non.
 */
export function categorieValide(brut: unknown): string | null {
  return typeof brut === 'string' && (CATEGORIES_EVENEMENT as readonly string[]).includes(brut) ? brut : null;
}

/** L'urgence retenue, ou `null`. PUR. */
export function urgenceValide(brut: unknown): string | null {
  return typeof brut === 'string' && (URGENCES_EVENEMENT as readonly string[]).includes(brut) ? brut : null;
}

/** Le mot d'une catégorie, tel qu'il s'affiche. PUR. */
export function motCategorie(c: string | null | undefined): string {
  if (c === 'travaux') return 'Travaux';
  if (c === 'fuite_eau') return 'Fuite d’eau';
  if (c === 'administratif') return 'Administratif';
  if (c === 'litige') return 'Litige';
  return 'Non précisée';
}

/** Le mot d'une urgence, tel qu'il s'affiche. PUR. */
export function motUrgence(u: string | null | undefined): string {
  if (u === 'critique') return 'Critique';
  if (u === 'haute') return 'Haute';
  if (u === 'normale') return 'Normale';
  return 'Non précisée';
}

/**
 * L'ÉVÉNEMENT EFFECTIF D'UN MAIL, tel que l'écran le reçoit. Le type vit ici, du côté PUR, pour que le composant
 * de navigateur n'ait aucune raison d'importer le dépôt qui le produit.
 */
export interface EvenementDuMail {
  evenementId: number;
  reference: string;
  objet: string;
  etat: string;
  /** `mail` = posé sur ce message seul ; `conversation` = hérité de son échange. */
  portee: 'mail' | 'conversation';
  categorie: string | null;
  urgence: string | null;
}
