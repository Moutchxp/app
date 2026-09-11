/**
 * BAT-3 — PRÉDICAT « la carte de bâtiment est ACTIVE » (migration 219 : permis_corps_batiment.actif), partagé par TOUS les lecteurs de
 * permis_corps_batiment. Constat de BAT-3 : une carte RETIRÉE (soft-delete, actif=false) doit être INVISIBLE de tous les lecteurs (compte
 * de bâtiments, écran, moteurs d'écriture, suivi, exports) — une seule fuite produirait une incohérence silencieuse (précédent BAT-2d).
 *
 * 🔴 RÉSILIENT (comme `journalExtraction.suffixeOrigine` / `colValideeEmpriseExiste`) : la colonne `actif` est SONDÉE une fois par process
 *    (information_schema, mémoïsé) AVANT tout filtrage. Colonne ABSENTE (219 non appliquée) → FRAGMENT VIDE : avant 219 aucune carte ne
 *    peut être inactive, donc NE PAS filtrer est STRICTEMENT le comportement d'avant (aucune régression, aucun crash 42703). Après 219, le
 *    fragment ` AND <alias>.actif` écarte les cartes retirées. Le littéral SQL des lecteurs est CONSERVÉ tel quel — on n'intercale qu'un fragment.
 */
import { query } from '../db/client';

type QueryFn = typeof query;
let _colonneActif: boolean | null = null;
/** Test-only : réinitialise la mémoïsation de la sonde de colonne (le cache est partagé par tous les lecteurs). */
export function _resetCacheCorpsActif(): void { _colonneActif = null; }

/** La colonne `actif` existe-t-elle (migration 219 appliquée) ? Mémoïsé (1 requête max/process). Toute erreur → false (repli sûr : comportement d'avant). */
export async function colonneCorpsActifDisponible(q: QueryFn = query): Promise<boolean> {
  if (_colonneActif !== null) return _colonneActif;
  try {
    const r = await q(`SELECT 1 FROM information_schema.columns WHERE table_name = 'permis_corps_batiment' AND column_name = 'actif'`);
    _colonneActif = (r.rows?.length ?? 0) > 0;
  } catch { _colonneActif = false; }
  return _colonneActif;
}

/**
 * Fragment SQL « la carte est ACTIVE » à intercaler dans un WHERE/JOIN existant sur permis_corps_batiment. `alias` = alias de la table
 * dans la requête ('' si aucun). `connecteur` = booléen qui PRÉCÈDE le prédicat (défaut 'AND'). Colonne absente → chaîne vide (voir en-tête).
 * Usage : `const fa = await fragmentCorpsActif('cb'); await query(\`… WHERE cb.dossier_id = $1${fa}\`, …)`.
 */
export async function fragmentCorpsActif(alias = '', connecteur: 'AND' | 'WHERE' = 'AND', q: QueryFn = query): Promise<string> {
  if (!(await colonneCorpsActifDisponible(q))) return '';
  const prefixe = alias ? `${alias}.` : '';
  return ` ${connecteur} ${prefixe}actif`;
}
