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

import { nomAffichageCorps } from './nomCorps'; // NOM-1 — le SEUL décideur du nom d'affichage d'un corps

export interface BatimentProjection { corpsId: number; repere: string | null; nomRepli?: string | null } // NOM-1 — nom de repli maison (BP{rang}) si aucun repere document

// PROJ-3r — pour compter TOUTES les emprises et dire leur ORIGINE au pied de page (une emprise IGN n'est pas « tracée »).
export interface EmpriseCouverture { corpsId: number | null; provenance: string }

export interface VerdictProjection {
  peutValider: boolean;
  aucunBatiment: boolean;                              // PROJ-3b — aucun bâtiment déclaré → NON validable (l'écran invite à en déclarer un)
  nbBatiments: number;
  nbCouverts: number;                                  // bâtiments couverts par ≥ 1 emprise
  nbEmprises: number;                                  // PROJ-3r — TOUTES les emprises du dossier (peut être > nb de bâtiments)
  nbEmprisesIgn: number;                               // dont issues de l'IGN ('ign_*')
  nbEmprisesTrace: number;                             // dont tracées à la main ('trace_manuel')
  nbIgnores: number;                                   // bâtiments dont la projection est ignorée (et non couverts)
  manquants: BatimentProjection[];                     // bâtiments ni couverts ni ignorés (ce qui reste à faire)
  libelle: string;                                     // « 2 bâtiments · 3 emprises (2 issues de l'IGN, 1 tracée à la main) · 0 en attente »
}

/** NOM-1 — libellé d'un bâtiment pour l'affichage : nom du document (repere) → repli maison (BP{rang}) → « bâtiment <id> ». Délègue au SEUL décideur. */
export function libelleBatiment(b: BatimentProjection): string {
  return nomAffichageCorps({ repere: b.repere, nomRepli: b.nomRepli, corpsId: b.corpsId });
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
  batiments: BatimentProjection[], emprises: EmpriseCouverture[], corpsIgnores: number[],
): VerdictProjection {
  const couverts = new Set(emprises.map((e) => e.corpsId).filter((c): c is number => c !== null)); // bâtiments couverts par ≥ 1 emprise
  const ignores = new Set(corpsIgnores);
  const manquants = batiments.filter((b) => !couverts.has(b.corpsId) && !ignores.has(b.corpsId));
  const nbCouverts = batiments.filter((b) => couverts.has(b.corpsId)).length;
  const nbIgnores = batiments.filter((b) => !couverts.has(b.corpsId) && ignores.has(b.corpsId)).length; // ignoré ET non couvert
  const nbBatiments = batiments.length;
  // PROJ-3r — compter TOUTES les emprises et dire leur ORIGINE (jamais « tracée » pour une donnée IGN).
  const nbEmprises = emprises.length;
  const nbEmprisesIgn = emprises.filter((e) => (e.provenance ?? '').startsWith('ign_')).length;
  const nbEmprisesTrace = emprises.filter((e) => (e.provenance ?? 'trace_manuel') === 'trace_manuel').length;
  const parts = [`${nbBatiments} bâtiment${nbBatiments > 1 ? 's' : ''}`];
  if (nbEmprises > 0) {
    const org: string[] = [];
    if (nbEmprisesIgn > 0) org.push(`${nbEmprisesIgn} issue${nbEmprisesIgn > 1 ? 's' : ''} de l’IGN`);
    if (nbEmprisesTrace > 0) org.push(`${nbEmprisesTrace} tracée${nbEmprisesTrace > 1 ? 's' : ''} à la main`);
    parts.push(`${nbEmprises} emprise${nbEmprises > 1 ? 's' : ''}${org.length ? ` (${org.join(', ')})` : ''}`);
  } else parts.push('0 emprise');
  if (nbIgnores > 0) parts.push(`${nbIgnores} ignorée${nbIgnores > 1 ? 's' : ''}`);
  parts.push(`${manquants.length} en attente`);
  const aucunBatiment = nbBatiments === 0;
  return { peutValider: !aucunBatiment && manquants.length === 0, aucunBatiment, nbBatiments, nbCouverts, nbEmprises, nbEmprisesIgn, nbEmprisesTrace, nbIgnores, manquants, libelle: parts.join(' · ') };
}
