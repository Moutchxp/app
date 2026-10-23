/**
 * Arno (23/10/2026) — « Modifier » la fiche du bien : la page de la tuile d'où l'on vient, et le retour vers la fiche. PUR
 * (appelé par les pages serveur et par l'encart du bien).
 */
export function adresseModifier(lotId: number, depuisLaLocation: boolean): string {
  return depuisLaLocation ? `/admin/location/bien/${lotId}/modifier` : `/admin/gestion/bien/${lotId}/modifier`;
}

/** Le retour vers la fiche du bien, dans la tuile d'où l'on vient. PUR. */
export function retourVersLaFiche(lotId: number, depuisLaLocation: boolean): { href: string; mot: string } {
  return depuisLaLocation ? { href: `/admin/location/bien/${lotId}`, mot: 'Fiche du bien' } : { href: `/admin/gestion?ecran=annuaire&fiche=lot-${lotId}`, mot: 'Fiche du bien' };
}
