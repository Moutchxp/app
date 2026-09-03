/**
 * LOT 51-C — ARRÊT EXHAUSTIF des relances automatiques d'UNE demande, dans UNE transaction fournie par l'appelant.
 *
 * 🔴 FAIT PROUVÉ EN RECON (série 46→52) — IL N'EXISTE AUCUN POINT UNIQUE D'EXTINCTION. Trois systèmes de relance auto sélectionnent
 * leurs candidats sur des critères DISJOINTS :
 *   ① cascade ORDINAIRE (absence totale de réponse) — candidats/envoi filtrent `demande.statut = 'envoyee'`
 *     (`envoiRelance.lireCandidatsRelance`, `relanceAuto`) ;
 *   ② cascade PARTIELLE (réclamations 1..N + annonce CADA) — candidats filtrent
 *     `partiel_le IS NOT NULL AND partiel_leve_le IS NULL AND statut IN ('envoyee','close')` (`cascadePartielleRepo.lireDemandesPartiellesActives`) ;
 *   ③ relance sur RÉPONSE PARTIELLE (PART-E) — MÊME filtre partiel que ② (`relanceReponsePartielleAuto.candidatsRelanceReponseReels`).
 *
 * Conséquence VÉRIFIÉE : aucun geste seul ne suffit —
 *   • `statut='close'` éteint ① (le filtre `statut='envoyee'` échoue) MAIS PAS ② ni ③ (ils acceptent `'close'`) ;
 *   • poser `partiel_leve_le` éteint ② et ③ (le filtre `partiel_leve_le IS NULL` échoue) MAIS RÉACTIVE ① — lever le partiel retire la
 *     SUSPENSION de la cascade ordinaire (`relanceAuto.estSuspendue`), qui repartirait si la demande était restée `'envoyee'`.
 * ⇒ IL FAUT LES DEUX ENSEMBLE : `close` (tue ①, et neutralise la réactivation de ① par la levée) + `partiel_leve_le` (tue ② et ③).
 * Piège avéré : `cloturerDemande` ne pose QUE `'close'` — le réutiliser tel quel laisserait ② et ③ vivants sur une demande partielle-active.
 *
 * Renvoie `true` si la demande existe (gestes appliqués), `false` si introuvable. Idempotent : une demande déjà close et/ou déjà levée
 * n'est pas re-modifiée (gardes `WHERE`). Ne JAMAIS appeler hors d'une transaction qui porte AUSSI le passage en Rattachement (atomicité).
 */
import type { RequeteTx } from '../db/client';

export async function arreterToutesRelances(q: RequeteTx, demandeId: number, par: string | null): Promise<boolean> {
  const { rows } = await q<{ statut: string }>(`SELECT statut FROM demande WHERE id = $1`, [demandeId]);
  const statut = rows[0]?.statut;
  if (statut === undefined) return false;

  // ① CLÔTURE — tue la cascade ordinaire (sélection ET envoi exigent `statut='envoyee'`). Seule une demande 'envoyee' se clôture
  //   (mêmes bornes que cloturerDemande) ; journalisée avec un motif explicite. Ordre des params [id, avant] figé (bug 22P02, S41).
  if (statut === 'envoyee') {
    await q(`UPDATE demande SET statut = 'close', maj_le = now() WHERE id = $1`, [demandeId]);
    await q(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur)
         VALUES ($1, $2, 'close', $3, $4)`,
      [demandeId, statut, 'sortie du test vers Rattachement (LOT 51-C) : arrêt exhaustif des relances', par]);
  }

  // ② + ③ LEVÉE DU MARQUEUR PARTIEL — tue la cascade partielle ET la relance sur réponse partielle. No-op si aucun marqueur actif.
  //   Combinée à ① : la cascade ordinaire NE redémarre PAS (la demande est désormais 'close', hors de son filtre 'envoyee').
  await q(
    `UPDATE demande SET partiel_leve_le = now(), partiel_leve_par = $2, maj_le = now()
       WHERE id = $1 AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`,
    [demandeId, par]);
  return true;
}
