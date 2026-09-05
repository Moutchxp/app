/**
 * LOT 100 — ORIGINE (auto / manuelle) de l'extraction NON-IA, tracée PAR LIGNE de `permis_extraction_journal`. Constat du LOT 99 : le
 * journal n'avait aucune colonne d'origine ; le discriminant vit dans `majPar` (déjà fileté à tous les writers) mais n'était écrit que
 * sur `maj_par` des colonnes de valeur (dernier écrivain, par champ). Ce module ferme la ligne 6 de l'échelle du LOT 99.
 *
 * DEUX briques PURES/RÉSILIENTES, partagées par TOUS les writers :
 *  · `origineDepuisMajPar` : traduit le `majPar` de déclenchement en axe { 'auto' | 'manuelle' | null }. `analyse:*` = passage en Analyse
 *    (56-C, SANS geste) = AUTO ; `extraction:*` = relance admin / gabarit CLI (déclenchement HUMAIN) = MANUELLE ; inconnu → null
 *    (indéterminée, JAMAIS présumé — règle Arno / précédent LOT 79).
 *  · `suffixeOrigine` : ajoute la colonne `origine` à un INSERT EXISTANT (le SQL littéral des writers est CONSERVÉ tel quel — on n'ajoute
 *    qu'un suffixe), UNIQUEMENT si la colonne existe. RÉSILIENT : migration 196 absente (42P01/42703 sur la détection) → aucun suffixe,
 *    l'INSERT reste celui d'avant, origine « indéterminée ». La détection est mémoïsée (une seule requête `information_schema` par process).
 */
import { query } from '../db/client';

export type OrigineExtraction = 'auto' | 'manuelle';

/** Axe d'origine déduit du `majPar` de déclenchement. PUR. Inconnu / vide → null (indéterminée, jamais présumé). */
export function origineDepuisMajPar(majPar: string | null | undefined): OrigineExtraction | null {
  if (!majPar) return null;
  if (majPar.startsWith('analyse:')) return 'auto';        // passage en Analyse (56-C) & tout déclenchement automatique
  if (majPar.startsWith('extraction:')) return 'manuelle'; // relance admin (route extraire), gabarit CLI — extraction HUMAINE
  return null;                                              // majPar non reconnu → indéterminée
}

type QueryFn = typeof query;
let _colonneOrigine: boolean | null = null;
/** Test-only : réinitialise la mémoïsation de la détection de colonne. */
export function _resetCacheColonneOrigine(): void { _colonneOrigine = null; }

/** La colonne `origine` existe-t-elle ? Mémoïsé (1 requête max/process). Toute erreur → false (repli sûr : comportement d'avant). */
async function aColonneOrigine(q: QueryFn): Promise<boolean> {
  if (_colonneOrigine !== null) return _colonneOrigine;
  try {
    const r = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'permis_extraction_journal' AND column_name = 'origine'`);
    _colonneOrigine = (r.rows?.length ?? 0) > 0;
  } catch { _colonneOrigine = false; }
  return _colonneOrigine;
}

/**
 * Suffixe à greffer sur un INSERT du journal pour porter l'origine, SANS toucher au reste du SQL (littéraux/positions conservés). Le
 * writer passe le nombre de paramètres liés DÉJÀ présents (`nbParamsBase`) : la colonne `origine` prend le placeholder suivant.
 * Colonne absente → tout vide (INSERT inchangé). Usage :
 *   const og = await suffixeOrigine(params.length, origine);
 *   await query(`INSERT … (…, extrait_le${og.cols}) VALUES (…, now()${og.vals})`, [...params, ...og.params]);
 */
export async function suffixeOrigine(nbParamsBase: number, origine: OrigineExtraction | null, q: QueryFn = query): Promise<{ cols: string; vals: string; params: (OrigineExtraction | null)[] }> {
  if (!(await aColonneOrigine(q))) return { cols: '', vals: '', params: [] };
  return { cols: ', origine', vals: `, $${nbParamsBase + 1}`, params: [origine] };
}

/**
 * LOT 100 — origine de la dernière extraction NON-IA d'un dossier (pour la ligne 6 de l'échelle LOT 99 : « identifiée sans IA »). On
 * prend l'origine de la ligne de journal NON-IA (methode ≠ 'ia') la PLUS RÉCENTE qui en porte une. `null` = indéterminée (aucune ligne
 * tracée : lignes historiques d'avant migration 196, ou dossier jamais extrait). RÉSILIENT : colonne/table absente → null.
 */
export async function lireOrigineExtractionSansIa(dossierId: number): Promise<OrigineExtraction | null> {
  try {
    const r = await query<{ origine: OrigineExtraction | null }>(
      `SELECT origine FROM permis_extraction_journal
         WHERE dossier_id = $1 AND methode <> 'ia' AND origine IS NOT NULL
         ORDER BY extrait_le DESC NULLS LAST LIMIT 1`, [dossierId]);
    return r.rows[0]?.origine ?? null;
  } catch { return null; } // 42703 (colonne absente) / 42P01 → indéterminée (comportement d'avant)
}
