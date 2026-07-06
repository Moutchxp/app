/**
 * Ré-vérification LECTURE SEULE des 3 conditions de repli du moteur de score
 * (EX-17). Réplique localement les 3 checks de `chargerProfilDegagement`
 * (`profilConfig.ts`) SANS l'importer : aucune logique métier, aucun accès DB,
 * aucun import de `app/lib/svv/**`. On reçoit la ligne déjà lue par la route.
 *
 * Repli = le moteur retomberait sur PROFIL_DEGAGEMENT_DEFAUT malgré la présence
 * d'une ligne en base. Les 3 causes :
 *   1. ligne `id=1` absente ;
 *   2. `mode_combinaison` hors liste fermée {max, addition, sequentiel} ;
 *   3. `distance_max_m > analysis_range_m` (garde-fou du cap perçu).
 */

/** Liste fermée des modes acceptés — copiée en dur (pas d'import métier). */
export const MODES: readonly string[] = ['max', 'addition', 'sequentiel'];

/** Sous-ensemble de la ligne `config_scoring` utile aux 3 checks. */
export interface LigneRepli {
  mode_combinaison?: unknown;
  distance_max_m?: unknown;
  analysis_range_m?: unknown;
}

export interface ResultatRepli {
  /** true = profil réellement actif ; false = le moteur retomberait sur le défaut. */
  actif: boolean;
  /** Raisons du repli (vide si actif). */
  raisons: string[];
}

/**
 * Évalue si le profil en base est réellement actif ou en repli sur le défaut.
 * `row` = la ligne lue par la route (ou `null` si `id=1` absent).
 */
export function evaluerRepli(row: LigneRepli | null): ResultatRepli {
  const raisons: string[] = [];

  if (!row) {
    raisons.push('profil absent (aucune ligne id=1 en base)');
    return { actif: false, raisons };
  }

  if (!MODES.includes(String(row.mode_combinaison))) {
    raisons.push(
      `mode_combinaison « ${String(row.mode_combinaison)} » hors liste fermée {max, addition, sequentiel}`,
    );
  }

  const distanceMax = Number(row.distance_max_m);
  const portee = Number(row.analysis_range_m);
  if (distanceMax > portee) {
    raisons.push(
      `distance_max_m (${distanceMax}) dépasse la portée d’analyse analysis_range_m (${portee})`,
    );
  }

  return { actif: raisons.length === 0, raisons };
}
