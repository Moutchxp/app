import 'server-only';
import { query } from '../db/client';

/**
 * LOT 47 — ACQUITTEMENT « nouvelles pièces vues » (bouton « vu », au niveau du permis concerné).
 *
 * Acquitte, pour TOUS les dossiers actifs de la demande, l'instant courant : toute pièce (dossier_document) déposée AVANT devient
 * « vue » ; le badge « nouvelles pièces reçues » s'éteint jusqu'au PROCHAIN versement. UPSERT (une ligne par dossier ; vu_le réécrit).
 * `motif` distingue le geste ('vu' ici ; LOT 48 ajoutera 'complet' via la même table). N'écrit JAMAIS demande.statut.
 *
 * L'autre extinction (envoi d'une relance, manuelle OU automatique) N'EST PAS écrite ici : elle est DÉRIVÉE à la lecture
 * (reponsesSuivi) de la trace universelle des relances (demande_journal / demande_acheminement) → aucun code d'envoi à modifier.
 * Résilient : table 188 absente (code 42P01) → NO-OP (false), l'appelant reste utilisable.
 */
export async function acquitterNouvellesPieces(demandeId: number, vuPar: string | null): Promise<boolean> {
  try {
    const { rowCount } = await query(
      `INSERT INTO dossier_pieces_acquittement (dossier_id, vu_le, vu_par, motif)
         SELECT dd.dossier_id, now(), $2, 'vu' FROM demande_dossier dd WHERE dd.demande_id = $1 AND dd.actif
       ON CONFLICT (dossier_id) DO UPDATE SET vu_le = EXCLUDED.vu_le, vu_par = EXCLUDED.vu_par, motif = EXCLUDED.motif`,
      [demandeId, vuPar]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return false; // migration 188 non appliquée → NO-OP sûr
    throw e;
  }
}
