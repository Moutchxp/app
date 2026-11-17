import { adresseSansNumero } from '../gestion/copropriete';
import type { MetaAdresse } from '../gestion/adresseSaisie';

/**
 * ══ 🔴🔴 L'ADRESSE D'UN BIEN, À L'ÉCRAN (Arno, 17/11/2026, « Adresses uniformisées », lot 3). MODULE PUR. ═══════════════════════════════════════
 * Décision d'Arno : « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse) passent sur ChampAdresseBan réutilisé
 * tel quel ; plus de Code postal / Commune tapés à la main ; adresse absente de la liste = saisie libre autorisée avec confirmation, marquée « hors
 * liste — à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. »
 * Ce module dit, pour une adresse saisie : ce que l'écran envoie au serveur (`metaAdresseBien`), le refus avant envoi, et la confirmation « sans numéro ».
 * Le serveur refait les mêmes contrôles (`controlerAdresseBien`). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 * 🔴 (lot 4, les apporteurs) la même saisie sert à l'adresse d'un apporteur, avec en plus « Adresse à l'étranger » (Q6 : pays obligatoire) — jamais pour un bien.
 */

/** L'adresse d'un bien telle que l'écran la tient : les trois champs, le choix dans la liste, la nature et les confirmations. */
export interface AdresseBienSaisie {
  adresse: string; codePostal: string; commune: string;
  /** l'adresse affichée vient d'un choix dans la liste */
  verifiee: boolean;
  /** 'hors_liste' : saisie libre confirmée ; 'etranger' : à l'étranger (apporteurs seulement) ; 'liste' ou null : la liste (null = d'avant, non requalifiée tant qu'on n'y touche pas) */
  nature: 'liste' | 'hors_liste' | 'etranger' | null;
  /** le pays d'une adresse à l'étranger */
  pays?: string;
  horsListeConfirme: boolean;
  sansNumeroConfirme: boolean;
}

/** Une adresse vide (un bien à créer, une annexe « Autre adresse » nouvelle). */
export const ADRESSE_BIEN_VIDE: AdresseBienSaisie = { adresse: '', codePostal: '', commune: '', verifiee: false, nature: null, horsListeConfirme: false, sansNumeroConfirme: false };

/** L'adresse d'un bien existant, telle que lue : réputée choisie (elle n'est pas revérifiée tant qu'on n'y touche pas). */
export const adresseBienLue = (a: { adresse?: string | null; codePostal?: string | null; commune?: string | null }, nature: 'liste' | 'hors_liste' | null = null): AdresseBienSaisie =>
  ({ adresse: a.adresse ?? '', codePostal: a.codePostal ?? '', commune: a.commune ?? '', verifiee: true, nature, horsListeConfirme: false, sansNumeroConfirme: false });

const propre = (x: string): string => x.trim().replace(/\s+/g, ' ');
const meme = (a: string, b: string): boolean => propre(a).toLocaleLowerCase('fr') === propre(b).toLocaleLowerCase('fr');

/** L'adresse a été touchée (par rapport à celle lue ; un bien à créer : dès qu'elle n'est pas vide). PUR. */
export function adresseBienTouchee(s: AdresseBienSaisie,
  lue: { adresse: string; codePostal: string; commune: string; nature?: 'liste' | 'hors_liste' | 'etranger' | null; pays?: string | null } | null): boolean {
  if (lue === null) return propre(s.adresse) !== '' || propre(s.codePostal) !== '' || propre(s.commune) !== '';
  return !meme(s.adresse, lue.adresse) || !meme(s.codePostal, lue.codePostal) || !meme(s.commune, lue.commune)
    || (s.nature === 'hors_liste') !== ((lue.nature ?? null) === 'hors_liste')
    || (s.nature === 'etranger') !== ((lue.nature ?? null) === 'etranger')
    || (s.nature === 'etranger' && !meme(s.pays ?? '', lue.pays ?? ''));
}

/** Ce que l'écran envoie avec l'adresse : sa nature et les deux confirmations. PUR. */
export const metaAdresseBien = (s: AdresseBienSaisie): MetaAdresse =>
  ({ nature: s.nature === 'hors_liste' || s.nature === 'etranger' ? s.nature : 'liste', pays: s.nature === 'etranger' ? propre(s.pays ?? '') : null,
    horsListeConfirme: s.horsListeConfirme, sansNumeroConfirme: s.sansNumeroConfirme });

export const MOTIF_ADRESSE_BIEN_A_CHOISIR = 'Choisissez l’adresse dans la liste proposée (ou « Adresse absente de la liste ? »).';

/** Le refus AVANT envoi d'une adresse touchée : tapée sans être choisie (hors « hors liste »), ou hors liste sans code postal ni commune. PUR. */
export function refusAdresseBienEcran(s: AdresseBienSaisie, touchee: boolean): string | null {
  if (!touchee) return null;
  if (s.nature === 'etranger') {
    if (propre(s.adresse) === '') return 'Saisissez l’adresse à l’étranger.';
    return propre(s.pays ?? '') === '' ? 'Indiquez le pays de cette adresse à l’étranger.' : null;
  }
  if (propre(s.adresse) === '') return null;
  if (s.nature === 'hors_liste') {
    if (!/^\d{5}$/.test(propre(s.codePostal)) || propre(s.commune) === '') return 'Une adresse hors liste demande un code postal à 5 chiffres et une commune.';
    return null;
  }
  return s.verifiee ? null : MOTIF_ADRESSE_BIEN_A_CHOISIR;
}

/** La fenêtre « Adresse sans numéro » est due : une adresse touchée, sans numéro, pas encore confirmée. PUR. */
export const sansNumeroAConfirmer = (s: AdresseBienSaisie, touchee: boolean): boolean =>
  touchee && s.nature !== 'etranger' && propre(s.adresse) !== '' && adresseSansNumero(propre(s.adresse)) && !s.sansNumeroConfirme;

/** L'adresse en une ligne, pour la fenêtre « sans numéro ». PUR. */
export const adresseBienEnLigne = (s: AdresseBienSaisie): string =>
  `${propre(s.adresse)}${propre(s.codePostal) !== '' || propre(s.commune) !== '' ? `, ${[propre(s.codePostal), propre(s.commune)].filter(Boolean).join(' ')}` : ''}`;
