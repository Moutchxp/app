/**
 * PROJ-2b — RÈGLE DE BLOCAGE (pure, testée) : la validation d'un rattachement exige que CHAQUE bâtiment du permis soit COUVERT,
 * c'est-à-dire ait SOIT une emprise reconstituée, SOIT une projection explicitement ignorée. Le calcul est bâtiment par bâtiment,
 * JAMAIS global. AUCUNE I/O — entrée = listes, sortie = verdict + libellé lisible affiché AVANT le clic.
 *
 * ⚠️ Ce n'est PAS la garde de reconstitution (celle-ci vit en base + repo). C'est un GARDE-FOU DE PARCOURS : « obliger à projeter
 * (ou à ignorer explicitement) avant de valider ».
 *
 * 🔒 PROJ-3b — un permis SANS AUCUN bâtiment déclaré est désormais NON validable : « chaque bâtiment couvert » serait vrai par
 * vacuité (liste vide), ce qui laissait un permis quitter la file sans qu'aucune emprise n'existe. On EXIGE au moins un bâtiment
 * déclaré (geste « + ajouter un bâtiment » de l'instruction) avant de pouvoir valider la projection. `aucunBatiment` porte le fait.
 */

export interface BatimentProjection { corpsId: number; repere: string | null }

export interface VerdictProjection {
  peutValider: boolean;
  aucunBatiment: boolean;                              // PROJ-3b — aucun bâtiment déclaré → NON validable (l'écran invite à en déclarer un)
  nbBatiments: number;
  nbTraces: number;                                    // bâtiments avec ≥ 1 emprise
  nbIgnores: number;                                   // bâtiments dont la projection est ignorée (et non tracés)
  manquants: BatimentProjection[];                     // bâtiments ni tracés ni ignorés (ce qui reste à faire)
  libelle: string;                                     // « 2 bâtiments · 1 emprise tracée · 1 en attente »
}

/** Libellé d'un bâtiment pour l'affichage (repère si présent, sinon « bâtiment <id> »). */
export function libelleBatiment(b: BatimentProjection): string {
  return b.repere ?? `bâtiment ${b.corpsId}`;
}

/**
 * PROJ-2c — ÉLIGIBILITÉ d'un permis à la FILE « Projection ». Trois conditions CUMULÉES :
 *  · `documentsObtenus` = ses pièces ont été reçues (même critère que l'entrée en Archives : demande_dossier.satisfait_le) ;
 *  · `concerneEmprise` = neuve/extension (surélévation exclue — cf. `concerneProjectionEmprise`) ;
 *  · `dejaValidee` = false : une fois la projection validée, le permis QUITTE la file.
 * PUR (les faits DB sont passés en booléens ; le SQL du repo miroite exactement ces trois conditions).
 */
export function eligibleProjection(documentsObtenus: boolean, concerneEmprise: boolean, dejaValidee: boolean): boolean {
  return documentsObtenus && concerneEmprise && !dejaValidee;
}

export interface EffetValidationProjection {
  valide: boolean;
  etatSuiviCible: 'en_attente_bati' | null; // marquage suivi : le permis attend une mise à jour BD TOPO
  retireDeFile: boolean;                     // quitte la file « Projection »
  motif: string;
}
/**
 * PROJ-2c — EFFET de « Valider la projection ». Le bouton NE BLOQUE PAS, il FAIT AVANCER : si la condition PROJ-2b est
 * remplie (`peutValider` — chaque bâtiment tracé ou ignoré), le permis QUITTE la file et est MARQUÉ SUIVI (en_attente_bati) —
 * il ne peut aller plus loin tant que BD TOPO n'a pas bougé (le détecteur de delta l'ouvrira). Sinon, rien ne se passe. PUR.
 */
export function effetValidationProjection(peutValider: boolean): EffetValidationProjection {
  if (!peutValider) return { valide: false, etatSuiviCible: null, retireDeFile: false, motif: 'chaque bâtiment doit avoir une emprise tracée ou une projection explicitement ignorée' };
  return { valide: true, etatSuiviCible: 'en_attente_bati', retireDeFile: true, motif: 'projection validée : le permis passe en suivi (en attente d’une mise à jour) et sort de la file' };
}

/**
 * Verdict de projection. `corpsAvecEmprise` = corpsId ayant au moins une emprise tracée ; `corpsIgnores` = corpsId dont la
 * projection est ignorée. Un bâtiment est COUVERT s'il est dans l'un OU l'autre. `peutValider` = AU MOINS un bâtiment déclaré ET
 * tous couverts (PROJ-3b : zéro bâtiment ⇒ non validable). `manquants` NOMME ce qui reste. Le comptage « ignoré » n'inclut PAS un
 * bâtiment qui a AUSSI une emprise (une trace prime, jamais compté deux fois).
 */
export function verdictProjectionBatiments(
  batiments: BatimentProjection[], corpsAvecEmprise: number[], corpsIgnores: number[],
): VerdictProjection {
  const traces = new Set(corpsAvecEmprise);
  const ignores = new Set(corpsIgnores);
  const manquants = batiments.filter((b) => !traces.has(b.corpsId) && !ignores.has(b.corpsId));
  const nbTraces = batiments.filter((b) => traces.has(b.corpsId)).length;
  const nbIgnores = batiments.filter((b) => !traces.has(b.corpsId) && ignores.has(b.corpsId)).length; // ignoré ET non tracé
  const nbBatiments = batiments.length;
  const parts = [
    `${nbBatiments} bâtiment${nbBatiments > 1 ? 's' : ''}`,
    `${nbTraces} emprise${nbTraces > 1 ? 's' : ''} tracée${nbTraces > 1 ? 's' : ''}`,
  ];
  if (nbIgnores > 0) parts.push(`${nbIgnores} ignorée${nbIgnores > 1 ? 's' : ''}`);
  parts.push(`${manquants.length} en attente`);
  const aucunBatiment = nbBatiments === 0;
  return { peutValider: !aucunBatiment && manquants.length === 0, aucunBatiment, nbBatiments, nbTraces, nbIgnores, manquants, libelle: parts.join(' · ') };
}
