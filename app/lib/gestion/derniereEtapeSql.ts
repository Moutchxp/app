/**
 * ══ LA DERNIÈRE ÉTAPE D'UN ÉVÉNEMENT, EN SQL — MODULE PUR (aucun import) ══════════════════════════════════════════════
 *
 * Sorti de `fileRepo` au lot BLOC-EVENEMENT-RATTACHE-COMPLET, sans un caractère changé : la vignette de la carte
 * (`fileRepo`) et la liste « Événements en cours sur ce bien » de la fenêtre du mail (`historiqueRepo`) lisent la
 * MÊME dernière étape. Un module pur, pour que l'historique ne tire pas `fileRepo` (et Gmail) derrière lui.
 *
 * Toutes les cartes VIVES de l'événement et de ses références MNG reliées, les types qui ne sont pas des cartes
 * exclus, triées par date (lot FRISE-CONSTRUCTIBLE) ; `mongaSeulement` borne aux étapes venues de Monga.
 * L'alias de l'événement porteur est `e`.
 */
export function sqlDerniereEtape(alias: string, mongaSeulement: boolean): string {
  return `
  LEFT JOIN LATERAL (
    SELECT x.type, x.titre, x.survenu_le, x.heure_connue, x.jour_connu, x.source, x.certitude
      FROM gestion_monga_etape x
     WHERE x.statut = 'vif'
       AND x.type NOT IN ('facture','rappel_devis','contact_injoignable','commentaire','note')
       ${mongaSeulement ? "AND x.source = 'monga'" : ''}
       AND (x.evenement_id = e.id
            OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                WHERE evenement_id = e.id AND retire_le IS NULL))
     ORDER BY x.survenu_le DESC, x.id DESC
     LIMIT 1
  ) ${alias} ON true`;
}
