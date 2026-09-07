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
import { estValidationAcquise } from './rattachementGroupes'; // ③ COMPLÉMENT — SOURCE UNIQUE du « franchi le process » (altitudes + emprises validées) pour l'en-tête

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

// ── SOURCE UNIQUE DE VÉRITÉ de l'état d'emprise/projection d'UN bâtiment (dérivée de la BASE, consommée par TOUS les affichages :
//    capsule du cartouche, pastille du sélecteur, bandeau, en-tête). Aucun affichage ne recalcule l'état dans son coin. ──────────────
//    🔴 DEUX faits DISTINCTS, jamais confondus : `aEmprise` (une emprise reconstituée existe pour ce bâtiment) et `projectionValidee`
//    (la projection du DOSSIER est validée — permis_projection ; il n'existe pas de validation par bâtiment). « enregistrée » ≠ « validée ».
export type StatutEmpriseBatiment = 'validee' | 'a_valider' | 'ignoree' | 'a_tracer';
/** PUR — statut UNIQUE d'un bâtiment. Ordre : ignoré explicite (sans emprise) = fait délibéré, prime même sur un dossier validé ;
 *  sinon projection du DOSSIER validée = VALIDÉE (la validation couvre tout le permis) ; sinon une emprise enregistrée = À VALIDER ;
 *  sinon rien = À TRACER. Une emprise PRIME un « ignoré » (comme statutBatiment). Un dossier validé n'a par construction aucun « à tracer ». */
export function statutEmpriseBatiment(aEmprise: boolean, ignore: boolean, empriseValidee: boolean): StatutEmpriseBatiment {
  if (ignore && !aEmprise) return 'ignoree';
  if (empriseValidee) return 'validee'; // 🔴 validation PAR BÂTIMENT (emprise_validee_*), plus au niveau permis
  if (aEmprise) return 'a_valider';
  return 'a_tracer';
}
/**
 * ① COMPLÉMENT (chaîne de boutons par bâtiment) — l'ÉTAPE courante (UN SEUL bouton visible), DÉRIVÉE de la SOURCE UNIQUE
 * `statutEmpriseBatiment`. Un tracé actif (contour en cours) prime : c'est l'action immédiate → 'enregistrer'. Sinon, selon le statut
 * ENREGISTRÉ : 'validee' → 'modifier' (reprendre une emprise déjà validée, ce qui fera retomber sa validation) ; 'a_valider' → 'valider' ;
 * 'a_tracer'/'ignoree' → null (rien à enchaîner : on trace avec les outils, ou la projection est explicitement ignorée). PUR.
 */
export function etapeChaineEmprise(statut: StatutEmpriseBatiment, traceActive: boolean): 'enregistrer' | 'valider' | 'modifier' | null {
  if (traceActive) return 'enregistrer';
  if (statut === 'validee') return 'modifier';
  if (statut === 'a_valider') return 'valider';
  return null;
}

/**
 * ③ COMPLÉMENT — ÉTAT de l'EN-TÊTE « Bâtiments et projection » : VERT « Projection(s) validée(s) » quand TOUS les bâtiments ont
 * altitude de sommet validée ET emprise validée (SOURCE UNIQUE `estValidationAcquise`) ; sinon ROUGE disant CE QUI MANQUE. PUR.
 */
export function etatEnteteProjection(nbBatiments: number, nbSansAltitudeValidee: number, nbSansEmpriseValidee: number): { ton: 'vert' | 'rouge'; texte: string } {
  if (nbBatiments === 0) return { ton: 'rouge', texte: 'projection non validée (aucun bâtiment déclaré)' };
  if (estValidationAcquise(nbBatiments, nbSansAltitudeValidee, nbSansEmpriseValidee)) {
    return { ton: 'vert', texte: nbBatiments > 1 ? 'Projections validées' : 'Projection validée' };
  }
  const manque: string[] = [];
  if (nbSansAltitudeValidee > 0) manque.push(`${nbSansAltitudeValidee} altitude${nbSansAltitudeValidee > 1 ? 's' : ''} de sommet`);
  if (nbSansEmpriseValidee > 0) manque.push(`${nbSansEmpriseValidee} emprise${nbSansEmpriseValidee > 1 ? 's' : ''}`);
  return { ton: 'rouge', texte: `projection non validée — à valider : ${manque.join(' et ')}` };
}

/** VOCABULAIRE UNIQUE (court) par état — employé à l'identique par la pastille du sélecteur. « bâtiment »/« polygone » ; jamais « corps ». */
export const MOT_STATUT_EMPRISE: Record<StatutEmpriseBatiment, string> = {
  validee: '✓ emprise validée',
  a_valider: '◐ emprise à valider',
  ignoree: '⚠ projection ignorée',
  a_tracer: '… emprise à tracer',
};

/** Parties « couverture » du résumé (bâtiments · emprises[origines] · ignorées), SANS la queue « en attente / à valider ». PUR, partagé. */
function partiesCouverture(nbBatiments: number, nbEmprises: number, nbEmprisesIgn: number, nbEmprisesTrace: number, nbIgnores: number): string[] {
  const parts = [`${nbBatiments} bâtiment${nbBatiments > 1 ? 's' : ''}`];
  if (nbEmprises > 0) {
    const org: string[] = [];
    if (nbEmprisesIgn > 0) org.push(`${nbEmprisesIgn} issue${nbEmprisesIgn > 1 ? 's' : ''} de l’IGN`);
    if (nbEmprisesTrace > 0) org.push(`${nbEmprisesTrace} tracée${nbEmprisesTrace > 1 ? 's' : ''} à la main`);
    parts.push(`${nbEmprises} emprise${nbEmprises > 1 ? 's' : ''}${org.length ? ` (${org.join(', ')})` : ''}`);
  } else parts.push('0 emprise');
  if (nbIgnores > 0) parts.push(`${nbIgnores} ignorée${nbIgnores > 1 ? 's' : ''}`);
  return parts;
}

export type TonProjection = 'vert' | 'ambre' | 'rouge' | 'neutre';
/**
 * RÉSUMÉ AGRÉGÉ du bandeau, VALIDATION-CONSCIENT (source unique du bandeau). QUATRE états distincts, jamais fusionnés :
 *  · AUCUN bâtiment déclaré → NEUTRE « … · projection sans objet » (rien à projeter ⇒ ni validé, ni « en attente » ; état SANS OBJET,
 *    même 3ᵉ état neutre que la condition de sortie, cf. etatSortieRattachement) ;
 *  · projection VALIDÉE → VERT « … · projection validée » ;
 *  · tracé complet mais NON validée → AMBRE « … · à valider » (JAMAIS un ✓ vert « 0 en attente » : une validation reste à faire) ;
 *  · traçage incomplet → ROUGE « … · N en attente ».
 * `peutValider` (porte de validation, PROJ-3b) reste INCHANGÉ : il exige seulement que tout soit tracé/ignoré, pas que ce soit validé.
 */
export function resumeProjection(v: VerdictProjection, nbValides: number, nbAValider: number): { ton: TonProjection; valide: boolean; texte: string } {
  const parties = partiesCouverture(v.nbBatiments, v.nbEmprises, v.nbEmprisesIgn, v.nbEmprisesTrace, v.nbIgnores);
  // AUCUN bâtiment déclaré (PROJ-3b : peutValider=false) → SANS OBJET (neutre) : `manquants` est vide PAR VACUITÉ, jamais « validé ». Cette
  //   branche ne s'active QU'À 0 bâtiment ; le chemin nominal (toujours ≥ 1 bâtiment) est strictement inchangé (branches ci-dessous intactes).
  if (v.aucunBatiment) return { ton: 'neutre', valide: false, texte: [...parties, 'projection sans objet'].join(' · ') };
  // AVANCEMENT RÉEL (per-bâtiment) : traçage incomplet → ROUGE « K en attente » ; tout couvert mais des emprises à valider → AMBRE
  //   « M validés · K à valider » ; toutes validées (ou ignorées) → VERT « projection validée ». Le VERT n'apparaît que quand tout est validé.
  if (v.manquants.length > 0) return { ton: 'rouge', valide: false, texte: [...parties, `${v.manquants.length} en attente`].join(' · ') };
  if (nbAValider > 0) return { ton: 'ambre', valide: false, texte: [...parties, `${nbValides} validé${nbValides > 1 ? 's' : ''}`, `${nbAValider} à valider`].join(' · ') };
  return { ton: 'vert', valide: true, texte: [...parties, 'projection validée'].join(' · ') };
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
  // Résumé « couverture » (bâtiments · emprises · ignorées) FACTORISÉ (partagé avec resumeProjection) + queue de traçage INCHANGÉE.
  const parts = partiesCouverture(nbBatiments, nbEmprises, nbEmprisesIgn, nbEmprisesTrace, nbIgnores);
  parts.push(`${manquants.length} en attente`);
  const aucunBatiment = nbBatiments === 0;
  return { peutValider: !aucunBatiment && manquants.length === 0, aucunBatiment, nbBatiments, nbCouverts, nbEmprises, nbEmprisesIgn, nbEmprisesTrace, nbIgnores, manquants, libelle: parts.join(' · ') };
}
