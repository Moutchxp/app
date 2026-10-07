/**
 * ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 3 — « EN GESTION », ÉCRIT **UNE SEULE FOIS** ═════════════════════════════
 *
 * Module PUR : aucune I/O, aucun React, aucun `pg`. Il ne porte qu'une question, celle que la fiche propriétaire
 * pose déjà quand elle sépare ses cartes en deux : ce bien est-il ENCORE en gestion chez nous ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LA DÉFINITION, ET ELLE N'EST PAS NOUVELLE : un bien est EN GESTION tant qu'il n'a pas de DATE DE FIN de gestion
 * (`gestion_annuaire_lot.gestion_fin IS NULL`). C'est mot pour mot ce que la fiche propriétaire applique depuis le
 * lot FICHES-ANNUAIRE — `enGestion = f.biens.filter((b) => b.fin === null)` — et ce que son écran écrit en toutes
 * lettres sur chaque carte : « En gestion depuis … » quand la date manque, « Sorti de gestion le … » sinon.
 *
 * 🔴 LES BIENS VENDUS OU PERDUS SONT DONC EXCLUS : ils portent une date de fin, et la fiche les range à part,
 * sous « anciens ». Un propriétaire de quatre lots dont deux vendus en compte DEUX.
 *
 * 🔴 POURQUOI CE MODULE EXISTE. Arno, point 3 : « réutilise ce calcul, pas de seconde requête qui recompte à sa
 * façon ». La règle était écrite DANS l'écran de la fiche ; la barre Annuaire en avait besoin aussi. L'y recopier
 * aurait donné deux définitions de « en gestion » — et le jour où l'une apprend à écarter autre chose (un bien
 * suspendu, un mandat échu), l'autre ne l'apprendrait pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Tout ce qu'il faut savoir d'un bien pour répondre. Structurel : `BienDuProprietaire` et `BienLie` passent tels quels. */
export interface BienDatable {
  /** La date de FIN de gestion, en ISO. `null` = la gestion court toujours. */
  fin: string | null;
}

/** CE BIEN EST-IL ENCORE EN GESTION ? La seule écriture de la règle. */
export function bienEnGestion(b: BienDatable): boolean {
  return b.fin === null;
}

/**
 * COMBIEN DE BIENS EN GESTION dans cette liste.
 *
 * ⚠️ IL COMPTE CE QU'ON LUI DONNE, et rien de plus : c'est à l'appelant de lui passer TOUS les biens de la
 * personne. Une liste tronquée rendrait un nombre juste pour elle et faux pour l'écran.
 */
export function compterBiensEnGestion(biens: readonly BienDatable[]): number {
  return biens.filter(bienEnGestion).length;
}
