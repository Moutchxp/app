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

/** Libellé lisible de l'état (lecteur d'écran + légende). Aucune couleur ici (la couleur n'est qu'un appui). */
export const LIBELLE_ETAT_RAIL: Record<EtatCommuneRail, string> = {
  courant: 'sur ce rail',
  autre: 'sur l’autre rail',
  nonAffecte: 'non affectée',
  horsProcess: 'hors process (non sélectionnable)',
};
