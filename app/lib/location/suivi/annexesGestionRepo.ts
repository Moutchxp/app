import 'server-only';
import { query } from '../../db/client';
import { colonneExisteMemo } from '../sondeLocation';
import type { AnnexeLouee } from './annexesGestion';

/**
 * ══ 🔴 Arno (25/10/2026, migration 426) — LA RÈGLE DES ANNEXES, LUE EN BASE ═══════════════════════════════════════════════════════════
 * La date de bascule (paramètre de la Location, la plus récente fait foi ; sans la 426 : aucune bascule, tout comme avant), les lots
 * reliés à un lot principal (`gestion_lot_annexe`, détachés compris), et pour une location d'annexe datée de la bascule ou après : son
 * lot principal et sa gestion à la date de signature (le dernier statut daté à cette date, sinon le statut actuel). LECTURE SEULE.
 */
export const basculeDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_parametre_date', 'valeur');

export async function lireBasculeAnnexes(): Promise<string | null> {
  if (!(await basculeDisponible())) return null;
  const r = (await query<{ v: string }>(
    `SELECT valeur::text AS v FROM gestion_location_parametre_date WHERE cle = 'bascule_annexes_gestion' ORDER BY pose_le DESC, id DESC LIMIT 1`)).rows[0];
  return r?.v ?? null;
}

export async function lireIdsAnnexes(): Promise<number[]> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return [];
  return (await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe')).rows.map((r) => Number(r.id));
}

/** La règle complète (date de bascule, annexes) ; sans bascule, la liste des annexes n'est pas lue (rien ne change). */
export async function lireRegleAnnexes(): Promise<{ basculeAnnexes: string | null; annexes: number[] }> {
  const basculeAnnexes = await lireBasculeAnnexes();
  return { basculeAnnexes, annexes: basculeAnnexes === null ? [] : await lireIdsAnnexes() };
}

/** Le lot principal d'une annexe, et s'il était en gestion à la date (« AAAA-MM-JJ »). `null` : pas une annexe. */
export async function principalDeLAnnexe(lotId: number, date: string): Promise<AnnexeLouee | null> {
  if (!(await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))) return null;
  const avecTransitions = await colonneExisteMemo('gestion_bien_statut_transition', 'effet_le');
  const avecStatut = await colonneExisteMemo('gestion_annuaire_lot', 'statut_bien');
  const r = (await query<{ parent: string; libelle: string; statut_date: string | null; statut_actuel: string | null; mandat: string | null }>(
    `SELECT p.id::text AS parent,
            concat_ws(' — ', nullif(btrim(coalesce(p.nature, '')), ''), nullif(btrim(coalesce(p.adresse, '')), '')) AS libelle,
            ${avecTransitions ? `(SELECT t.apres FROM gestion_bien_statut_transition t WHERE t.lot_id = p.id AND t.effet_le <= $2::date ORDER BY t.effet_le DESC, t.id DESC LIMIT 1)` : 'NULL::text'} AS statut_date,
            ${avecStatut ? 'p.statut_bien' : "CASE WHEN p.en_gestion THEN 'en_gestion' END"} AS statut_actuel,
            pr.numero_mandat_gestion AS mandat
       FROM gestion_lot_annexe a JOIN gestion_annuaire_lot p ON p.id = a.parent_id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = p.proprietaire_id
      WHERE a.annexe_id = $1`, [lotId, date])).rows[0];
  if (r === undefined) return null;
  const statut = r.statut_date ?? r.statut_actuel;
  return { parentId: Number(r.parent), libelle: r.libelle || `lot n° ${r.parent}`, principalEnGestion: statut === 'en_gestion', mandat: r.mandat?.trim() || null };
}

/** Les locations d'annexes datées de la bascule ou après, par identifiant de ligne. */
export async function annexesDesLocations(activites: readonly { id: number | string; lotId: number | null; dateSignature: string }[],
  regle: { basculeAnnexes: string | null; annexes: readonly number[] }): Promise<Map<string, AnnexeLouee>> {
  const sortie = new Map<string, AnnexeLouee>();
  if (regle.basculeAnnexes === null) return sortie;
  const ensemble = new Set(regle.annexes);
  for (const a of activites) {
    if (a.lotId === null || !ensemble.has(a.lotId) || a.dateSignature.slice(0, 10) < regle.basculeAnnexes) continue;
    const p = await principalDeLAnnexe(a.lotId, a.dateSignature.slice(0, 10));
    if (p !== null) sortie.set(String(a.id), p);
  }
  return sortie;
}
