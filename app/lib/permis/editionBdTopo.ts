/**
 * BDT-2 — lecture du MILLÉSIME de l'édition BD TOPO courante, pour stamper le registre de preuve (FUS-3f) SANS coder 'inconnu' en
 * dur. RÉSILIENT : tant que la migration 120 n'est pas appliquée, la table n'existe pas → `to_regclass` (SELECT, ne poisonne pas
 * la transaction) le détecte et on retombe sur 'inconnu'. Idem si aucune édition n'est marquée `courante`. On n'INVENTE jamais un
 * millésime : à défaut d'une édition stampée, c'est 'inconnu' — jamais une date supposée.
 *
 * ⚠️ N'affecte QUE les écritures FUTURES du registre. Les lignes passées de permis_altitude_journal (append-only) ne sont JAMAIS
 * réécrites.
 */
import type { RequeteTx } from '../db/client';

/** Le littéral écrit quand aucune édition n'est stampée (couche `batiment` chargée hors dépôt, sans étiquette). */
export const MILLESIME_INCONNU = 'inconnu';

/** Millésime de l'édition BD TOPO COURANTE (bdtopo_edition.courante), ou 'inconnu' si la table/édition n'existe pas encore. */
export async function millesimeEditionCourante(q: RequeteTx): Promise<string> {
  const reg = await q<{ t: string | null }>(`SELECT to_regclass('public.bdtopo_edition') AS t`);
  if (reg.rows[0]?.t == null) return MILLESIME_INCONNU; // migration 120 non appliquée
  const { rows } = await q<{ millesime: string | null }>(
    `SELECT millesime FROM bdtopo_edition WHERE courante ORDER BY id DESC LIMIT 1`);
  return rows[0]?.millesime?.trim() || MILLESIME_INCONNU; // aucune édition courante → 'inconnu' (jamais supposé)
}
