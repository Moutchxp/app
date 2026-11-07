// 🔴 MON ESPACE (Arno, 07/11/2026, migration 462) — LE TAUX DE COMMISSION D'UN COLLABORATEUR, DANS SON PROFIL : lecture, changement journalisé
// (admin_utilisateur_log, action 'changement_taux_commission', avant / après, auteur, date). Même convention que `commissionneCompte.ts`.
// Le taux s'applique à SA part des honoraires ; il pré-remplit « Nouveau compromis » (modifiable pour chaque compromis). Entre 0 et 100 % ;
// vide : non renseigné (le défaut de 50 % s'applique, comme avant). Sans la 462 : rien n'est lu, rien ne s'écrit.
import { query } from '../db/client';
import { tauxCommissionDisponible } from './schemaDroits';

export const TAUX_MIN = 0;
export const TAUX_MAX = 100;
export const MOTIF_TAUX_BORNES = 'Le taux de commission doit être compris entre 0 et 100 %.';
export const MOTIF_SANS_462 = 'Mise à jour de la base à appliquer (migration 462) avant de pouvoir renseigner le taux de commission.';

/** Le taux est-il dans les bornes (0 à 100 %, fini) ? PUR. */
export const tauxDansBornes = (x: number): boolean => Number.isFinite(x) && x >= TAUX_MIN && x <= TAUX_MAX;

/** Lu en base (texte de to_jsonb, nombre ou NULL) → le taux, ou null (non renseigné). PUR. */
export function tauxLu(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const t = typeof x === 'number' ? x : Number(String(x));
  return Number.isFinite(t) ? t : null;
}

/** Saisi (nombre, texte « 62,5 », vide) → le taux, null (vide : non renseigné) ou undefined (illisible ou hors bornes). PUR. */
export function tauxSaisi(x: unknown): number | null | undefined {
  if (x === null || x === undefined || (typeof x === 'string' && x.trim() === '')) return null;
  const t = typeof x === 'number' ? x : typeof x === 'string' && /^\s*\d+([.,]\d+)?\s*%?\s*$/.test(x) ? Number(x.replace(',', '.').replace('%', '').trim()) : Number.NaN;
  return tauxDansBornes(t) ? t : undefined;
}

export interface ChangementTaux { le: string; avant: number | null; apres: number | null; par: string | null }
export interface EtatTauxCommissionCompte {
  /** Le taux d'aujourd'hui ; null : non renseigné (50 % par défaut). */
  valeur: number | null;
  /** La migration 462 est-elle appliquée (le taux peut-il s'écrire) ? */
  disponible: boolean;
  historique: ChangementTaux[];
}

/** Le taux de plusieurs comptes (négociateurs). Sans la 462 : vide (aucun n'est renseigné). LECTURE SEULE. */
export async function tauxCommissionDesComptes(ids: readonly number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (ids.length === 0) return out;
  try {
    const { rows } = await query<{ id: string; taux: string | null }>(
      `SELECT u.id::text, to_jsonb(u) ->> 'taux_commission' AS taux FROM admin_utilisateur u WHERE u.id = ANY($1::bigint[])`, [[...ids]]);
    for (const r of rows) out.set(Number(r.id), tauxLu(r.taux));
  } catch { /* base injoignable : non renseigné, comme avant */ }
  return out;
}

/** Le taux d'un compte et son historique (Détails du compte). LECTURE SEULE. */
export async function lireTauxCommissionCompte(id: number): Promise<EtatTauxCommissionCompte> {
  if (!(await tauxCommissionDisponible())) return { valeur: null, disponible: false, historique: [] };
  const { rows: c } = await query<{ taux: string | null }>(`SELECT to_jsonb(u) ->> 'taux_commission' AS taux FROM admin_utilisateur u WHERE u.id = $1`, [id]);
  const { rows } = await query<{ le: string; avant: { taux_commission?: unknown } | null; apres: { taux_commission?: unknown } | null; par: string | null }>(
    `SELECT l.ts::text AS le, l.avant, l.apres, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') AS par
       FROM admin_utilisateur_log l LEFT JOIN admin_utilisateur a ON a.id = l.auteur_id
      WHERE l.cible_id = $1 AND l.action = 'changement_taux_commission' ORDER BY l.ts, l.id`, [id]);
  return { valeur: tauxLu(c[0]?.taux), disponible: true,
    historique: rows.map((r) => ({ le: r.le, avant: tauxLu(r.avant?.taux_commission), apres: tauxLu(r.apres?.taux_commission), par: r.par })) };
}

export type IssueTaux = { ok: true; change: boolean } | { ok: false; motif: string };

/**
 * Pose le taux d'UN compte (vide : non renseigné) : l'UPDATE et la ligne de journal (avant / après, auteur, date) partent ensemble ; rien
 * n'est écrit si le taux ne change pas. Hors bornes : refusé. ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la route qui l'exige.
 */
export async function definirTauxCommissionCompte(id: number, valeur: unknown, auteurId: number | null): Promise<IssueTaux> {
  const taux = tauxSaisi(valeur);
  if (taux === undefined) return { ok: false, motif: MOTIF_TAUX_BORNES };
  if (!(await tauxCommissionDisponible())) return { ok: false, motif: MOTIF_SANS_462 };
  const { rows } = await query<{ id: string; change: boolean }>(
    `WITH avant AS (
       SELECT id, taux_commission FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET taux_commission = $2 FROM avant
        WHERE u.id = avant.id AND avant.taux_commission IS DISTINCT FROM $2::numeric
       RETURNING u.id, avant.taux_commission AS ancien
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_taux_commission', maj.id, $3, jsonb_build_object('taux_commission', maj.ancien), jsonb_build_object('taux_commission', $2::numeric) FROM maj
     )
     SELECT avant.id::text, EXISTS (SELECT 1 FROM maj) AS change FROM avant`, [id, taux, auteurId]);
  if (rows.length === 0) return { ok: false, motif: 'Compte introuvable.' };
  return { ok: true, change: rows[0].change === true };
}
