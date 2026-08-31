/**
 * TRACE d'un envoi automatique REFUSÉ par le PLAFOND ANTI-CUMUL (voir `plafondEnvoiRun.ts`). Un mail non parti doit être VISIBLE,
 * jamais silencieux : on écrit une ligne append-only dans `demande_journal` (auteur 'systeme', statut_avant/apres NULL — on n'écrit
 * JAMAIS demande.statut). Best-effort : un échec d'écriture de trace n'interrompt jamais la veille. AUCUN effet sur le butoir CADA.
 *
 * ISOLÉ de `plafondEnvoiRun.ts` qui reste PUR (compteur en mémoire) : ce module-ci porte la seule I/O.
 */
import { query } from '../db/client';

/** Motif lisible d'un report par plafond, préfixe STABLE (jamais confondu avec un envoi ni une relance). */
export const MOTIF_REPORT_PLAFOND_PREFIXE = 'envoi automatique reporté (plafond par demande et par run)';

/**
 * Journalise le report d'UN envoi automatique pour cause de plafond atteint. `emetteur` nomme l'émetteur écarté (cascade partielle,
 * relance sur réponse, …) pour l'audit. Best-effort : toute erreur (table/colonnes absentes) est avalée — la veille continue.
 */
export async function tracerReportPlafond(demandeId: number, emetteur: string): Promise<void> {
  try {
    await query(
      `INSERT INTO demande_journal (demande_id, statut_avant, statut_apres, motif, auteur) VALUES ($1, NULL, NULL, $2, 'systeme')`,
      [demandeId, `${MOTIF_REPORT_PLAFOND_PREFIXE} — ${emetteur} reporté au prochain passage (aucune donnée perdue ; butoir CADA inchangé)`]);
  } catch { /* best-effort : une trace qui échoue n'interrompt jamais la veille */ }
}
