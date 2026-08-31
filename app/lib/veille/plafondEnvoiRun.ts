/**
 * PLAFOND ANTI-CUMUL par DEMANDE et par RUN — garde-fou UNIQUE et PARTAGÉ par TOUS les émetteurs automatiques d'un run de veille
 * (relance ordinaire, cascade partielle CASC-3, PART-E « relance sur réponse », saisine CADA auto). Ferme le trou d'audit du 31/08 :
 * PART-E et la cascade partielle pouvaient émettre DEUX relances à la même mairie dans le même run.
 *
 * 🔑 RÈGLE (Arno, 31/08) — N = plafond (défaut 1). Au plus N envoi(s) AUTOMATIQUE(s) par demande et par run, TOUS émetteurs confondus.
 *   Plafond PAR RUN, JAMAIS par fenêtre horaire : la règle du 30/08 (PART-E = une relance par NOUVELLE réponse, non limité ENTRE runs)
 *   reste intacte — un run suivant repart d'un budget neuf. Un budget est créé une fois par run et passé, LE MÊME objet, à chaque
 *   émetteur : c'est le « point d'étranglement unique », sans exclusion croisée entre exécuteurs.
 *
 * PUR (aucune I/O) : un compteur en mémoire par demande. `peutEnvoyer` avant l'envoi, `noterEnvoi` APRÈS un envoi CONFIRMÉ (jamais
 * sur un envoi refusé/en échec → un émetteur en panne ne consomme pas le budget d'un autre). Compose avec le verrou
 * `cascade_partiel_creneau` (exactement-une-fois de la cascade), sans le remplacer.
 */
export interface BudgetEnvoiRun {
  /** true si la demande peut encore recevoir un envoi automatique dans ce run (compteur < plafond). */
  peutEnvoyer(demandeId: number): boolean;
  /** Enregistre un envoi CONFIRMÉ pour la demande (à n'appeler qu'après un envoi réellement parti). */
  noterEnvoi(demandeId: number): void;
  /** Nombre d'envois déjà notés pour la demande dans ce run (pour la trace/diagnostic). */
  compteur(demandeId: number): number;
}

/**
 * Crée un budget de run. `plafond` est borné à ≥ 1 (jamais 0 : un plafond nul bloquerait TOUT envoi, ce qui n'est jamais l'intention
 * — le CHECK base impose déjà 1..10, ce clamp est un filet côté code contre une valeur aberrante injectée en test).
 */
export function creerBudgetRun(plafond: number): BudgetEnvoiRun {
  const n = Math.max(1, Math.trunc(Number.isFinite(plafond) ? plafond : 1));
  const compte = new Map<number, number>();
  return {
    peutEnvoyer: (demandeId) => (compte.get(demandeId) ?? 0) < n,
    noterEnvoi: (demandeId) => { compte.set(demandeId, (compte.get(demandeId) ?? 0) + 1); },
    compteur: (demandeId) => compte.get(demandeId) ?? 0,
  };
}
