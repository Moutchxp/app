// LOT S (Arno, 28/10/2026, migration 441) — « COMMISSIONNÉ / NON COMMISSIONNÉ » D'UN ADMINISTRATEUR : lecture, liste, changement journalisé
// (admin_utilisateur_log, action 'changement_commissionne', avant / après, auteur, date). Même convention que `statutCompte.ts`.
// 🔴 Un COLLABORATEUR est TOUJOURS commissionné (le choix ne le concerne pas). Rien ne s'efface : un changement est une ligne de journal
// de plus ; revenir en arrière = refaire l'autre choix (journalisé aussi). Sans la 441 : tout le monde commissionné, rien ne s'écrit.
import { query } from '../db/client';
import { commissionneDisponible } from './schemaDroits';

/** Le choix qui compte : un collaborateur, toujours commissionné ; un administrateur, son choix (non renseigné : commissionné). PUR. */
export const commissionneEffectif = (role: unknown, valeur: unknown): boolean => role !== 'administrateur' || valeur !== false;
/** Lu en base (booléen, texte de to_jsonb ou NULL) → vrai, faux, ou null (non renseigné). PUR. */
export const commissionneLu = (x: unknown): boolean | null => (x === true || x === 'true' ? true : x === false || x === 'false' ? false : null);
export const LIBELLE_COMMISSIONNE = (x: boolean): string => (x ? 'Commissionné' : 'Non commissionné');

export interface ChangementCommissionne { le: string; avant: boolean | null; apres: boolean | null; par: string | null; origine: string | null }
export interface EtatCommissionneCompte {
  /** Le choix d'aujourd'hui (administrateur) ; null : non renseigné. */
  valeur: boolean | null;
  /** Le choix concerne-t-il ce compte (rôle administrateur) ? Un collaborateur est toujours commissionné. */
  applicable: boolean;
  /** La migration 441 est-elle appliquée (le choix peut-il s'écrire) ? */
  disponible: boolean;
  historique: ChangementCommissionne[];
}

/** Le choix effectif de plusieurs comptes (liste des comptes, négociateurs). Sans la 441 : tous commissionnés. LECTURE SEULE. */
export async function commissionnesDesComptes(ids: readonly number[]): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  if (ids.length === 0) return out;
  try {
    const { rows } = await query<{ id: string; role: string; commissionne: string | null }>(
      `SELECT u.id::text, u.role, to_jsonb(u) ->> 'commissionne' AS commissionne FROM admin_utilisateur u WHERE u.id = ANY($1::bigint[])`, [[...ids]]);
    for (const r of rows) out.set(Number(r.id), commissionneEffectif(r.role, commissionneLu(r.commissionne)));
  } catch { /* base injoignable : commissionnés, comme avant */ }
  return out;
}

/** Le choix d'un compte et son historique (Détails du compte). LECTURE SEULE. */
export async function lireCommissionneCompte(id: number): Promise<EtatCommissionneCompte> {
  const { rows: c } = await query<{ role: string; commissionne: string | null }>(
    `SELECT u.role, to_jsonb(u) ->> 'commissionne' AS commissionne FROM admin_utilisateur u WHERE u.id = $1`, [id]);
  const applicable = c[0]?.role === 'administrateur';
  if (!(await commissionneDisponible())) return { valeur: null, applicable, disponible: false, historique: [] };
  const { rows } = await query<{ le: string; avant: { commissionne?: unknown } | null; apres: { commissionne?: unknown; origine?: unknown } | null; par: string | null }>(
    `SELECT l.ts::text AS le, l.avant, l.apres, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') AS par
       FROM admin_utilisateur_log l LEFT JOIN admin_utilisateur a ON a.id = l.auteur_id
      WHERE l.cible_id = $1 AND l.action = 'changement_commissionne' ORDER BY l.ts, l.id`, [id]);
  return { valeur: commissionneLu(c[0]?.commissionne), applicable, disponible: true, historique: rows.map((r) => ({ le: r.le, avant: commissionneLu(r.avant?.commissionne),
    apres: commissionneLu(r.apres?.commissionne), par: r.par, origine: typeof r.apres?.origine === 'string' ? r.apres.origine : null })) };
}

export type IssueCommissionne = { ok: true; change: boolean } | { ok: false; motif: string };
export const MOTIF_SANS_441 = 'Mise à jour de la base à appliquer (migration 441) avant de pouvoir renseigner « Commissionné / Non commissionné ».';

/**
 * Pose le choix d'UN administrateur : l'UPDATE et la ligne de journal (avant / après, auteur, date) partent ensemble ; rien n'est écrit si
 * le choix ne change pas. Un collaborateur est refusé (toujours commissionné). ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la route qui l'exige.
 */
export async function definirCommissionneCompte(id: number, valeur: unknown, auteurId: number | null): Promise<IssueCommissionne> {
  if (typeof valeur !== 'boolean') return { ok: false, motif: 'Choix attendu : Commissionné ou Non commissionné.' };
  if (!(await commissionneDisponible())) return { ok: false, motif: MOTIF_SANS_441 };
  const { rows } = await query<{ id: string; role: string; change: boolean }>(
    `WITH avant AS (
       SELECT id, role, commissionne FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET commissionne = $2 FROM avant
        WHERE u.id = avant.id AND avant.role = 'administrateur' AND avant.commissionne IS DISTINCT FROM $2
       RETURNING u.id, avant.commissionne AS ancien
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_commissionne', maj.id, $3, jsonb_build_object('commissionne', maj.ancien), jsonb_build_object('commissionne', $2::boolean) FROM maj
     )
     SELECT avant.id::text, avant.role, EXISTS (SELECT 1 FROM maj) AS change FROM avant`, [id, valeur, auteurId]);
  if (rows.length === 0) return { ok: false, motif: 'Compte introuvable.' };
  if (rows[0].role !== 'administrateur') return { ok: false, motif: 'Un collaborateur est toujours commissionné : le choix ne concerne que les administrateurs.' };
  return { ok: true, change: rows[0].change === true };
}
