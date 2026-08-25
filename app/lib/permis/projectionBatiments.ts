/**
 * PROJ-2b — RÈGLE DE BLOCAGE (pure, testée) : la validation d'un rattachement exige que CHAQUE bâtiment du permis soit COUVERT,
 * c'est-à-dire ait SOIT une emprise reconstituée, SOIT une projection explicitement ignorée. Le calcul est bâtiment par bâtiment,
 * JAMAIS global. AUCUNE I/O — entrée = listes, sortie = verdict + libellé lisible affiché AVANT le clic.
 *
 * ⚠️ Ce n'est PAS la garde de reconstitution (celle-ci vit en base + repo). C'est un GARDE-FOU DE PARCOURS : « obliger à projeter
 * (ou à ignorer explicitement) avant de valider ». Un permis SANS bâtiment déclaré est passant (rien à exiger — jamais un faux blocage).
 */

export interface BatimentProjection { corpsId: number; repere: string | null }

export interface VerdictProjection {
  peutValider: boolean;
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
 * Verdict de projection. `corpsAvecEmprise` = corpsId ayant au moins une emprise tracée ; `corpsIgnores` = corpsId dont la
 * projection est ignorée. Un bâtiment est COUVERT s'il est dans l'un OU l'autre. `peutValider` = tous couverts. `manquants`
 * NOMME ce qui reste. Le comptage « ignoré » n'inclut PAS un bâtiment qui a AUSSI une emprise (une trace prime, jamais compté deux fois).
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
  return { peutValider: manquants.length === 0, nbBatiments, nbTraces, nbIgnores, manquants, libelle: parts.join(' · ') };
}
