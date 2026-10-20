import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { honorairesGestionDisponible } from '../gestion/schema';
import { enregistrerConditions, lireReglages } from '../gestion/honorairesGestionRepo';
import { proposerTaux } from '../gestion/honorairesGestion';
import { enCentimes, eurosExacts, type LoyerMensuel } from './conditionsEntree';
import { bailDisponible, sqlConditionsDe } from './bailRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE LOYER MENSUEL À L'ENTRÉE (Arno, 20/10/2026). IMPUR (base). ════════════════════════════════════
 *
 * « Loyer principal », « Provision pour charges » : c'est le LOYER DE DÉPART de la location, déjà en base depuis la migration
 * 370 (`gestion_location_conditions.loyer_hc` et `provisions`, ajout seul) — la donnée que montre et modifie la carte
 * « Location » de la fiche. On l'écrit PAR LA MÊME FONCTION (`enregistrerConditions`), jamais dans une seconde colonne.
 *
 * 🔴 UNE SEULE OCCUPATION PORTE LE LOYER (la règle de l'écran « Honoraires de gestion » : « le loyer se saisit sur UNE carte ;
 *    les autres occupations du même lot, à la même date d'entrée, sont COUVERTES ») : celle du logement, au premier locataire.
 *    Le taux de gestion et la base que la table exige sont ceux que la carte PROPOSE (location précédente du lot › taux
 *    WIPPIMMO › réglage agence ; base du réglage agence) — modifiables ensuite sur la carte.
 * 🔴 Sans la migration 370, rien n'est lu ni écrit : l'écran le dit.
 */

/** Le loyer de départ déjà connu pour ce bien (la location la plus récente du lot qui en a un), pour pré-remplir. */
export async function loyerConnuDuBien(lotId: number): Promise<(LoyerMensuel & { entree: string | null }) | null> {
  if (!(await honorairesGestionDisponible())) return null;
  const avecBail = await bailDisponible();
  const { rows } = await query<{ loyer: string | null; provisions: string | null; entree: string | null }>(
    `SELECT c.loyer_hc::text AS loyer, c.provisions::text AS provisions, o.entree::text AS entree
       FROM gestion_annuaire_occupation o
       JOIN LATERAL (SELECT x.loyer_hc, x.provisions FROM gestion_location_conditions x WHERE ${sqlConditionsDe('x', 'o', avecBail)} ORDER BY x.id DESC LIMIT 1) c ON true
      WHERE o.lot_id = $1 AND c.loyer_hc IS NOT NULL
      ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1`, [lotId]);
  const r = rows[0];
  if (r === undefined) return null;
  return { principal: enCentimes(r.loyer) ?? null, provisions: enCentimes(r.provisions) ?? null, entree: r.entree };
}

/** Le loyer mensuel d'un bail (ses occupations) : la ligne de conditions la plus récente qui porte un loyer. */
export async function loyerDesOccupations(occupationIds: readonly number[]): Promise<LoyerMensuel | null> {
  if (occupationIds.length === 0 || !(await honorairesGestionDisponible())) return null;
  const avecBail = await bailDisponible();
  const { rows } = await query<{ loyer: string | null; provisions: string | null }>(
    `SELECT x.loyer_hc::text AS loyer, x.provisions::text AS provisions FROM gestion_location_conditions x
      WHERE (x.occupation_id = ANY($1::bigint[])${avecBail
        ? ' OR x.bail_id IN (SELECT o.bail_id FROM gestion_annuaire_occupation o WHERE o.id = ANY($1::bigint[]))' : ''})
        AND (x.loyer_hc IS NOT NULL OR x.provisions IS NOT NULL)
      ORDER BY x.id DESC LIMIT 1`, [[...occupationIds]]);
  const r = rows[0];
  return r === undefined ? null : { principal: enCentimes(r.loyer) ?? null, provisions: enCentimes(r.provisions) ?? null };
}

/** Le taux et la base que la carte « Location » proposerait pour ce lot (la même règle, `proposerTaux`). */
async function tauxEtBaseProposes(q: RequeteTx, lotId: number, occupationId: number): Promise<{ taux: number; base: 'cc' | 'hc' }> {
  const reglages = await lireReglages(q);
  const avecBail = await bailDisponible();
  const { rows } = await q<{ precedent: string | null; wippimmo: string | null; actuel: string | null; base_actuelle: string | null }>(
    `SELECT (SELECT y.taux_gestion_ht::text FROM gestion_annuaire_occupation o2
               JOIN LATERAL (SELECT z.taux_gestion_ht FROM gestion_location_conditions z WHERE ${sqlConditionsDe('z', 'o2', avecBail)} ORDER BY z.id DESC LIMIT 1) y ON true
              WHERE o2.lot_id = $1 AND o2.id <> $2${avecBail ? ' AND o2.bail_id IS DISTINCT FROM (SELECT bail_id FROM gestion_annuaire_occupation WHERE id = $2)' : ''}
              ORDER BY o2.entree DESC NULLS LAST, o2.id DESC LIMIT 1) AS precedent,
            (SELECT taux_honos_wippimmo::text FROM gestion_annuaire_lot WHERE id = $1) AS wippimmo,
            (SELECT x.taux_gestion_ht::text FROM gestion_location_conditions x, gestion_annuaire_occupation o WHERE o.id = $2 AND ${sqlConditionsDe('x', 'o', avecBail)} ORDER BY x.id DESC LIMIT 1) AS actuel,
            (SELECT x.base FROM gestion_location_conditions x, gestion_annuaire_occupation o WHERE o.id = $2 AND ${sqlConditionsDe('x', 'o', avecBail)} ORDER BY x.id DESC LIMIT 1) AS base_actuelle`, [lotId, occupationId]);
  const r = rows[0];
  // Une location qui a déjà ses conditions garde son taux et sa base ; sinon, ce que la carte propose.
  if (r?.actuel != null) return { taux: Number(r.actuel), base: r.base_actuelle === 'hc' ? 'hc' : 'cc' };
  const t = proposerTaux({ precedent: r?.precedent == null ? null : Number(r.precedent), wippimmo: r?.wippimmo == null ? null : Number(r.wippimmo), reglage: reglages.tauxDefautHt });
  return { taux: t.taux, base: reglages.baseDefaut };
}

/**
 * ÉCRIT le loyer mensuel sur l'occupation qui le porte (dans la transaction de l'appelant), par `enregistrerConditions`
 * (ajout seul, journalisé). À l'entrée, rien si les deux montants sont vides. `occupationId` : celle du logement, au premier locataire.
 */
export async function ecrireLoyerDans(q: RequeteTx, occupationId: number, lotId: number, l: LoyerMensuel, auteur: Auteur,
  /** « Modifier » : un loyer VIDÉ s'écrit aussi (une ligne de plus, sans montant) — jamais ignoré en silence. */
  videAutorise = false): Promise<void> {
  if (!videAutorise && l.principal === null && l.provisions === null) return;
  const { taux, base } = await tauxEtBaseProposes(q, lotId, occupationId);
  const r = await enregistrerConditions(occupationId, {
    loyerHc: l.principal === null ? '' : eurosExacts(l.principal), provisions: l.provisions === null ? '' : eurosExacts(l.provisions),
    tauxHt: taux, base,
  }, auteur, q);
  if (r.etat !== 'ok') throw new Error(r.etat === 'refus' ? r.motif : `loyer de départ non enregistré (${r.etat})`);
}

/** La saisie → le loyer (centimes) ; `null` si un montant est illisible (la règle `manquesConditions` l'a déjà dit). */
export function loyerDeLaSaisie(brut: unknown): LoyerMensuel | null {
  const b = (brut !== null && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const principal = enCentimes(b.principal);
  const provisions = enCentimes(b.provisions);
  if (principal === undefined || provisions === undefined) return null;
  return { principal, provisions };
}
