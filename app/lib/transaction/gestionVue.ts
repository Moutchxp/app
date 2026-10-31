import { TVA, type GestionMois } from './modele';
import type { MoisChoisi } from './periodeMois';

/**
 * ══ 🔴 LOT GE1 (Arno, 31/10/2026) — L'ÉCRAN « GESTION » : LES MONTANTS DU COMPTABLE, MOIS PAR MOIS (PUR) ═══════════════════════════════════════
 * Chaque mois : honoraires HT, ADHOC HT, salariés HT, le CA NET = honoraires − ADHOC − salariés (la règle de toujours, au centime : chaque montant
 * arrondi au centime, puis soustrait), et le nombre de lots. Un mois SANS SAISIE compte pour 0 (l'écran le dit « mois non saisi ») ; un montant
 * absent d'un mois saisi compte pour 0. Une période = la somme de ses mois ; les lots : ceux du mois, ou leur moyenne sur la période.
 * Montants HT seulement (le comptable envoie du HT).
 */
export type MesureGestion = 'honoraires' | 'adhoc' | 'salaries' | 'net' | 'lots';
export const MESURES_GESTION: readonly { cle: MesureGestion; mot: string }[] = [
  { cle: 'honoraires', mot: 'Honoraires' }, { cle: 'adhoc', mot: 'ADHOC' }, { cle: 'salaries', mot: 'Salariés' }, { cle: 'net', mot: 'CA net' }, { cle: 'lots', mot: 'Lots' },
];
export const estMesureGestion = (x: unknown): x is MesureGestion => MESURES_GESTION.some((m) => m.cle === x);

/**
 * 🔴 LOT GE2 (Arno) — « HT | TTC » : les saisies restent en HT ; le TTC se calcule à l'affichage, au centime (chaque montant du mois arrondi au centime).
 * Honoraires : HT × 1,20. ADHOC : HT × TAUX_TVA_ADHOC (hypothèse d'Arno : ADHOC facture avec TVA — une seule constante, facile à changer). Salariés :
 * sans TVA (le même montant en HT et en TTC). CA net TTC = honoraires TTC − ADHOC TTC − salariés.
 */
export const TAUX_TVA_HONORAIRES = TVA;
export const TAUX_TVA_ADHOC = TVA;
export type UniteGestion = 'ht' | 'ttc';
const enTtcC = (htC: number, taux: number): number => Math.round(htC * taux);

export interface MoisGestionVu { annee: number; mois: number; saisi: boolean;
  /** Centimes HT. */
  honorairesC: number; adhocC: number; salariesC: number; netC: number; lots: number | null; ligne: GestionMois | null;
  /** 🔴 LOT GE2 — les mêmes en TTC (centimes) ; les salariés : sans TVA. */
  honorairesTtcC: number; adhocTtcC: number; netTtcC: number }
const c = (x: number | null | undefined): number => (x == null ? 0 : Math.round(x * 100));

/** Le mois tel que l'écran le compte. PUR. */
export function moisGestion(gestion: readonly GestionMois[], annee: number, mois: number): MoisGestionVu {
  const g = gestion.find((x) => x.annee === annee && x.mois === mois) ?? null;
  const [h, a, s] = [c(g?.honorairesHt), c(g?.adhocHt), c(g?.salarieHt)];
  const [hT, aT] = [enTtcC(h, TAUX_TVA_HONORAIRES), enTtcC(a, TAUX_TVA_ADHOC)];
  return { annee, mois, saisi: g !== null, honorairesC: h, adhocC: a, salariesC: s, netC: h - a - s, lots: g?.nbLots ?? null, ligne: g,
    honorairesTtcC: hT, adhocTtcC: aT, netTtcC: hT - aT - s };
}

export interface TotauxGestion { honorairesC: number; adhocC: number; salariesC: number; netC: number; honorairesTtcC: number; adhocTtcC: number; netTtcC: number;
  /** Les lots : ceux du mois (un seul mois), sinon la moyenne des mois qui en ont ; null : aucun. */
  lots: number | null; nbMois: number; nbSaisis: number }
/** Les totaux des mois choisis (la somme de leurs mois, au centime). PUR. */
export function totauxGestion(gestion: readonly GestionMois[], ms: readonly MoisChoisi[]): TotauxGestion {
  const vus = ms.map((m) => moisGestion(gestion, m.annee, m.mois));
  const avecLots = vus.filter((v) => v.lots !== null).map((v) => v.lots as number);
  const somme = (k: 'honorairesC' | 'adhocC' | 'salariesC' | 'netC' | 'honorairesTtcC' | 'adhocTtcC' | 'netTtcC'): number => vus.reduce((t, v) => t + v[k], 0);
  return { honorairesC: somme('honorairesC'), adhocC: somme('adhocC'), salariesC: somme('salariesC'), netC: somme('netC'),
    honorairesTtcC: somme('honorairesTtcC'), adhocTtcC: somme('adhocTtcC'), netTtcC: somme('netTtcC'),
    lots: avecLots.length === 0 ? null : avecLots.reduce((t, x) => t + x, 0) / avecLots.length, nbMois: vus.length, nbSaisis: vus.filter((v) => v.saisi).length };
}

/** Le montant d'une mesure en centimes, dans l'unité (les salariés : sans TVA). PUR. */
export function centimesGestion(t: Omit<TotauxGestion, 'lots' | 'nbMois' | 'nbSaisis'>, m: Exclude<MesureGestion, 'lots'>, u: UniteGestion = 'ht'): number {
  if (m === 'salaries') return t.salariesC;
  if (u === 'ttc') return m === 'honoraires' ? t.honorairesTtcC : m === 'adhoc' ? t.adhocTtcC : t.netTtcC;
  return m === 'honoraires' ? t.honorairesC : m === 'adhoc' ? t.adhocC : t.netC;
}
/** La valeur d'une mesure (en euros, dans l'unité, ou le nombre de lots ; un mois sans lots : 0). PUR. */
export function valeurGestion(t: TotauxGestion, m: MesureGestion, u: UniteGestion = 'ht'): number {
  return m === 'lots' ? t.lots ?? 0 : centimesGestion(t, m, u) / 100;
}

/**
 * Une ligne du tableau dans l'unité (euros ; null : non saisi). Honoraires et ADHOC au taux de chacun, le salarié sans TVA ; le RESTE saisi (le
 * montant du comptable, tel quel en HT) reçoit en TTC la TVA des honoraires moins celle d'ADHOC — soit honoraires TTC − ADHOC TTC − salarié quand le
 * reste saisi suit la règle. PUR.
 */
export function ligneGestionEnUnite(g: Pick<GestionMois, 'honorairesHt' | 'adhocHt' | 'salarieHt' | 'resteHt'> | null, u: UniteGestion):
  { honoraires: number | null; adhoc: number | null; salarie: number | null; reste: number | null } {
  const c = (x: number | null | undefined): number | null => (x == null ? null : Math.round(x * 100));
  const [h, a, s, r] = [c(g?.honorairesHt), c(g?.adhocHt), c(g?.salarieHt), c(g?.resteHt)];
  const e = (x: number | null): number | null => (x === null ? null : x / 100);
  if (u === 'ht') return { honoraires: e(h), adhoc: e(a), salarie: e(s), reste: e(r) };
  const hT = h === null ? null : enTtcC(h, TAUX_TVA_HONORAIRES); const aT = a === null ? null : enTtcC(a, TAUX_TVA_ADHOC);
  const tvaH = h === null || hT === null ? 0 : hT - h; const tvaA = a === null || aT === null ? 0 : aT - a;
  return { honoraires: e(hT), adhoc: e(aT), salarie: e(s), reste: r === null ? null : e(r + tvaH - tvaA) };
}

/** Les années de la gestion (et l'année en cours), croissantes. PUR. */
export const anneesGestion = (gestion: readonly GestionMois[], jour: string): number[] =>
  [...new Set([Number(jour.slice(0, 4)), ...gestion.map((g) => g.annee)])].sort((a, b) => a - b);
