/**
 * Dérivations PARTAGÉES du descriptif du bien, utilisées à la fois par le GÉNÉRATEUR PDF (affichage) et par l'ÉMISSION
 * (figement du snapshot pour le visuel). Une seule source de vérité — jamais dupliquer la logique dans les deux modules.
 */

/**
 * Extérieur(s) du bien dérivé(s) du payload du tunnel (booléens `balcon` / `terrasse` / `jardin`). Liste TOUS les extérieurs
 * cochés, dans l'ordre balcon → terrasse → jardin, joints par « , » (ex. « Balcon, Terrasse »). Aucun coché → `'Aucun'`.
 * `null` si aucun payload (non-couplage). Sortie = chaîne libre (n'est plus une union figée : peut combiner plusieurs valeurs).
 */
export function deriverExterieur(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const parts: string[] = [];
  if (payload.balcon === true) parts.push('Balcon');
  if (payload.terrasse === true) parts.push('Terrasse');
  if (payload.jardin === true) parts.push('Jardin');
  return parts.length > 0 ? parts.join(', ') : 'Aucun';
}
