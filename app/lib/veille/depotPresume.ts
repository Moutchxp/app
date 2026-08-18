import { query } from '../db/client';

/**
 * LOT A — le clic « copier » d'une demande TÉLÉSERVICE vaut SIGNAL d'intention de dépôt. On le CONSTATE (trace +
 * verrou d'unicité par commune), sans jamais toucher demande.statut ni demande_acheminement.envoye_le : AUCUNE échéance CRPA
 * ne court d'ici. La validation (marquerDeposee) et les deux issues du verrou (« déposée » / « renoncée ») viennent dans un
 * lot ultérieur — leurs colonnes sont déjà prévues (migration 124). LECTURE + un seul écrivain, sur la table dédiée.
 */

export type BoutonCopie = 'texte' | 'ref';
export type IssueSignal = 'enregistre' | 'non_formulaire' | 'verrou_commune' | 'demande_introuvable';

/** FENÊTRE de détection par défaut (secondes). Le Lot B la rendra configurable (config_veille) ; ici, valeur sûre en dur.
 *  ⚠️ La fenêtre PÉRIME (echeance_detection_le) ; elle N'EST PAS le verrou — le verrou (resolu_le IS NULL) dure jusqu'à résolution. */
const FENETRE_DEFAUT_SECONDES = 60;

const COLONNE_COPIE: Record<BoutonCopie, 'copie_texte_le' | 'copie_ref_le'> = { texte: 'copie_texte_le', ref: 'copie_ref_le' };

/**
 * Constate le signal « copier » sur une demande. Idempotent par demande (recliquer met à jour l'horodatage + la fenêtre, sans
 * empiler). Renvoie l'issue métier, jamais une exception métier :
 *   · 'demande_introuvable'  → id inconnu ;
 *   · 'non_formulaire'       → la demande n'est pas au téléservice (un e-mail ne présume rien) ;
 *   · 'verrou_commune'       → une AUTRE demande de la même commune est déjà en vol (index partiel, 23505) ;
 *   · 'enregistre'           → trace posée/mise à jour.
 * Toute erreur INATTENDUE est propagée (pas de catch muet).
 */
export async function signalerDepotPresume(demandeId: number, bouton: BoutonCopie): Promise<IssueSignal> {
  const col = COLONNE_COPIE[bouton];

  // 1) Commune + canal lus SERVEUR (jamais depuis le client). Seul le téléservice (formulaire) présume un dépôt.
  const meta = await query<{ code_insee: string | null; dest_canal: string | null }>(
    `SELECT code_insee, dest_canal FROM demande WHERE id = $1`, [demandeId]);
  const row = meta.rows[0];
  if (!row) return 'demande_introuvable';
  if (row.dest_canal !== 'formulaire' || !row.code_insee) return 'non_formulaire';

  // 2) UPSERT de la présomption VIVANTE de CETTE demande. Le VERROU par commune (index partiel resolu_le IS NULL) fait échouer
  //    en 23505 une 2e demande de la MÊME commune → 'verrou_commune'. N'écrit RIEN d'autre que cette table.
  try {
    await query(
      `INSERT INTO demande_depot_presume (demande_id, code_insee, ${col}, dernier_signal_le, echeance_detection_le)
            VALUES ($1, $2, now(), now(), now() + make_interval(secs => $3::int))
       ON CONFLICT (demande_id) WHERE resolu_le IS NULL
       DO UPDATE SET ${col} = now(), dernier_signal_le = now(),
                     echeance_detection_le = now() + make_interval(secs => $3::int), maj_le = now()`,
      [demandeId, row.code_insee, FENETRE_DEFAUT_SECONDES]);
    return 'enregistre';
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return 'verrou_commune';
    throw e;
  }
}
