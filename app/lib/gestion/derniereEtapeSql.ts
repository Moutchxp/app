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
const TYPES_HORS_CARTE = "'facture','rappel_devis','contact_injoignable','commentaire','note'";

export function sqlDerniereEtape(alias: string, mongaSeulement: boolean): string {
  return `
  LEFT JOIN LATERAL (
    SELECT x.type, x.titre, x.survenu_le, x.heure_connue, x.jour_connu, x.source, x.certitude
      FROM gestion_monga_etape x
     WHERE x.statut = 'vif'
       AND x.type NOT IN (${TYPES_HORS_CARTE})
       ${mongaSeulement ? "AND x.source = 'monga'" : ''}
       AND (x.evenement_id = e.id
            OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                WHERE evenement_id = e.id AND retire_le IS NULL))
     ORDER BY x.survenu_le DESC, x.id DESC
     LIMIT 1
  ) ${alias} ON true`;
}

/**
 * 🔴 Arno (23/10/2026) — « L'ÉTAPE COURANTE EST-ELLE “CLÔTURE” ? », la même dernière étape que la miniature (mêmes cartes, même
 * ordre). Sert au filtre de sécurité du bloc « Événements » : un événement à l'étape « Clôture » n'y est JAMAIS compté, même si
 * sa période n'était pas fermée. Corrélé sur `alias.id`.
 */
export function sqlEtapeCouranteEstCloture(alias: string): string {
  return `coalesce((SELECT x.type = 'cloture'
      FROM gestion_monga_etape x
     WHERE x.statut = 'vif'
       AND x.type NOT IN (${TYPES_HORS_CARTE})
       AND (x.evenement_id = ${alias}.id
            OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                WHERE evenement_id = ${alias}.id AND retire_le IS NULL))
     ORDER BY x.survenu_le DESC, x.id DESC
     LIMIT 1), false)`;
}
