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

/** LOT B1 — issues explicites de résolution (liste fermée du CHECK, migration 124). */
export type ResolutionDepot = 'deposee' | 'renoncee';

/** Exécuteur SQL minimal : compatible AUSSI BIEN `query` (pool) que l'exécuteur d'une `withTransaction` — on n'a besoin que
 *  d'ÉMETTRE l'UPDATE, jamais de son résultat. Permet d'appeler la résolution DANS la transaction du geste sans coupler les types. */
type ExecuteurSql = (text: string, params?: unknown[]) => Promise<unknown>;

/**
 * LOT B1 — RÉSOUT la présomption VIVANTE d'une demande téléservice (lève le verrou de commune), au moment du geste terminal :
 * dépôt (`marquerDeposee` → 'deposee') ou annulation (`changerStatutLot` → 'renoncee'). Pose les TROIS colonnes ensemble
 * (`resolu_le`/`resolution`/`resolu_par`) → respecte le CHECK. `WHERE demande_id = $1 AND resolu_le IS NULL` :
 *   · IDEMPOTENT — 0 ligne concernée = NO-OP silencieux (aucune erreur) : rejouable, et sans danger quand AUCUNE présomption
 *     n'existe (geste sur une demande jamais « copiée ») ;
 *   · ne touche QUE la présomption VIVANTE (une ligne déjà résolue n'est jamais réécrite).
 * DOIT tourner DANS la transaction du geste (atomicité : aucune fenêtre « déposée/annulée mais verrou encore tenu »). L'UPDATE
 * étant sans contrainte rejetable, il ne peut JAMAIS faire échouer le geste appelant. N'écrit QUE cette table.
 */
export async function resoudreDepotPresume(q: ExecuteurSql, demandeId: number, resolution: ResolutionDepot, resoluPar: string | null): Promise<void> {
  await q(
    `UPDATE demande_depot_presume
        SET resolu_le = now(), resolution = $2, resolu_par = $3, maj_le = now()
      WHERE demande_id = $1 AND resolu_le IS NULL`,
    [demandeId, resolution, resoluPar],
  );
}
