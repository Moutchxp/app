// D — SURLIGNAGE du bâtiment SÉLECTIONNÉ sur la vue normale et l'XL : dire d'un coup d'œil quel bâtiment est courant, en surlignant SES
//   emprises sur le schéma. La sélection étant PAR BÂTIMENT (corpsEffectif, cf. commit C), on surligne TOUTES les emprises rattachées au
//   bâtiment courant — 0, 1 ou plusieurs — jamais une seule choisie arbitrairement.
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';

/**
 * Ids des emprises à surligner (celles du bâtiment sélectionné). Règles (décision Arno) :
 *   · moins de 2 bâtiments → RIEN (rien à distinguer quand il n'y a qu'un bâtiment) ;
 *   · aucun bâtiment sélectionné → RIEN ;
 *   · sinon → TOUTES les emprises dont `corpsId === corpsIdSelectionne` (un bâtiment sans emprise tracée → tableau vide, aucune erreur).
 * PUR, sans effet de bord. L'exclusion de l'emprise en cours de geste (ajustement/retouche) relève de l'appelant (l'aperçu/la retouche est
 * alors l'indicateur LIVE — surligner la géométrie stockée en parallèle la ferait diverger de la cible, cf. point 3).
 */
export function emprisesASurligner(
  emprises: Pick<EmpriseReconstruite, 'id' | 'corpsId'>[],
  corpsIdSelectionne: number | null,
  nbBatiments: number,
): number[] {
  if (nbBatiments < 2 || corpsIdSelectionne == null) return [];
  return emprises.filter((e) => e.corpsId === corpsIdSelectionne).map((e) => e.id);
}
