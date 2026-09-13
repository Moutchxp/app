/**
 * Lot 2 — ÉTAT d'une commune VU DEPUIS la carte d'un rail donné, dérivé de son `canal` (mairie_contact.canal). PUR (client-safe, aucune I/O,
 * aucune couleur). Réutilise `processDeCanal` (SOURCE UNIQUE du mapping canal→rail — jamais redupliqué).
 *   · 'courant'     : la commune est DÉJÀ sur CE rail (processDeCanal(canal) === rail) ;
 *   · 'autre'       : elle est sur l'AUTRE rail (l'autre process) ;
 *   · 'horsProcess' : canal DÉLIBÉRÉMENT hors des deux process ('courrier'/'inconnu') → NON sélectionnable (décision Arno : renvoi fiche contact) ;
 *   · 'nonAffecte'  : aucun canal (null/absent) → non affectée, SÉLECTIONNABLE (intention ; la validation Lot 3 refusera et renverra à la
 *                     fiche contact si la coordonnée cible manque — cf. raisonRefusBascule).
 * ⚠️ Nuance ASSUMÉE (signalée au porteur) : dans le modèle process, 'courrier'/'inconnu'/null retombent tous « hors process ». On SÉPARE ici
 *   « hors process » (canal délibéré non-process → non sélectionnable) de « non affecté » (aucun canal → sélectionnable) pour honorer les
 *   QUATRE états demandés. Si le porteur préfère que null soit aussi non sélectionnable, c'est un changement d'une ligne.
 */
import { processDeCanal, type Process } from './process';

export type EtatCommuneRail = 'courant' | 'autre' | 'nonAffecte' | 'horsProcess';

export function etatCommuneRail(canal: string | null | undefined, rail: Process): EtatCommuneRail {
  const p = processDeCanal(canal);
  if (p === rail) return 'courant';
  if (p !== null) return 'autre';
  if (canal === 'courrier' || canal === 'inconnu') return 'horsProcess';
  return 'nonAffecte';
}

/** Seule une commune HORS PROCESS (canal délibéré non-process) est NON sélectionnable ; les autres portent une intention. */
export function communeSelectionnable(etat: EtatCommuneRail): boolean {
  return etat !== 'horsProcess';
}

/** Libellé lisible de l'état (lecteur d'écran + légende + bulle de survol). Aucune couleur ici (la couleur n'est qu'un appui). SOURCE UNIQUE. */
export const LIBELLE_ETAT_RAIL: Record<EtatCommuneRail, string> = {
  courant: 'sur ce rail',
  autre: 'sur l’autre rail',
  nonAffecte: 'non affectée',
  horsProcess: 'hors process (non sélectionnable)',
};
/** Libellés des overlays (édition/survol) — MÊME source que la légende ET la bulle : un libellé qui change ici change partout. */
export const LIBELLE_SELECTION = 'sélectionnée';
export const LIBELLE_SURVOL = 'survol';

/** Statut AFFICHÉ d'une commune (celui qui EXPLIQUE sa couleur) : « sélectionnée » quand l'overlay de sélection est montré (édition),
 *  sinon l'état réel dérivé du canal. Utilisé par la bulle de survol ET la légende (source unique — jamais réécrit à la main). PUR. */
export function statutAffiche(etat: EtatCommuneRail, montreSelection: boolean): string {
  return montreSelection ? LIBELLE_SELECTION : LIBELLE_ETAT_RAIL[etat];
}

/**
 * Lot C — action déclenchée par un clic (ou Entrée/Espace) sur une commune de la carte. Le MODE prime, la distinction de mode
 * EXISTE déjà (`editable`, qui conditionne l'overlay de sélection depuis 4ac95ff) — on la RÉUTILISE, on n'en invente pas une 2e :
 *   · ÉDITION (`editable`) : on (dé)sélectionne si la commune est sélectionnable, sinon rien (geste existant, INCHANGÉ) ;
 *   · REPOS : si une ouverture de fiche est câblée, TOUTE commune ouvre sa fiche contact (même hors process — ce sont justement
 *     celles à renseigner) ; sinon rien (usage standalone/historique : la carte au repos reste inerte). PUR (aucune couleur, aucune I/O).
 */
export type ActionCarte = 'basculer' | 'ouvrir' | 'inerte';
export function actionAuClic(editable: boolean, selectionnable: boolean, ouvertureCablee: boolean): ActionCarte {
  if (editable) return selectionnable ? 'basculer' : 'inerte';
  return ouvertureCablee ? 'ouvrir' : 'inerte';
}
