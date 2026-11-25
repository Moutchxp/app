import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { conditionsParOccupation } from './conditionsEntreeRepo';
import { colonneExisteMemo } from './sondeLocation';
import { MONTANT_MAX, MOTIF_MONTANT_VINGT_OBLIGATOIRE, MOTIF_SANS_516, montantEuros, origineMontantVingt, vingtPourcentDuDepot, type MontantVingt } from './vingtPourcent';

/**
 * ══ 🔴🔴 LE MONTANT DES 20 % RETENUS (Arno, 25/11/2026, 22h06). IMPUR (base). ══════════════════════════════════════════════════════════════════════
 * Table en AJOUT SEUL (migration 516) : chaque montant posé sur une sortie validée est une ligne ; la DERNIÈRE fait foi. Sans montant enregistré, il est
 * CALCULÉ à la lecture (20 % du dépôt de garantie des conditions d'entrée du bail, en centimes) — rien n'est écrit ; sans dépôt connu : `null` (« à saisir »).
 */
export const montantVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_montant_vingt', 'montant');

/** Le dépôt de garantie (CENTIMES) des conditions d'entrée de chaque occupation ; `null` : inconnu. LECTURE SEULE. */
export async function depotsDesOccupations(occupationIds: readonly number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const c = await conditionsParOccupation(occupationIds).catch(() => new Map());
  for (const id of occupationIds) {
    const d = (c.get(id) as { conditions?: { sommes?: { depotGarantie?: number | null } } } | undefined)?.conditions?.sommes?.depotGarantie;
    out.set(id, typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null);
  }
  return out;
}
/** Le dépôt d'une sortie : celui de la première de ses occupations qui en a un (les colocataires partagent le bail). PUR. */
export const depotDeLaSortie = (occupationIds: readonly number[], depots: ReadonlyMap<number, number | null>): number | null =>
  occupationIds.map((o) => depots.get(o) ?? null).find((d) => d !== null) ?? null;

/** Le montant de chaque sortie : la dernière saisie enregistrée, sinon le calcul sur le dépôt, sinon `null`. LECTURE SEULE. */
export async function montantsDesSorties(sortieIds: readonly number[]): Promise<Map<number, MontantVingt | null>> {
  const out = new Map<number, MontantVingt | null>();
  if (sortieIds.length === 0) return out;
  const { rows: so } = await query<{ id: string; occ: string[] }>(
    `SELECT s.id::text, s.occupation_ids::text[] AS occ FROM gestion_location_sortie_validee s WHERE s.id = ANY($1::bigint[])`, [[...sortieIds]]);
  const stockes = new Map<number, MontantVingt>();
  if (await montantVingtDisponible()) {
    const { rows } = await query<{ sortie: string; montant: string; origine: 'calcule' | 'saisi'; depot: string | null }>(
      `SELECT DISTINCT ON (m.sortie_validee_id) m.sortie_validee_id::text AS sortie, m.montant::text, m.origine, m.depot_garantie::text AS depot
         FROM gestion_location_montant_vingt m WHERE m.sortie_validee_id = ANY($1::bigint[])
        ORDER BY m.sortie_validee_id, m.id DESC`, [[...sortieIds]]);
    for (const r of rows) stockes.set(Number(r.sortie), { montant: Number(r.montant), origine: r.origine, depot: r.depot === null ? null : Number(r.depot) });
  }
  const occ = so.flatMap((r) => r.occ.map(Number));
  const depots = await depotsDesOccupations([...new Set(occ)]);
  for (const r of so) {
    const id = Number(r.id);
    const s = stockes.get(id);
    if (s !== undefined) { out.set(id, s); continue; }
    const depot = depotDeLaSortie(r.occ.map(Number), depots);
    out.set(id, depot === null ? null : { montant: vingtPourcentDuDepot(depot), origine: 'calcule', depot: depot / 100 });
  }
  return out;
}

/** Écrit un montant (une ligne de plus). `q` : la requête d'une transaction en cours, sinon la base. */
export async function noterMontantVingt(m: { sortieId: number; montant: number; depotCentimes: number | null }, auteur: Auteur,
  q: typeof query = query): Promise<MontantVingt> {
  const origine = origineMontantVingt(m.montant, m.depotCentimes);
  const depot = m.depotCentimes === null ? null : m.depotCentimes / 100;
  await q(`INSERT INTO gestion_location_montant_vingt (sortie_validee_id, montant, origine, depot_garantie, saisi_par, saisi_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
    [m.sortieId, m.montant, origine, depot, auteur.id, auteur.libelle]);
  return { montant: m.montant, origine, depot };
}

/** Le montant envoyé par l'écran, vérifié (euros, au centime) ; `null` : vide ou illisible. PUR. */
export function montantVingtSaisi(brut: unknown): number | null {
  const m = montantEuros(brut);
  return typeof m === 'number' && m > 0 && m <= MONTANT_MAX ? m : null;
}

/** SAISIE depuis la ligne « 20 % à restituer » (sortie existante, montant à saisir ou à corriger) : une ligne de plus, journalisée au bien. */
export async function saisirMontantVingt(d: Record<string, unknown>, auteur: Auteur): Promise<{ etat: 'ok'; data: MontantVingt } | { etat: 'refus'; motif: string; champ?: string }> {
  if (!(await montantVingtDisponible())) return { etat: 'refus', motif: MOTIF_SANS_516 };
  const sortieId = typeof d.sortieId === 'number' && Number.isSafeInteger(d.sortieId) && d.sortieId > 0 ? d.sortieId : null;
  if (sortieId === null) return { etat: 'refus', motif: 'Sortie inconnue : rechargez la page.' };
  const montant = montantVingtSaisi(d.montant);
  if (montant === null) return { etat: 'refus', motif: MOTIF_MONTANT_VINGT_OBLIGATOIRE, champ: 'montant' };
  const { rows } = await query<{ lot: string; retenue: boolean; occ: string[] }>(
    `SELECT s.lot_id::text AS lot, s.retenue_20 AS retenue, s.occupation_ids::text[] AS occ FROM gestion_location_sortie_validee s WHERE s.id = $1`, [sortieId]);
  const s = rows[0];
  if (s === undefined || !s.retenue) return { etat: 'refus', motif: 'Cette sortie n’a pas de retenue de 20 % : rien n’est enregistré.' };
  const depots = await depotsDesOccupations(s.occ.map(Number));
  const r = await noterMontantVingt({ sortieId, montant, depotCentimes: depotDeLaSortie(s.occ.map(Number), depots) }, auteur);
  await query(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'location_montant_20', $2, $3, $4, $5)`,
    [Number(s.lot), String(montant), `montant des 20 % retenus (sortie validée ${sortieId}) : ${montant.toFixed(2).replace('.', ',')} € (${r.origine === 'calcule' ? 'calculé sur le dépôt de garantie' : 'saisi à la main'})`,
      auteur.id, auteur.libelle]).catch(() => { /* le montant est écrit ; le journal suivra */ });
  return { etat: 'ok', data: r };
}
