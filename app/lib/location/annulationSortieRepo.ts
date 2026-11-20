import { withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { ecrireDateSortie } from './dateSortieOccupation';
import { reintegrerSiComplet } from './regroupementRepo';
import type { IssueSortie } from './sortieLocatairesRepo';

/**
 * ══ 🔴 ANNULER UNE SORTIE ENREGISTRÉE (Arno, 20/11/2026) ═════════════════════════════════════════════════════════════════════════════════════
 * Le geste « Annuler la sortie » de la Location, sorti de `sortieLocatairesRepo.ts` (qui le réexporte, rien ne change pour l'écran) dans un module
 * qui ne tire AUCUN module « server-only » : le script de reprise `app/scripts/locataire-annuler-sortie.ts` appelle ainsi le MÊME code que
 * l'application (garde `serverOnly.guard.test.ts`). Le journal garde la date annulée ; rien n'est effacé.
 */

export async function journaliser(q: RequeteTx, o: {
  entite: 'annuaire' | 'annuaire_lot'; id: number; action: string; avant: string | null; apres: string | null; commentaire: string; auteur: Auteur;
}): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [o.entite, o.id, o.action, o.avant, o.apres, o.commentaire, o.auteur.id, o.auteur.libelle]);
}

/** Lit (FOR UPDATE) un groupe d'occupations sorties ENSEMBLE ; `null` s'il n'est plus cohérent. */
export async function groupeSorti(q: RequeteTx, ids: readonly number[]): Promise<{ sortie: string; entrees: (string | null)[]; lignes: { id: number; locataire_id: number; lot_id: number }[] } | null> {
  if (ids.length === 0) return null;
  const { rows } = await q<{ id: string; locataire_id: string; lot_id: string; entree: string | null; sortie: string | null }>(
    `SELECT id::text, locataire_id::text, lot_id::text, entree::text, sortie::text FROM gestion_annuaire_occupation
      WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [[...ids]]);
  if (rows.length !== new Set(ids).size) return null;
  const dates = new Set(rows.map((r) => r.sortie));
  if (dates.size !== 1 || rows[0].sortie === null) return null;
  return { sortie: rows[0].sortie, entrees: rows.map((r) => r.entree), lignes: rows.map((r) => ({ id: Number(r.id), locataire_id: Number(r.locataire_id), lot_id: Number(r.lot_id) })) };
}

/** ANNULE une sortie enregistrée : les occupations redeviennent en cours (le journal garde la date annulée). */
export async function annulerSortie(demande: { occupationIds: readonly number[] }, auteur: Auteur): Promise<IssueSortie<{ annulee: string }>> {
  return withTransaction(async (q) => {
    const g = await groupeSorti(q, demande.occupationIds);
    if (g === null) return { etat: 'refus' as const, motif: 'Cette sortie a changé entre-temps : rechargez la page.' };
    if (await ecrireDateSortie(q, g.lignes.map((l) => l.id), { mode: 'annuler' }) !== g.lignes.length) throw new Error('annulation : une occupation a changé pendant le geste');
    for (const locataire of new Set(g.lignes.map((l) => l.locataire_id))) {
      await journaliser(q, {
        entite: 'annuaire', id: locataire, action: 'location_sortie_annulee', avant: g.sortie, apres: null,
        commentaire: `sortie du ${g.sortie} annulée — occupation(s) ${g.lignes.map((l) => l.id).join(', ')} de nouveau en cours`, auteur,
      });
    }
    const reintegrations = await reintegrerSiComplet(q, [...new Set(g.lignes.map((l) => l.lot_id))], auteur);
    return { etat: 'ok' as const, data: { annulee: g.sortie, ...(reintegrations.length > 0 ? { reintegrations } : {}) } };
  });
}
