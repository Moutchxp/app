import 'server-only';
import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { libelleLoyerRevise, verifierLoyerRevise, type LoyerReviseLu } from './loyerRevise';

/**
 * ══ 🔴 Arno (25/10/2026, migration 423) — LES LOYERS RÉVISÉS RÉELS d'un bail (IMPUR : base) ══════════════════════════════════════════
 * Lus, ajoutés, annulés (une ligne annulée reste en base, marquée). Chaque geste est écrit au journal du bien. Sans la 423 : indisponible.
 */
export const MOT_SANS_423_LOYER = 'Mise à jour de la base à appliquer (migration 423) : les loyers révisés ne peuvent pas encore être enregistrés.';
export function loyersRevisesDisponibles(): Promise<boolean> { return colonneExisteMemo('gestion_location_loyer_revise', 'effet_le'); }
type Reponse = { etat: 'ok' } | { etat: 'refus'; motif: string } | { etat: 'indisponible'; motif: string };

/** Les loyers révisés (non annulés) d'un bail, par date d'effet. */
export async function lireLoyersRevises(bailId: number): Promise<{ disponible: boolean; loyers: LoyerReviseLu[] }> {
  if (!(await loyersRevisesDisponibles())) return { disponible: false, loyers: [] };
  const { rows } = await query<{ id: string; effet_le: string; loyer_hc: string; provisions: string | null; saisi_le: string; saisi_par_libelle: string }>(
    `SELECT id::text, effet_le::text, loyer_hc::text, provisions::text, saisi_le::text, saisi_par_libelle FROM gestion_location_loyer_revise
      WHERE bail_id = $1 AND annule_le IS NULL ORDER BY effet_le, id`, [bailId]);
  return { disponible: true, loyers: rows.map((r) => ({ id: Number(r.id), effetLe: r.effet_le, loyerHc: Number(r.loyer_hc),
    provisions: r.provisions === null ? null : Number(r.provisions), saisiLe: r.saisi_le, saisiPar: r.saisi_par_libelle })) };
}

const JOURNAL = `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
   VALUES ('annuaire_lot', $1, $2, NULL, NULL, $3, $4, $5)`;

/** Ajoute un loyer révisé réel (date d'effet après l'entrée, avant la sortie ; une même date d'effet déjà saisie est refusée). */
export async function ajouterLoyerRevise(bailId: number, brut: unknown, auteur: Auteur): Promise<Reponse> {
  if (!(await loyersRevisesDisponibles())) return { etat: 'indisponible', motif: MOT_SANS_423_LOYER };
  return withTransaction(async (q) => {
    const { rows } = await q<{ lot_id: string; entree: string | null; sortie: string | null }>(
      'SELECT lot_id::text, entree::text, sortie::text FROM gestion_bail WHERE id = $1 FOR UPDATE', [bailId]);
    const b = rows[0];
    if (b === undefined) return { etat: 'refus', motif: 'Ce bail n’existe plus.' } as const;
    const v = verifierLoyerRevise(brut, b);
    if (!v.ok) return { etat: 'refus', motif: v.motif } as const;
    const deja = await q('SELECT 1 FROM gestion_location_loyer_revise WHERE bail_id = $1 AND effet_le = $2 AND annule_le IS NULL', [bailId, v.effetLe]);
    if ((deja.rowCount ?? 0) > 0) return { etat: 'refus', motif: 'Un loyer révisé existe déjà à cette date d’effet : annulez-le d’abord pour le remplacer.' } as const;
    await q(`INSERT INTO gestion_location_loyer_revise (bail_id, effet_le, loyer_hc, provisions, saisi_par, saisi_par_libelle) VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6)`,
      [bailId, v.effetLe, v.loyerHc, v.provisions, auteur.id, auteur.libelle]);
    await q(JOURNAL,
      [Number(b.lot_id), 'location_loyer_revise', `Loyer révisé (bail n° ${bailId}) : ${libelleLoyerRevise({ effetLe: v.effetLe, loyerHc: Number(v.loyerHc), provisions: v.provisions === null ? null : Number(v.provisions) })}`, auteur.id, auteur.libelle]);
    return { etat: 'ok' } as const;
  });
}

/** Annule un loyer révisé (la ligne reste, marquée annulée), et l'écrit au journal du bien, dans la même transaction. */
export async function annulerLoyerRevise(id: number, auteur: Auteur): Promise<Reponse> {
  if (!(await loyersRevisesDisponibles())) return { etat: 'indisponible', motif: MOT_SANS_423_LOYER };
  return withTransaction(async (q) => {
    const { rows } = await q<{ lot_id: string; bail_id: string; effet_le: string; loyer_hc: string; provisions: string | null }>(
      `UPDATE gestion_location_loyer_revise r SET annule_le = now(), annule_par_libelle = $2 FROM gestion_bail b
        WHERE r.id = $1 AND r.annule_le IS NULL AND b.id = r.bail_id
        RETURNING b.lot_id::text, r.bail_id::text, r.effet_le::text, r.loyer_hc::text, r.provisions::text`, [id, auteur.libelle]);
    const r = rows[0];
    if (r === undefined) return { etat: 'refus', motif: 'Ce loyer révisé n’existe plus ou est déjà annulé.' } as const;
    await q(JOURNAL, [Number(r.lot_id), 'location_loyer_revise_annule',
      `Loyer révisé annulé (bail n° ${r.bail_id}) : ${libelleLoyerRevise({ effetLe: r.effet_le, loyerHc: Number(r.loyer_hc), provisions: r.provisions === null ? null : Number(r.provisions) })}`, auteur.id, auteur.libelle]);
    return { etat: 'ok' } as const;
  });
}
