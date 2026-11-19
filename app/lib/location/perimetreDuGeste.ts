import { query } from '../db/client';
import type { PerimetreTest } from './perimetreTest';
import { testDisponible } from './preavisTestSonde';

/**
 * ══ 🔴🔴 LE PÉRIMÈTRE D'UN GESTE SUR UN PRÉAVIS DE TEST (Arno, 14/11/2026, migration 473) — extrait de `preavisTestRepo.ts` le 19/11/2026 ═════════
 * Module SANS `server-only` (ni le dépôt des tâches) : la synchronisation d'agenda, lancée aussi par un script CLI (`rattraper-agenda`), lit le
 * périmètre d'une tâche pour n'écrire que dans l'agenda du créateur du test. Le contenu est celui d'avant, à l'identique.
 */
export interface LigneTest { id: string; lot_id: string; occupation_id: string; locataire_id: string; createur_id: string; createur_email: string; supprime_le: string | null }
export const versPerimetre = (r: LigneTest): PerimetreTest => ({ testId: Number(r.id), createurEmail: r.createur_email });

/** Les tests qui touchent ces occupations / ces lots (masqués compris : un test masqué n'envoie toujours rien ailleurs). */
export async function testsDe(o: { occupationIds?: readonly number[]; lotIds?: readonly number[]; tacheIds?: readonly number[] }): Promise<LigneTest[]> {
  if (!(await testDisponible())) return [];
  const occ = [...new Set(o.occupationIds ?? [])]; const lots = [...new Set(o.lotIds ?? [])]; const taches = [...new Set(o.tacheIds ?? [])];
  if (occ.length + lots.length + taches.length === 0) return [];
  const { rows } = await query<LigneTest>(
    `SELECT t.id::text, t.lot_id::text, t.occupation_id::text, t.locataire_id::text, t.createur_id::text, t.createur_email, t.supprime_le::text
       FROM gestion_location_preavis_test t
      WHERE t.lot_id IN (SELECT o.lot_id FROM gestion_annuaire_occupation o WHERE o.id = ANY($1::bigint[]))
         OR t.lot_id = ANY($2::bigint[])
         OR t.lot_id IN (SELECT ta.lot_id FROM gestion_tache ta WHERE ta.id = ANY($3::bigint[]))`, [occ, lots, taches]);
  return rows;
}

export type IssuePerimetre = { ok: true; perimetre: PerimetreTest | null } | { ok: false; motif: string };

/**
 * Le périmètre d'un geste : aucun test → null (geste ordinaire) ; un seul test → son périmètre ; un test MÊLÉ à de vrais biens, ou deux tests
 * → refus (un mail de test ne doit jamais pouvoir partir avec de vrais destinataires dans la même série).
 */
export async function perimetreDuGeste(o: { occupationIds?: readonly number[]; lotIds?: readonly number[]; tacheIds?: readonly number[] }): Promise<IssuePerimetre> {
  const t = await testsDe(o);
  if (t.length === 0) return { ok: true, perimetre: null };
  if (t.length > 1) return { ok: false, motif: 'Deux préavis de test dans un même geste : refusé.' };
  const lotsTest = new Set([t[0].lot_id]);
  const occ = [...new Set(o.occupationIds ?? [])];
  if (occ.length > 0) {
    const { rows } = await query<{ lot_id: string }>('SELECT DISTINCT lot_id::text FROM gestion_annuaire_occupation WHERE id = ANY($1::bigint[])', [occ]);
    if (rows.some((r) => !lotsTest.has(r.lot_id))) return { ok: false, motif: 'Un préavis de test ne se mêle jamais à de vrais locataires : refusé.' };
  }
  if ((o.lotIds ?? []).some((l) => !lotsTest.has(String(l)))) return { ok: false, motif: 'Un préavis de test ne se mêle jamais à de vrais biens : refusé.' };
  return { ok: true, perimetre: versPerimetre(t[0]) };
}

