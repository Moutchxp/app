import { query, withTransaction } from '../db/client';
import type { ResultatReperage } from './reperePlanches';

/**
 * LOT 62 — persistance du repérage des planches par image. PRÉSENCE seulement (verdict par page, jamais le contenu). REJOUABLE : un
 * second clic REMPLACE proprement (transaction delete-puis-insert), sans doubler. RÉSILIENT : migration 191 absente (42P01) → lectures
 * vides et écriture no-op silencieuse (comportement d'avant, aucune erreur à l'écran).
 */
export interface PlancheImage { page: number; categorie: string }
export interface RunReperageAffiche {
  nbPlanches: number;                       // pages verdict='oui'
  incertaines: number[];                    // pages verdict='incertain' (pas dans le best-of, mais visibles)
  pagesEcartees: { page: number; motif: string }[]; // écartées par le pré-filtre RGPD (+ motif)
  coutUsd: number;
  modele: string | null;
  creeLe: string | null;                    // ISO
}

/** Pages verdict='oui' par pièce, pour le MERGE du best-of (côté /emprise GET). Map vide si 191 absente. */
export async function lireReperagePlanchesOui(dossierId: number): Promise<Map<number, PlancheImage[]>> {
  const m = new Map<number, PlancheImage[]>();
  try {
    const { rows } = await query<{ piece_id: number; page: number; categorie: string }>(
      `SELECT piece_id::int AS piece_id, page, categorie FROM permis_planche_vision WHERE dossier_id = $1 AND verdict = 'oui' ORDER BY piece_id, page`, [dossierId]);
    for (const r of rows) (m.get(r.piece_id) ?? m.set(r.piece_id, []).get(r.piece_id)!).push({ page: r.page, categorie: r.categorie });
  } catch { /* 191 absente → aucune planche image (best-of textuel seul) */ }
  return m;
}

/** Audit par pièce (planches / incertaines / écartées+motif / coût / modèle) pour l'affichage. Map vide si 191 absente. */
export async function lireRunsReperage(dossierId: number): Promise<Map<number, RunReperageAffiche>> {
  const m = new Map<number, RunReperageAffiche>();
  try {
    const { rows: runs } = await query<{ piece_id: number; pages_ecartees: { page: number; motif: string }[]; cout_usd: string | number; modele_resolu: string | null; modele: string; cree_le: string | Date }>(
      `SELECT piece_id::int AS piece_id, pages_ecartees, cout_usd, modele_resolu, modele, cree_le FROM permis_planche_vision_run WHERE dossier_id = $1`, [dossierId]);
    const { rows: verdicts } = await query<{ piece_id: number; page: number; verdict: string }>(
      `SELECT piece_id::int AS piece_id, page, verdict FROM permis_planche_vision WHERE dossier_id = $1`, [dossierId]);
    for (const r of runs) {
      const vs = verdicts.filter((v) => v.piece_id === r.piece_id);
      m.set(r.piece_id, {
        nbPlanches: vs.filter((v) => v.verdict === 'oui').length,
        incertaines: vs.filter((v) => v.verdict === 'incertain').map((v) => v.page).sort((a, b) => a - b),
        pagesEcartees: Array.isArray(r.pages_ecartees) ? r.pages_ecartees : [],
        coutUsd: Number(r.cout_usd),
        modele: r.modele_resolu ?? r.modele,
        creeLe: r.cree_le instanceof Date ? r.cree_le.toISOString() : (r.cree_le ? new Date(r.cree_le).toISOString() : null),
      });
    }
  } catch { /* 191 absente → aucun audit */ }
  return m;
}

/**
 * REMPLACE le repérage d'une pièce (rejouable, sans doublon) : purge les deux tables pour la pièce, puis réinsère verdicts + audit.
 * `true` = persisté ; `false` = table absente (no-op résilient → l'UI le dit sans erreur dure). Méthode 'ia' (jamais 'confirmee').
 */
export async function enregistrerReperage(
  dossierId: number, pieceId: number, resultat: ResultatReperage,
  audit: { modele: string; modeleResolu: string | null; tokensIn: number; tokensOut: number; coutUsd: number; par: string | null },
): Promise<boolean> {
  try {
    await withTransaction(async (q) => {
      await q(`DELETE FROM permis_planche_vision WHERE piece_id = $1`, [pieceId]);
      await q(`DELETE FROM permis_planche_vision_run WHERE piece_id = $1`, [pieceId]);
      for (const v of resultat.verdicts) {
        await q(`INSERT INTO permis_planche_vision (dossier_id, piece_id, page, verdict, categorie, modele, cree_par) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dossierId, pieceId, v.page, v.verdict, v.categorie, audit.modele, audit.par]);
      }
      await q(`INSERT INTO permis_planche_vision_run (piece_id, dossier_id, modele, modele_resolu, pages_envoyees, pages_ecartees, tokens_in, tokens_out, cout_usd, cree_par)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
        [pieceId, dossierId, audit.modele, audit.modeleResolu, resultat.pagesEnvoyees, JSON.stringify(resultat.pagesEcartees), audit.tokensIn, audit.tokensOut, audit.coutUsd, audit.par]);
    });
    return true;
  } catch { return false; } // 191 absente → non persisté (comportement d'avant)
}
