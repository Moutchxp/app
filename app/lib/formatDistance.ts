/**
 * Formatage PUR AFFICHAGE de la distance-verdict présentée à l'internaute
 * (`resultat.verdict.distanceM`). Réf : docs/SPEC_affichage_seuil_40m.md.
 *
 * Règle : arrondi au plus proche (Math.round) PARTOUT, SAUF la tranche [39,00 ; 39,99]
 * FORCÉE à 39 (jamais 40) — un obstacle réellement sous le seuil (verdict vis-à-vis) ne
 * doit jamais s'afficher « 40 m ». Formule : (d >= 39 && d < 40) ? 39 : Math.round(d).
 *
 * AFFICHAGE UNIQUEMENT : n'affecte NI le verdict NI le moteur (`app/lib/svv`). Le verdict
 * binaire reste décidé EN AMONT sur `distanceM` BRUT (verdict.ts, seuil 40 m). Seule source
 * de vérité de la troncature d'affichage, partagée par les deux sites de l'écran Résultat.
 */

/** Mètres affichés (entier) pour la distance-verdict ; `null` si distance absente/non finie. */
export function metresVerdictAffiches(distanceM: number | null): number | null {
  if (distanceM === null || !Number.isFinite(distanceM)) return null;
  if (distanceM >= 39 && distanceM < 40) return 39; // exception seuil : jamais « 40 » sous 40 m
  return Math.round(distanceM);
}

/** Chaîne « X m » (Site 1 « Premier obstacle face ») ou « Aucun (≥ 200 m) » si distance absente. */
export function formaterDistanceVerdict(distanceM: number | null): string {
  const m = metresVerdictAffiches(distanceM);
  return m === null ? "Aucun (≥ 200 m)" : `${m} m`;
}
