/**
 * Logique PURE du pied de carte de curation (footer Sortir / Valider-Annuler). Aucune dépendance React
 * ni DB → testable unitairement. N'affecte NI le score NI le verdict (pur UI).
 */

/**
 * La carte est « modifiée » (⇒ footer Valider/Annuler au lieu de Sortir) si elle a été CRÉÉE dans la
 * session, OU si au moins une mutation a été appliquée depuis son ouverture.
 *
 * Équivalent à « max(id) du journal `curation_patrimoine_log` > borneOuverture » : chaque mutation ajoute
 * ≥1 ligne au journal, donc `muteeDepuisOuverture` (drapeau posé par les handlers d'écriture au succès)
 * traduit fidèlement « le max du journal a dépassé la borne capturée à l'ouverture ».
 */
export function estCarteModifiee(creeeEnSession: boolean, muteeDepuisOuverture: boolean): boolean {
  return creeeEnSession || muteeDepuisOuverture;
}

/** Mode du footer : un seul bouton « Sortir » si non modifiée, sinon « Valider » + « Annuler ». */
export function modeFooter(modifiee: boolean): 'sortir' | 'valider-annuler' {
  return modifiee ? 'valider-annuler' : 'sortir';
}
