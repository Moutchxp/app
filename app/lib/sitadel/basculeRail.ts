/**
 * D5 — RÈGLE PURE de la bascule d'une commune d'un rail (process) à l'autre. Aucune I/O. Réutilise `validerCanal` (mairieContact),
 * FOYER UNIQUE de la garde canal↔coordonnée — jamais recopiée. La bascule est une opération d'ergonomie : elle ne fait que changer
 * `mairie_contact.canal` (via l'éditeur de contact existant) et annuler les demandes NON ENVOYÉES de la commune (chemin D1).
 */
import { validerCanal, type CanalContact } from './mairieContact';
import type { Process } from './process';

export interface CoordonneesContact {
  email: string | null;
  urlFormulaire: string | null;
  adressePostale: string | null;
}

/**
 * RAISON de refus d'une bascule vers `cible`, ou `null` si permise. PURE.
 *  · vers le rail DÉJÀ actif → refus (rien à faire).
 *  · coordonnée cible manquante (téléservice sans URL, e-mail sans adresse) → refus avec la raison de `validerCanal`, et on
 *    renvoie à la FICHE CONTACT : on ne saisit pas la coordonnée ici (pas de duplication de l'éditeur — décision porteur D5).
 */
export function raisonRefusBascule(canalActuel: string | null, cible: Process, coords: CoordonneesContact): string | null {
  if (canalActuel === cible) return 'la commune est déjà sur ce rail';
  const invalide = validerCanal(cible as CanalContact, coords);
  if (invalide) return `${invalide} — renseignez d'abord la coordonnée dans la fiche contact (onglet Permis) avant de basculer`;
  return null;
}
