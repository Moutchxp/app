/**
 * Checklist de l'écran « Analyse en cours » (lot ATTENTE-SCORE, 16/10/2026).
 *
 * L'écran d'attente reste affiché jusqu'à la fin de TOUS les calculs dont la page de score a besoin : le calcul
 * géométrique (/api/analyse), puis l'analyse IA de la photo (/api/analyse-photo, qui fixe le score final). Les étapes
 * défilent toujours au minuteur, mais aucune ne se coche avant que le calcul qu'elle désigne soit réellement fini :
 *   - pendant le calcul géométrique : au plus « Hauteurs des bâtiments » en cours ;
 *   - pendant l'analyse de la photo : au plus « Analyse photo (IA) » en cours ;
 *   - la dernière (« Calcul du résultat ») n'est jamais cochée : la page de score s'ouvre à la vraie fin.
 */
export const ETAPES_ANALYSE = [
  "Localisation",
  "Obstacles",
  "Altitudes terrain",
  "Hauteurs des bâtiments",
  "Analyse photo (IA)",
  "Calcul du résultat",
] as const;

export type PhaseAnalyse = "geometrie" | "photo";

const INDEX_PHOTO = ETAPES_ANALYSE.indexOf("Analyse photo (IA)");

/** Index maximal que le minuteur peut atteindre (étape « en cours ») pendant la phase donnée. */
export function plafondEtapeAnalyse(phase: PhaseAnalyse): number {
  return phase === "geometrie" ? INDEX_PHOTO - 1 : INDEX_PHOTO;
}

/** Pas suivant du minuteur : avance d'une étape sans dépasser le plafond de la phase (jamais de recul). */
export function etapeSuivante(courante: number, phase: PhaseAnalyse): number {
  return Math.max(courante, Math.min(courante + 1, plafondEtapeAnalyse(phase)));
}

/** La page de score attend-elle l'analyse de la photo ? Seulement pour un vrai verdict (7A/7B), qui affiche le score. */
export function scoreAttendPhoto(resultat: { verdict: { verdict: string } } | null | undefined): boolean {
  return resultat != null && resultat.verdict.verdict !== "INDETERMINE";
}
