import type { GestionMois } from './modele';
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

export interface MoisGestionVu { annee: number; mois: number; saisi: boolean;
  /** Centimes HT. */
  honorairesC: number; adhocC: number; salariesC: number; netC: number; lots: number | null; ligne: GestionMois | null }
const c = (x: number | null | undefined): number => (x == null ? 0 : Math.round(x * 100));

/** Le mois tel que l'écran le compte. PUR. */
export function moisGestion(gestion: readonly GestionMois[], annee: number, mois: number): MoisGestionVu {
  const g = gestion.find((x) => x.annee === annee && x.mois === mois) ?? null;
  const [h, a, s] = [c(g?.honorairesHt), c(g?.adhocHt), c(g?.salarieHt)];
  return { annee, mois, saisi: g !== null, honorairesC: h, adhocC: a, salariesC: s, netC: h - a - s, lots: g?.nbLots ?? null, ligne: g };
}

export interface TotauxGestion { honorairesC: number; adhocC: number; salariesC: number; netC: number;
  /** Les lots : ceux du mois (un seul mois), sinon la moyenne des mois qui en ont ; null : aucun. */
  lots: number | null; nbMois: number; nbSaisis: number }
/** Les totaux des mois choisis (la somme de leurs mois, au centime). PUR. */
export function totauxGestion(gestion: readonly GestionMois[], ms: readonly MoisChoisi[]): TotauxGestion {
  const vus = ms.map((m) => moisGestion(gestion, m.annee, m.mois));
  const avecLots = vus.filter((v) => v.lots !== null).map((v) => v.lots as number);
  const somme = (k: 'honorairesC' | 'adhocC' | 'salariesC' | 'netC'): number => vus.reduce((t, v) => t + v[k], 0);
  return { honorairesC: somme('honorairesC'), adhocC: somme('adhocC'), salariesC: somme('salariesC'), netC: somme('netC'),
    lots: avecLots.length === 0 ? null : avecLots.reduce((t, x) => t + x, 0) / avecLots.length, nbMois: vus.length, nbSaisis: vus.filter((v) => v.saisi).length };
}

/** La valeur d'une mesure (en euros HT, ou le nombre de lots ; un mois sans lots : 0). PUR. */
export function valeurGestion(t: Pick<TotauxGestion, 'honorairesC' | 'adhocC' | 'salariesC' | 'netC' | 'lots'>, m: MesureGestion): number {
  return m === 'lots' ? t.lots ?? 0 : (m === 'honoraires' ? t.honorairesC : m === 'adhoc' ? t.adhocC : m === 'salaries' ? t.salariesC : t.netC) / 100;
}

/** Les années de la gestion (et l'année en cours), croissantes. PUR. */
export const anneesGestion = (gestion: readonly GestionMois[], jour: string): number[] =>
  [...new Set([Number(jour.slice(0, 4)), ...gestion.map((g) => g.annee)])].sort((a, b) => a - b);
