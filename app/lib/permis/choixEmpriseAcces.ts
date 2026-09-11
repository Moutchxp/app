/**
 * BAT — ACCÈS À L'EMPRISE (module PUR, testé). Quand une CARTE DE BÂTIMENT porte PLUSIEURS emprises reconstituées, laquelle l'accès
 * (capsule « Caractéristiques » → « Bâtiments et projection ») doit-il pointer / dont il restaure la planche ? Règle d'Arno :
 *  · l'emprise VALIDÉE s'il y en a une (c'est la décision ACTÉE, celle qu'on vient vérifier) ;
 *  · sinon la PLUS RÉCENTE (le dernier tracé posé — le plus probablement pertinent).
 * Aucune emprise → `null` : rien à pointer (l'accès ouvre alors le tracé vierge du bâtiment).
 *
 * Entrée : la liste d'emprises d'UNE carte (déjà filtrée par corps par l'appelant). Sortie : l'emprise retenue, ou null. AUCUNE
 * mutation (aucun tri en place). « Plus récente » = date de création décroissante (`creeLe`, ISO comparable lexicographiquement),
 * puis numéro stable décroissant (`numero`), puis `id` — repli ROBUSTE quand `creeLe`/`numero` sont absents (migrations non appliquées :
 * `creeLe`/`numero` null). Une emprise datée est toujours « plus récente » qu'une emprise sans date (null trié en dernier).
 */
export interface EmpriseChoisissable {
  id: number;
  validee: boolean;
  creeLe: string | null;
  numero: number | null;
}

/** La PLUS RÉCENTE de deux emprises. Déterministe et total : à égalité stricte de tous les critères, l'id le plus grand l'emporte. */
function plusRecente<T extends EmpriseChoisissable>(a: T, b: T): T {
  const da = a.creeLe ?? '', db = b.creeLe ?? ''; // null → '' : trié en dernier (toute date ISO non vide > '')
  if (da !== db) return da > db ? a : b;
  const na = a.numero ?? Number.NEGATIVE_INFINITY, nb = b.numero ?? Number.NEGATIVE_INFINITY;
  if (na !== nb) return na > nb ? a : b;
  return a.id >= b.id ? a : b;
}

/** Emprise que l'accès doit pointer pour une carte : la validée (la plus récente s'il y en a plusieurs), sinon la plus récente ; null si aucune. */
export function choisirEmpriseAcces<T extends EmpriseChoisissable>(emprises: readonly T[]): T | null {
  if (emprises.length === 0) return null;
  const validees = emprises.filter((e) => e.validee);
  const pool = validees.length > 0 ? validees : emprises;
  return pool.reduce((meilleure, e) => plusRecente(meilleure, e));
}
