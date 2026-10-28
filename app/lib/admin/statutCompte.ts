// LOT P (Arno, 28/10/2026, migration 439) — LE STATUT D'UN COMPTE : lecture, liste, changement journalisé (admin_utilisateur_log,
// action 'changement_statut', avant / après, auteur, date). Même convention que `serviceGestion.ts` : pas de `import 'server-only'`.
// 🔴 Rien ne s'efface : un changement est une ligne de journal de plus ; revenir en arrière = choisir l'ancien statut (journalisé aussi).
// Sans la 439 : lu « à renseigner » (to_jsonb : jamais d'erreur SQL), non disponible, rien ne s'écrit.
import { query } from '../db/client';
import { statutDisponible } from './schemaDroits';
import { estStatut, statutLu, type Statut } from './statut';

export interface ChangementStatut { le: string; avant: Statut | null; apres: Statut | null; par: string | null; origine: string | null }
export interface EtatStatutCompte {
  /** Le statut d'aujourd'hui ; null : à renseigner. */
  valeur: Statut | null;
  /** La migration 439 est-elle appliquée (le champ peut-il s'écrire) ? */
  disponible: boolean;
  /** Les changements, du plus ancien au plus récent (date, avant, après, auteur). */
  historique: ChangementStatut[];
}

/** Le statut d'un compte, sans jamais lever (layout, proxy, transaction). LECTURE SEULE. */
export async function statutDuCompte(id: number): Promise<Statut | null> {
  try {
    const { rows } = await query<{ statut: string | null }>(`SELECT to_jsonb(u) ->> 'statut' AS statut FROM admin_utilisateur u WHERE u.id = $1`, [id]);
    return statutLu(rows[0]?.statut);
  } catch {
    return null;
  }
}

/** Le statut de plusieurs comptes (liste des comptes, négociateurs). Sans la 439 : vide. LECTURE SEULE. */
export async function statutsDesComptes(ids: readonly number[]): Promise<Map<number, Statut | null>> {
  const out = new Map<number, Statut | null>();
  if (ids.length === 0) return out;
  try {
    const { rows } = await query<{ id: string; statut: string | null }>(
      `SELECT u.id::text, to_jsonb(u) ->> 'statut' AS statut FROM admin_utilisateur u WHERE u.id = ANY($1::bigint[])`, [[...ids]]);
    for (const r of rows) out.set(Number(r.id), statutLu(r.statut));
  } catch { /* base injoignable : « à renseigner » */ }
  return out;
}

/** Le statut d'un compte et son historique (Détails du compte). LECTURE SEULE. */
export async function lireStatutCompte(id: number): Promise<EtatStatutCompte> {
  if (!(await statutDisponible())) return { valeur: null, disponible: false, historique: [] };
  const valeur = await statutDuCompte(id);
  const { rows } = await query<{ le: string; avant: { statut?: unknown } | null; apres: { statut?: unknown; origine?: unknown } | null; par: string | null }>(
    `SELECT l.ts::text AS le, l.avant, l.apres, nullif(btrim(concat_ws(' ', a.prenom, a.nom)), '') AS par
       FROM admin_utilisateur_log l LEFT JOIN admin_utilisateur a ON a.id = l.auteur_id
      WHERE l.cible_id = $1 AND l.action = 'changement_statut' ORDER BY l.ts, l.id`, [id]);
  return { valeur, disponible: true, historique: rows.map((r) => ({ le: r.le, avant: statutLu(r.avant?.statut), apres: statutLu(r.apres?.statut),
    par: r.par, origine: typeof r.apres?.origine === 'string' ? r.apres.origine : null })) };
}

export type IssueStatut = { ok: true; change: boolean } | { ok: false; motif: string };

/**
 * Pose le statut d'UN compte : l'UPDATE et la ligne de journal (avant / après, auteur, date) partent ensemble ; rien n'est écrit si le
 * statut ne change pas. ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la route qui l'exige.
 */
export async function definirStatutCompte(id: number, statut: unknown, auteurId: number | null): Promise<IssueStatut> {
  if (!estStatut(statut)) return { ok: false, motif: 'Statut attendu : Associé, Salarié, Indépendant ou Observateur.' };
  if (!(await statutDisponible())) return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 439) avant de pouvoir renseigner le statut.' };
  const { rows } = await query<{ id: string; change: boolean }>(
    `WITH avant AS (
       SELECT id, statut FROM admin_utilisateur WHERE id = $1 FOR UPDATE
     ), maj AS (
       UPDATE admin_utilisateur u SET statut = $2 FROM avant WHERE u.id = avant.id AND avant.statut IS DISTINCT FROM $2
       RETURNING u.id, avant.statut AS ancien
     ), jrnl AS (
       INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
       SELECT 'changement_statut', maj.id, $3, jsonb_build_object('statut', maj.ancien), jsonb_build_object('statut', $2::text) FROM maj
     )
     SELECT avant.id::text, EXISTS (SELECT 1 FROM maj) AS change FROM avant`, [id, statut, auteurId]);
  if (rows.length === 0) return { ok: false, motif: 'Compte introuvable.' };
  return { ok: true, change: rows[0].change === true };
}
