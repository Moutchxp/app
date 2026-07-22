/**
 * Dérivations PARTAGÉES du descriptif du bien, utilisées à la fois par le GÉNÉRATEUR PDF (affichage) et par l'ÉMISSION
 * (figement du snapshot pour le visuel). Une seule source de vérité — jamais dupliquer la logique dans les deux modules.
 */

/**
 * Extérieur du bien dérivé du payload du tunnel (booléens `balcon` / `terrasse` / `jardin`). Priorité au premier vrai,
 * défaut `'Aucun'`. `null` si aucun payload (non-couplage). Sortie stable : `'Balcon' | 'Terrasse' | 'Jardin' | 'Aucun'`.
 */
export function deriverExterieur(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  if (payload.balcon === true) return 'Balcon';
  if (payload.terrasse === true) return 'Terrasse';
  if (payload.jardin === true) return 'Jardin';
  return 'Aucun';
}
