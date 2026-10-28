// TRANSACTION, LOT D (Arno, 27/10/2026, migration 434) — LA SOCIÉTÉ D'UN COLLABORATEUR (CRITERIMMO / MACJ), DATÉE.
// Même convention que `serviceGestion.ts` : pas de `import 'server-only'` (lu aussi sous tsx et par les tests). Une société vaut À COMPTER
// d'une date : un changement AJOUTE une période (signée, datée) et ne réécrit pas le passé — une vente garde la société de son négociateur
// au moment de la vente (figée sur sa partie). 🔴 Rien ne s'efface : une période se retire par `retire_le`.
// Sans la 434 : lue « non renseignée, non disponible » ; l'écran ne l'exige pas et rien ne s'écrit (aucune connexion n'en dépend).
import { query, withTransaction } from '../db/client';
import { repartitionDisponible, societeLesDeuxDisponible } from './schemaDroits';
import { estSocieteCompte, LES_DEUX, societeALaDate, type SocieteCompte } from '../transaction/societeNegociateur';
import { aujourdhuiParis } from '../location/suivi/suivi';

export interface PeriodeAffichee { societe: SocieteCompte; depuis: string; origine: 'saisie' | 'deduction'; poseLe: string; posePar: string; motif: string | null }
export interface EtatSocieteCompte {
  /** La société d'aujourd'hui (LOT K : ou « les deux ») ; null : à renseigner. */
  valeur: SocieteCompte | null;
  /** La migration 434 est-elle appliquée (le champ peut-il s'écrire) ? */
  disponible: boolean;
  /** LOT K — la migration 438 (« CRITERIMMO et MACJ ») est-elle appliquée ? Absent : réponse d'avant ce lot. */
  lesDeux?: boolean;
  periodes: PeriodeAffichee[];
}

/** La société d'un compte et l'historique de ses périodes. LECTURE SEULE. */
export async function lireSocieteCompte(id: number, aujourdhui: string = aujourdhuiParis()): Promise<EtatSocieteCompte> {
  if (!(await repartitionDisponible())) return { valeur: null, disponible: false, periodes: [] };
  const { rows } = await query<{ societe: SocieteCompte; depuis: string; origine: 'saisie' | 'deduction'; pose_le: string; pose_par_libelle: string; motif: string | null }>(
    `SELECT societe, to_char(depuis, 'YYYY-MM-DD') AS depuis, origine, pose_le::text AS pose_le, pose_par_libelle, motif
       FROM transaction_societe_compte WHERE compte_id = $1 AND retire_le IS NULL ORDER BY depuis, id`, [id]);
  const periodes = rows.map((r) => ({ societe: r.societe, depuis: r.depuis, origine: r.origine, poseLe: r.pose_le, posePar: r.pose_par_libelle, motif: r.motif }));
  return { valeur: societeALaDate(periodes, aujourdhui), disponible: true, lesDeux: await societeLesDeuxDisponible(), periodes };
}

/** La société d'aujourd'hui de plusieurs comptes (liste des comptes). Sans la 434 : vide. LECTURE SEULE. */
export async function societesDesComptes(ids: readonly number[], aujourdhui: string = aujourdhuiParis()): Promise<Map<number, SocieteCompte | null>> {
  const out = new Map<number, SocieteCompte | null>();
  if (ids.length === 0 || !(await repartitionDisponible())) return out;
  const { rows } = await query<{ compte_id: string; societe: SocieteCompte; depuis: string }>(
    `SELECT compte_id, societe, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM transaction_societe_compte
      WHERE retire_le IS NULL AND compte_id = ANY($1::bigint[]) ORDER BY depuis, id`, [[...ids]]);
  const par = new Map<number, { societe: SocieteCompte; depuis: string }[]>();
  for (const r of rows) par.set(Number(r.compte_id), [...(par.get(Number(r.compte_id)) ?? []), { societe: r.societe, depuis: r.depuis }]);
  for (const id of ids) out.set(id, societeALaDate(par.get(id) ?? [], aujourdhui));
  return out;
}

export type IssueSociete = { ok: true; change: boolean } | { ok: false; motif: string };

/**
 * Pose la société d'un compte à compter d'une date (aujourd'hui par défaut) : une période NEUVE, signée ; une période déjà posée le même
 * jour est retirée (réversible) et remplacée. Rien n'est écrit si la société de ce jour ne change pas. Journalisée (la ligne elle-même :
 * qui, quand, d'où). ⚠️ RÉSERVÉ AUX ADMINISTRATEURS : c'est la route qui l'exige.
 */
export async function definirSocieteCompte(id: number, societe: unknown, depuis: string, auteur: { id: number | null; libelle: string },
  origine: 'saisie' | 'deduction' = 'saisie', motif: string | null = null): Promise<IssueSociete> {
  if (!estSocieteCompte(societe)) return { ok: false, motif: 'Société attendue : CRITERIMMO, MACJ, ou CRITERIMMO et MACJ.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return { ok: false, motif: 'Date invalide (AAAA-MM-JJ).' };
  if (!(await repartitionDisponible())) return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 434) avant de pouvoir renseigner la société.' };
  // LOT K — « CRITERIMMO et MACJ » n'est accepté par la base qu'après la 438 : sans elle, refus, rien n'est écrit.
  if (societe === LES_DEUX && !(await societeLesDeuxDisponible())) return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 438) avant de pouvoir choisir « CRITERIMMO et MACJ ».' };
  return withTransaction(async (q) => {
    const { rows: c } = await q<{ id: string }>('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE', [id]);
    if (c.length === 0) return { ok: false, motif: 'Compte introuvable.' };
    const { rows } = await q<{ id: string; societe: SocieteCompte; depuis: string }>(
      `SELECT id, societe, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM transaction_societe_compte WHERE compte_id = $1 AND retire_le IS NULL ORDER BY depuis, id`, [id]);
    if (societeALaDate(rows, depuis) === societe && rows.some((r) => r.depuis <= depuis)) return { ok: true, change: false };
    await q(`UPDATE transaction_societe_compte SET retire_le = now(), retire_par_libelle = $3 WHERE compte_id = $1 AND depuis = $2::date AND retire_le IS NULL`,
      [id, depuis, auteur.libelle]);
    await q(`INSERT INTO transaction_societe_compte (compte_id, societe, depuis, origine, motif, pose_par, pose_par_libelle) VALUES ($1, $2, $3::date, $4, $5, $6, $7)`,
      [id, societe, depuis, origine, motif, auteur.id, auteur.libelle]);
    return { ok: true, change: true };
  });
}
