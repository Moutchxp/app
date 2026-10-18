import type { RequeteTx } from '../db/client';

/**
 * ══ 🔴🔴 LA SEULE FONCTION QUI ÉCRIT LA DATE DE SORTIE D'UNE OCCUPATION (Arno, 18/10/2026 — « une seule porte ») ═════════
 *
 * Tout geste qui pose, corrige, annule ou clôt `gestion_annuaire_occupation.sortie` passe ICI, dans la transaction de son
 * appelant (`q`) — sortie de locataire (Location ET « départ » de la Gestion, qui appellent la même fonction de sortie),
 * correction, annulation, et clôture des locations lors d'un archivage ou d'une sortie de biens du portefeuille.
 * Une épreuve statique (`dateSortieUnique.test.ts`) échoue si une autre fonction de l'application écrit cette colonne. Seule
 * exception, nommée dans l'épreuve : l'IMPORT WIPPIMMO (`annuaireRepo.ts`), qui recopie l'export et n'est pas un geste.
 *
 * Chaque mode porte sa garde, pour qu'aucune date ne s'écrase EN SILENCE :
 *   · `poser`    — seulement sur une occupation EN COURS (`sortie IS NULL`) ;
 *   · `corriger` — seulement sur une occupation DÉJÀ sortie ;
 *   · `annuler`  — idem, la date redevient vide (le journal de l'appelant garde l'ancienne) ;
 *   · `cloturer` — clôture d'archivage : en cours seulement, jamais avant l'entrée (`greatest(entrée, date)`).
 * Rend le nombre de lignes écrites ; l'appelant compare à ce qu'il attendait et lève sinon (la transaction est défaite).
 */
export type EcritureSortie =
  | { mode: 'poser'; date: string }
  | { mode: 'corriger'; date: string }
  | { mode: 'annuler' }
  | { mode: 'cloturer'; date: string };

export async function ecrireDateSortie(q: RequeteTx, ids: readonly number[], e: EcritureSortie): Promise<number> {
  if (ids.length === 0) return 0;
  const liste = [...ids];
  let r: { rowCount: number | null };
  switch (e.mode) {
    case 'poser':
      r = await q('UPDATE gestion_annuaire_occupation SET sortie = $2::date WHERE id = ANY($1::bigint[]) AND sortie IS NULL', [liste, e.date]);
      break;
    case 'corriger':
      r = await q('UPDATE gestion_annuaire_occupation SET sortie = $2::date WHERE id = ANY($1::bigint[]) AND sortie IS NOT NULL', [liste, e.date]);
      break;
    case 'annuler':
      r = await q('UPDATE gestion_annuaire_occupation SET sortie = NULL WHERE id = ANY($1::bigint[]) AND sortie IS NOT NULL', [liste]);
      break;
    case 'cloturer':
      r = await q(
        'UPDATE gestion_annuaire_occupation SET sortie = greatest(coalesce(entree, $2::date), $2::date) WHERE id = ANY($1::bigint[]) AND sortie IS NULL',
        [liste, e.date]);
      break;
  }
  return r.rowCount ?? 0;
}
