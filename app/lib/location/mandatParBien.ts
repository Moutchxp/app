import { normaliserMandat } from '../transaction/mandat';
import { LIBELLE_MANDAT, type SorteMandat } from './mandatBien';

/**
 * ══ 🔴🔴 LE N° DE MANDAT PORTÉ PAR CHAQUE BIEN — LA RÈGLE DU N° PARTAGÉ (Arno, 18/11/2026, « Mandat par bien », migration 492). PUR. ═══════════════
 *
 * Les décisions d'Arno : « Un même n° peut couvrir plusieurs biens UNIQUEMENT s'ils appartiennent au même propriétaire : dans ce cas, fenêtre « Le
 * mandat n° X est déjà utilisé pour <adresse du bien> de ce propriétaire. L'utiliser aussi pour ce bien ? » (Confirmer / Corriger) ; s'il est déjà
 * utilisé par un AUTRE propriétaire → refus avec message clair, sans exception. Même contrôle côté serveur (refus sans la confirmation, refus absolu
 * entre propriétaires différents). » ; « « Même propriétaire » = EXACTEMENT le même ensemble de propriétaires ; M. Martin seul ≠ M. et Mme Martin →
 * refus. » ; « Mandat de TRANSACTION […] : même règle que la gestion » ; « Bien sorti de gestion : son n° reste dans l'historique ; jamais réutilisable
 * par un autre propriétaire. » (tous les biens comptent, quel que soit leur statut) ; « Propriétaires d'un bien modifiés plus tard : on signale qu'un
 * n° partagé ne couvre plus le même propriétaire, sans bloquer. »
 * Choix technique : la comparaison se fait dans la même sorte de mandat (gestion avec gestion, transaction avec transaction), sur la forme
 * `normaliserMandat` (« MG 2026-041 » = « mg2026041 »).
 */

/** L'issue « à confirmer » rendue par le serveur : l'écran ouvre la fenêtre (Confirmer / Corriger) et renvoie avec `confirmeMandat`. */
export type IssueMandatAConfirmer = { etat: 'mandat_a_confirmer'; motif: string };

/** Un bien qui porte déjà le n° : son identifiant, son adresse lisible et l'ensemble de ses propriétaires (titulaire + copropriétaires actifs). */
export interface UsageMandat { lotId: number; adresse: string; proprietaires: readonly number[] }

export type DecisionMandat =
  | { etat: 'libre' }
  | { etat: 'meme_proprietaire_confirme' }
  | { etat: 'a_confirmer'; motif: string; adresses: string[] }
  | { etat: 'refus'; motif: string };

/** La clé d'un ensemble de propriétaires : sans doublon, trié. PUR. */
export const cleEnsemble = (ids: readonly number[]): string => [...new Set(ids)].sort((a, b) => a - b).join(',');

const liste = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);
const mot = (sorte: SorteMandat): string => (sorte === 'gestion' ? 'mandat' : 'mandat de transaction locative');

/** La phrase de la fenêtre (la même à l'écran et au refus du serveur). PUR. */
export const phraseAConfirmer = (sorte: SorteMandat, numero: string, adresses: readonly string[]): string =>
  `Le ${mot(sorte)} n° ${numero} est déjà utilisé pour ${liste(adresses)} de ce propriétaire. L’utiliser aussi pour ce bien ?`;

/**
 * LA DÉCISION pour un n° saisi sur un bien : `usages` = les AUTRES biens qui portent déjà ce n° (même sorte, même forme de comparaison).
 * Un seul bien d'un autre ensemble de propriétaires → refus absolu ; sinon, déjà utilisé par ce même ensemble → à confirmer (ou confirmé). PUR.
 */
export function decisionMandat(sorte: SorteMandat, numero: string, proprietaires: readonly number[], usages: readonly UsageMandat[], confirme: boolean): DecisionMandat {
  if (usages.length === 0) return { etat: 'libre' };
  const cle = cleEnsemble(proprietaires);
  const autres = usages.filter((u) => cleEnsemble(u.proprietaires) !== cle);
  if (autres.length > 0) {
    return { etat: 'refus', motif: `Le ${mot(sorte)} n° ${numero} est déjà utilisé pour ${liste([...new Set(autres.map((u) => u.adresse))])} d’un autre propriétaire : `
      + 'un même n° ne couvre que les biens d’un même propriétaire (exactement les mêmes propriétaires). Rien n’est enregistré.' };
  }
  if (confirme) return { etat: 'meme_proprietaire_confirme' };
  const adresses = [...new Set(usages.map((u) => u.adresse))];
  return { etat: 'a_confirmer', motif: phraseAConfirmer(sorte, numero, adresses), adresses };
}

/**
 * LE SIGNALEMENT (jamais bloquant) : le n° de ce bien est aussi celui de biens dont les propriétaires ne sont plus EXACTEMENT les siens (les
 * propriétaires ont changé depuis). Une phrase par sorte concernée ; rien si tout concorde. PUR.
 */
export function signalementPartage(sorte: SorteMandat, numero: string, proprietaires: readonly number[], usages: readonly UsageMandat[]): string | null {
  const cle = cleEnsemble(proprietaires);
  const ecarts = [...new Set(usages.filter((u) => cleEnsemble(u.proprietaires) !== cle).map((u) => u.adresse))];
  if (ecarts.length === 0) return null;
  return `${LIBELLE_MANDAT[sorte]} n° ${numero} : il est aussi celui de ${liste(ecarts)}, dont les propriétaires ne sont plus exactement les mêmes — `
    + 'ce n° partagé ne couvre plus le même propriétaire.';
}

/** La lecture d'un n° saisi : sa forme de comparaison, ou `null` (rien de lisible). PUR. */
export const formeMandat = (numero: string | null | undefined): string | null => normaliserMandat(numero ?? null);
