/**
 * ══ 🔴🔴 LOT DOUBLON-RENVOI-ADHOC, POINT B (Arno, 10/11/2026) — UNE LIGNE IMPORTÉE EXISTE DÉJÀ POUR CETTE LOCATION ══════════════════════════
 *
 * Arno : « À la création d'un locataire, s'il existe déjà une ligne de suivi importée sans bail pour le même bien (ou le même nom de
 * locataire) proche de la date d'entrée, l'écran PROPOSE de la relier au nouveau bail (“Une ligne importée existe déjà pour ce bien en
 * [mois] : la relier à ce bail ?” Oui / Non, créer une nouvelle ligne). Jamais de seconde ligne créée en silence ; le choix est tracé au
 * journal. »
 *
 * Le cas qui l'a décidé : PIEULHET — la ligne 847 (fichier de suivi d'octobre, sans bail) et la ligne 854 (saisie à la création du
 * locataire, le 06/11) : la même location comptée deux fois. MODULE PUR (lu par l'écran et par le serveur).
 */
import { moisEnLettres } from '../moisCompte';

/** « Proche de la date d'entrée » : à moins de ce nombre de jours (un trimestre, de part et d'autre). */
export const JOURS_PROXIMITE_LIGNE_IMPORTEE = 92;

/** Une ligne importée sans bail, candidate au rapprochement. */
export interface LigneImporteeProposee {
  id: number; dateSignature: string; libelleLocataire: string; libelleProprietaire: string; caHt: number; memeBien: boolean;
}

/** Le choix porté par la saisie : relier telle ligne importée, ou créer une nouvelle ligne (en connaissance de cause). */
export type ChoixLigneImportee = { relier: number } | 'nouvelle';

export function lireChoixLigneImportee(brut: unknown): ChoixLigneImportee | null {
  const c = (brut ?? {}) as Record<string, unknown>;
  const v = c.ligneImportee;
  if (v === 'nouvelle') return 'nouvelle';
  if (typeof v === 'object' && v !== null) {
    const id = Number((v as Record<string, unknown>).relier);
    if (Number.isSafeInteger(id) && id > 0) return { relier: id };
  }
  return null;
}

/** La question de l'écran, mot pour mot celle d'Arno (le bien, ou le locataire quand la ligne n'est rattachée à aucun bien). */
export function questionLigneImportee(l: LigneImporteeProposee): string {
  return `Une ligne importée existe déjà pour ${l.memeBien ? 'ce bien' : `ce locataire (${l.libelleLocataire})`} en ${moisEnLettres(l.dateSignature)} : la relier à ce bail ?`;
}

/** Ce que « Oui » fait, dit sous la question. */
export const PRECISION_RELIER = 'Oui : la ligne importée est reliée au bail, avec sa date et ses montants ; aucune seconde ligne n’est créée.';
export const LIBELLE_RELIER = 'Oui, la relier à ce bail';
export const LIBELLE_NOUVELLE = 'Non, créer une nouvelle ligne';

/** Le motif du refus quand la saisie ne dit pas encore son choix (l'écran pose alors la question). */
export function motifLigneImportee(l: readonly LigneImporteeProposee[]): string {
  const p = l[0];
  return p === undefined ? '' : `${questionLigneImportee(p)} Rien n’a été enregistré pour le suivi : choisissez de la relier ou de créer une nouvelle ligne.`;
}
