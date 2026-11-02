import { pourLaVue } from '../transaction/compromisEnCours';
import { moisSoulignes } from '../transaction/periodeAnnees';
import { compromisDuMode, compromisReportes, parApporteur, type LigneApporteur, type Retrocession, type Vente } from '../transaction/modele';
import type { MontantC } from '../transaction/partAgence';
import { estAMoi, monCa, type Moi } from './mesAffaires';

/**
 * ══ 🔴 MON ESPACE, LOT 8 (Arno, 02/11/2026) — « MES STATISTIQUES » (PUR) ═════════════════════════════════════════════════════════════════════════
 * Les chiffres d'un collaborateur, sur SES ventes (le filtre du lot 3) et SON CA (décision 1 : les honoraires des côtés qu'il porte — `monCa`, la
 * fonction de l'« Espace par négociateur », jamais un calcul recopié ; la commission d'un autre collègue n'y entre jamais) :
 *   · par année, mois par mois (CA et nombre de ventes actées) ; une vente sans mois (« mois à confirmer ») compte dans son année, dans aucun mois,
 *     comme dans le Suivi CA ;
 *   · le choix (Mois, Période, Année, Tout) et sa comparaison N−1 sur la MÊME période ; les mois soulignés : la règle du Suivi CA (`moisSoulignes`) ;
 *   · par apporteur : `parApporteur`, la fonction du Suivi CA, sur les rétrocessions de la période liées à mes ventes ;
 *   · le prévisionnel : mon CA sur mes compromis en cours (les compteurs du lot 3), jamais mélangé au CA acté ; projection = acté + prévisionnel.
 * Les ventes notées chez les deux sociétés et non attribuées sont écartées comme partout (`pourLaVue`).
 */
const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
export const sommeC = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);

export interface StatsAnnee { annee: number; ca: MontantC[]; nb: number[]; aConfirmer: MontantC; aConfirmerNb: number;
  /** Le graphique « vendu + compromis » de l'accueil : MES compromis en cours placés par la règle du Suivi CA (`compromisDuMode`, « Vendu +
   *  compromis ») — mon CA (ma part, décision 6) et leur nombre, chaque mois. Absents : aucun (le mode agence a son propre graphique). */
  caComp?: MontantC[]; nbComp?: number[] }
export interface StatsMonEspace { annees: StatsAnnee[];
  /** Mes compromis en cours non datés de l'année, comptés au mois en cours (la mention du graphique). */
  reportes?: number }

/** Mes ventes ACTÉES (comptées comme partout). PUR. */
export const mesVentesActees = (ventes: readonly Vente[], moi: Moi): Vente[] =>
  ventes.filter((v) => v.statut === 'vendue' && pourLaVue(v, null) && estAMoi(v, moi));

/** Mes chiffres par année (l'année en cours et la précédente toujours présentes), mois par mois. PUR. */
export function statistiquesMonEspace(ventes: readonly Vente[], moi: Moi, aujourdhui: string): StatsMonEspace {
  const actees = mesVentesActees(ventes, moi);
  const an = Number(aujourdhui.slice(0, 4));
  const annees = [...new Set([an, an - 1, ...actees.map((v) => v.annee)])].sort((a, b) => a - b);
  const mesComp = ventes.filter((v) => v.statut === 'compromis' && pourLaVue(v, null) && estAMoi(v, moi));
  const comp = (a: number, m: number) => compromisDuMode(mesComp, a, m, 'tous', aujourdhui);
  return { annees: annees.map((a) => {
    const de = actees.filter((v) => v.annee === a);
    const duMois = (m: number | null) => de.filter((v) => v.mois === m);
    return { annee: a, ca: Array.from({ length: 12 }, (_, i) => monCa(duMois(i + 1), moi)), nb: Array.from({ length: 12 }, (_, i) => duMois(i + 1).length),
      aConfirmer: monCa(duMois(null), moi), aConfirmerNb: duMois(null).length,
      caComp: Array.from({ length: 12 }, (_, i) => monCa(comp(a, i + 1), moi)), nbComp: Array.from({ length: 12 }, (_, i) => comp(a, i + 1).length) };
  }), reportes: compromisReportes(compromisDuMode(mesComp, an, null, 'tous', aujourdhui), aujourdhui).length };
}

export type ModeStats = 'mois' | 'periode' | 'annee' | 'tout';
export interface ChoixStats { mode: ModeStats; annee: number; mois: number; periode: readonly number[] }

/** Les mois du choix, dans l'année (la règle du Suivi CA : `moisSoulignes`) ; « Tout » : les douze. PUR. */
export const moisDuChoix = (c: ChoixStats, jour: string): number[] =>
  (c.mode === 'tout' ? Array.from({ length: 12 }, (_, i) => i + 1) : moisSoulignes(c.mode, c.annee, c.mois, c.periode, jour));

/** Mon CA et mon nombre de ventes sur le choix ; N−1 : les MÊMES mois de l'année précédente (null : « Tout », sans comparaison). PUR. */
export function totauxDuChoix(s: StatsMonEspace, c: ChoixStats, jour: string): { n: { ca: MontantC; nb: number }; n1: { ca: MontantC; nb: number } | null } {
  const annee = (a: number) => s.annees.find((x) => x.annee === a);
  const sur = (a: number, mois: readonly number[], avecAConfirmer: boolean): { ca: MontantC; nb: number } => {
    const x = annee(a);
    if (x === undefined) return { ca: RIEN, nb: 0 };
    return { ca: plus(sommeC(mois.map((m) => x.ca[m - 1])), avecAConfirmer ? x.aConfirmer : RIEN), nb: mois.reduce((t, m) => t + x.nb[m - 1], 0) + (avecAConfirmer ? x.aConfirmerNb : 0) };
  };
  if (c.mode === 'tout') {
    return { n: s.annees.map((x) => sur(x.annee, moisDuChoix(c, jour), true)).reduce((t, y) => ({ ca: plus(t.ca, y.ca), nb: t.nb + y.nb }), { ca: RIEN, nb: 0 }), n1: null };
  }
  const mois = moisDuChoix(c, jour);
  // L'année : la vente « mois à confirmer » compte dans son année (comme le Suivi CA) ; un mois ou une période : dans aucun mois.
  const avec = c.mode === 'annee';
  return { n: sur(c.annee, mois, avec), n1: sur(c.annee - 1, mois, avec) };
}

/** La variation N / N−1 (fraction) ; null : rien à comparer (N−1 nul). PUR. */
export const variation = (n: number, n1: number): number | null => (n1 === 0 ? null : (n - n1) / n1);

/** Mes apporteurs sur le choix : `parApporteur` (Suivi CA), sur les rétrocessions de la période liées à mes ventes actées. PUR. */
export function mesApporteurs(retros: readonly Retrocession[], ventes: readonly Vente[], c: ChoixStats, jour: string): LigneApporteur[] {
  const mois = moisDuChoix(c, jour);
  const dansLeChoix = (annee: number, m: number | null): boolean => (c.mode === 'tout' ? true : annee === c.annee && (m === null ? c.mode === 'annee' : mois.includes(m)));
  const actees = ventes.filter((v) => v.statut === 'vendue' && dansLeChoix(v.annee, v.mois));
  const ids = new Set(actees.map((v) => v.id));
  return parApporteur(retros.filter((r) => (r.venteId !== null && ids.has(r.venteId)) || (r.venteId === null && dansLeChoix(r.annee, r.mois))), actees);
}
