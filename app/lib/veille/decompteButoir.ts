/**
 * LOT-8 (B) — DÉCOMPTE EN JOURS avant le butoir qui FAIT FOI pour la saisine CADA, PUR. Deux butoirs possibles :
 *  - MARQUEUR PARTIEL ACTIF → butoir PROLONGÉ (CASC-2 / LOT-1 : `dateButoirPartiel` = partiel_le + 1 mois + 4 j). C'est LUI qui pilote
 *    réellement l'éligibilité de la saisine quand il existe ; afficher l'échéance ordinaire serait FAUX. Il court même si les documents
 *    sont déjà obtenus (le délai CADA du complément continue) → on ne vide JAMAIS le décompte dans ce cas (contrairement à `etatEcheance`).
 *  - SINON → butoir ORDINAIRE (`echeanceDe(envoyeLe)` = envoi + 1 mois). On RÉUTILISE `etatEcheance` (déjà calculé) pour ne pas
 *    réimplémenter le décompte : on remonte SON `joursRestants` au lieu de le recalculer.
 */
import { etatEcheance, echeanceDe, type EntreeEcheance, type ReglagesEcheance } from './echeance';
import { dateButoirPartiel } from '../permis/dossierPartiel';

const MS_JOUR = 86_400_000;

/** Marqueur « dossier partiel » vu par le décompte : actif + date de 1re réclamation + délai CADA prolongé (config). */
export interface PartielDecompte { actif: boolean; le: string | null; delaiMois: number; delaiJours: number }

/** `compte` = décompte lisible (jours + date butoir) ; les autres états DISENT pourquoi il n'y a pas de nombre (jamais un vide muet). */
export interface Decompte {
  jours: number | null;        // jours restants avant le butoir (négatif = dépassé) ; null hors 'compte'
  butoir: string | null;       // ISO du butoir qui fait foi (pour l'infobulle) ; null si N/A
  source: 'partiel' | 'ordinaire';
  etat: 'compte' | 'obtenu' | 'indetermine' | 'non_delivree' | 'non_envoyee';
}

/**
 * Décompte avant le butoir CADA qui fait foi. PUR. Priorité : non-délivrée > PARTIEL ACTIF (butoir prolongé, jamais vidé) > pas
 * encore envoyée > ordinaire (via `etatEcheance` : obtenu / indéterminé / décompte).
 */
export function decompteButoirCada(entree: EntreeEcheance, maintenant: Date, reglages: ReglagesEcheance, partiel: PartielDecompte): Decompte {
  if (entree.statutAcheminement === 'rebond' || entree.statutAcheminement === 'echec') {
    return { jours: null, butoir: null, source: 'ordinaire', etat: 'non_delivree' };
  }
  // PARTIEL ACTIF — le butoir PROLONGÉ fait foi et court TOUJOURS (même documents obtenus : le délai CADA du complément continue).
  if (partiel.actif && partiel.le) {
    const b = dateButoirPartiel(new Date(partiel.le), partiel.delaiMois, partiel.delaiJours);
    return { jours: Math.ceil((b.getTime() - maintenant.getTime()) / MS_JOUR), butoir: b.toISOString(), source: 'partiel', etat: 'compte' };
  }
  if (entree.envoyeLe === null) return { jours: null, butoir: null, source: 'ordinaire', etat: 'non_envoyee' };
  // ORDINAIRE — on RÉUTILISE etatEcheance (B4 : ne pas recalculer le décompte ailleurs).
  const r = etatEcheance(entree, maintenant, reglages);
  const butoir = echeanceDe(entree.envoyeLe).toISOString();
  if (r.etat === 'repondue') return { jours: null, butoir, source: 'ordinaire', etat: 'obtenu' };      // tous documents obtenus, non partiel → plus de délai
  if (r.etat === 'indeterminee') return { jours: null, butoir, source: 'ordinaire', etat: 'indetermine' }; // relève trop ancienne
  return { jours: r.joursRestants, butoir, source: 'ordinaire', etat: 'compte' };
}

/** Ordinal court de relance de complément : 1 → « 1re », 2 → « 2e », n → « ne ». PUR (colonne Statut, cascade PARTIELLE, LOT-8 C). */
export function ordinalRelance(rang: number): string {
  return rang === 1 ? '1re' : `${rang}e`;
}
