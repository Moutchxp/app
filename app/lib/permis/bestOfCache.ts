/**
 * P1 (perfo) — CACHE MÉMOIRE du « best-of » PDF (résultat de l'extraction texte des pièces de la GED : classement par famille +
 * confirmation des planches + détection Cerfa). C'est le poste de coût DOMINANT de `GET /emprise` (jusqu'à ~164 téléchargements +
 * extractions PDF sur 11430). Ce résultat est DÉTERMINISTE pour une GED donnée : il ne dépend NI de l'emprise tracée, NI des validations,
 * NI du repérage image (fusionné hors cache, en aval) — SEULEMENT des pièces PDF (dossier_document).
 *
 * 🔴 INVALIDATION par la CLÉ (pas d'invalidation explicite à maintenir, donc pas d'oubli possible) : la clé = dossier + EMPREINTE de la
 *    liste des pièces PDF (id + clé de stockage + taille + nom). Toute mutation de la GED (ajout / suppression / remplacement / renommage)
 *    change l'empreinte → clé différente → cache MISS → recalcul frais. Un même dossier NE partage JAMAIS d'entrée avec un autre (dossierId dans la clé).
 * 🔴 EN CAS DE DOUTE, RECALCULE : un calcul qui a subi une extraction en échec (téléchargement/lecture PDF ratée, potentiellement TRANSITOIRE)
 *    n'est PAS mis en cache (`cachable=false`) → il sera refait au prochain appel plutôt que de figer un best-of dégradé.
 * VIT EN MÉMOIRE DU PROCESSUS (aucune table, aucune migration). Au REDÉMARRAGE : cache vidé → 1er appel recalcule à froid. Donc un
 *    changement fait pendant l'arrêt n'est JAMAIS masqué (rien à survivre). Borné (LRU simple) pour ne pas fuir en mémoire.
 */

export interface EmpreintePiecePdf { id: number; cleStockage: string; tailleOctets: number | null; nomFichier: string }

/** EMPREINTE PURE de la GED (pièces PDF) : ordonnée par id, jointe. Change dès qu'une pièce est ajoutée / supprimée / remplacée / renommée. */
export function empreinteGed(pieces: EmpreintePiecePdf[]): string {
  return [...pieces]
    .sort((a, b) => a.id - b.id)
    .map((p) => `${p.id}:${p.cleStockage}:${p.tailleOctets ?? ''}:${p.nomFichier}`)
    .join('|');
}

const CACHE = new Map<string, unknown>();
const MAX_ENTREES = 200; // borne mémoire : ~200 best-of (dossiers récents × empreintes). Éviction LRU du plus ancien.

/**
 * Mémoïse `calcul` sous la clé (dossier + empreinte). HIT → renvoie la valeur cachée (best-of IDENTIQUE à un calcul frais, l'empreinte
 * garantissant la même GED). MISS → exécute `calcul`, range la valeur SI `cachable`, la renvoie. `calcul` renvoie `cachable=false` quand
 * une extraction a échoué (doute → on ne fige rien, on recalculera). PUR côté cache (aucune I/O ici : l'I/O est dans `calcul`).
 */
export async function bestOfMemo<T>(dossierId: number, empreinte: string, calcul: () => Promise<{ valeur: T; cachable: boolean }>): Promise<T> {
  const cle = `${dossierId}:${empreinte}`;
  if (CACHE.has(cle)) {
    const v = CACHE.get(cle) as T;
    CACHE.delete(cle); CACHE.set(cle, v); // LRU : re-range en tête de fraîcheur
    return v;
  }
  const { valeur, cachable } = await calcul();
  if (cachable) {
    CACHE.set(cle, valeur);
    if (CACHE.size > MAX_ENTREES) { const plusAncien = CACHE.keys().next().value; if (plusAncien !== undefined) CACHE.delete(plusAncien); }
  }
  return valeur;
}

/** TEST ONLY — vide le cache pour l'isolation entre cas. Jamais appelé en production. */
export function _viderBestOfCache(): void { CACHE.clear(); }
