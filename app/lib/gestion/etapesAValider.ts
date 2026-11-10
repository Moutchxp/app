/**
 * ══ 🔴🔴 LOT GESTION-VALIDATION-MONGA (Arno, 10/11/2026) — « IL RESTE AU MOINS UNE ÉTAPE À VALIDER SUR L'ÉVÉNEMENT ». PUR. ══
 *
 * UNE SEULE DÉFINITION, lue par la liste (encadré rouge, remontée en tête), le tableau de bord (filtre « Étapes à valider »)
 * et les épreuves : une carte de la frise de l'événement (la sienne, ou celle d'une référence Monga reliée), VIVE, « à
 * confirmer », et qui est un CARRÉ — les repères (points) ne portent pas de boutons, ils ne peuvent donc pas être validés et
 * ne doivent pas allumer un rouge qu'aucun geste n'éteindrait.
 *
 * Arno : « il ne s'allume que s'il reste au moins une étape à valider sur l'événement, commun à toute l'équipe, et c'est lui
 * qui fait remonter l'événement en tête ; il s'éteint quand plus aucune étape n'est en attente. » Aucune donnée par
 * collaborateur : le même rouge pour tout le monde, éteint par le dernier ✓ ou ✗.
 *
 * ⚠️ UNE ÉTAPE CRÉÉE À LA MAIN N'EST JAMAIS « À CONFIRMER » (elle naît `fiable`) : elle ne peut pas entrer ici.
 */
import { REPERES } from './mongaEtape';

export const CLE_FILTRE_ETAPES_A_VALIDER = 'etapes-a-valider';
export const MOT_FILTRE_ETAPES_A_VALIDER = 'Étapes à valider';

/** Le prédicat SQL d'une étape en attente de validation de l'événement `alias` (alias de table interne : `svv_v`). */
function ouEnAttente(alias: string): string {
  const reperes = REPERES.map((t) => `'${t}'`).join(',');
  return `svv_v.statut = 'vif' AND svv_v.certitude = 'a_confirmer' AND svv_v.type <> ALL (ARRAY[${reperes}])
       AND (svv_v.evenement_id = ${alias}.id
            OR svv_v.reference IN (SELECT svv_vl.reference FROM gestion_monga_lien svv_vl
                                    WHERE svv_vl.evenement_id = ${alias}.id AND svv_vl.retire_le IS NULL))`;
}

/** Combien d'étapes attendent ✓/✗ sur l'événement (entier). */
export function sqlNbEtapesAValider(alias: string): string {
  return `(SELECT count(*)::int FROM gestion_monga_etape svv_v WHERE ${ouEnAttente(alias)})`;
}

/** Quand la plus récente de ces étapes a été posée (pour ordonner les événements en rouge entre eux). */
export function sqlDerniereEtapeAValiderLe(alias: string): string {
  return `(SELECT max(svv_v.cree_le) FROM gestion_monga_etape svv_v WHERE ${ouEnAttente(alias)})`;
}

/** L'encadré rouge de la vignette. PUR. */
export function aValider(c: { etapesAValider?: number | null }): boolean {
  return (c.etapesAValider ?? 0) > 0;
}

/** « 1 étape à valider », « 2 étapes à valider ». PUR. */
export function motEtapesAValider(n: number): string {
  return n <= 1 ? '1 étape à valider' : `${n} étapes à valider`;
}
