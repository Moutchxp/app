import { caNetParMoisMode, caNetVente, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import { borneCumul, cumulA, listeADate, listeDesAnnees, moisADate, ventesDesAnnees } from '../transaction/periodeAnnees';
import { sommeDesMoisAffiches, totauxPeriode, unAnPlusTot, ventesPeriode, type MoisChoisi } from '../transaction/periodeMois';
import { caHtParMoisMode, sansN1Pour, TVA, variation, type DonneesSociete, type ModeMois } from '../transaction/modele';
import type { MontantC } from '../transaction/partAgence';
import { resolveurDe } from '../transaction/statutLigne';
import { sommeC, totauxDuChoix, type StatsMonEspace } from './statistiques';
import type { SourceGrapheAnnees, SourceGrapheMois } from '../transaction/sourceGraphe';

/**
 * ══ 🔴 MON ESPACE (Arno, 02/11/2026) — L'ACCUEIL AU FORMAT « LE MOIS » DU SUIVI CA : LES QUATRE TUILES (PUR) ══════════════════════════════════════
 * La rangée des mois (Mois | Période | Année, « Année » par défaut) choisit les mois ; ce module donne les chiffres des tuiles, deux sources :
 *   · « MON ESPACE » : mes chiffres, ceux de « Mes statistiques » (`totauxDuChoix` sur les statistiques du serveur, décision 1) — mêmes nombres,
 *     au centime ; le cumul : mes mois de janvier à la borne du Suivi CA (`borneCumul`) ;
 *   · MODE AGENCE : les expressions de « Le mois » du Suivi CA (mode « Vendu »), une à une, sur les données de la structure : CA = la somme des
 *     cartes (`resultatDesCartes`), N−1 et % = `totauxPeriode` (la somme affichée des mois en Période / Année), nombre = `totauxPeriode`, cumul =
 *     `caHtParMoisMode` cumulé à la borne, CA net cumulé = `caNetParMoisMode`. Aucun calcul refait : seulement les appels de l'écran.
 */
export type DecoupageAccueil = 'mois' | 'periode' | 'annee';
export interface ChoixAccueil { decoupage: DecoupageAccueil; annee: number; mois: number;
  /** En Période : les mois choisis de l'année ; en Année : ses 12 mois ; en Mois : ignoré. */
  moisPeriode: readonly number[] }
/** Un montant en euros (HT sans arrondi, TTC) — ce que les tuiles écrivent dans l'unité choisie. */
export interface Montant { ht: number; ttc: number }
export interface TuilesAccueil {
  ca: { valeur: Montant; n1: Montant | null; pct: number | null };
  nb: { valeur: number; n1: number | null };
  cumul: { valeur: Montant; n1: Montant | null; pct: number | null; fin: number; mot: string };
  /** Mode agence seulement : le CA net cumulé (la 4ᵉ tuile du Suivi CA en mode « Vendu »). */
  net?: { valeur: Montant; n1: Montant | null; pct: number | null };
}

const deC = (m: MontantC): Montant => ({ ht: m.htC / 100, ttc: m.ttcC / 100 });
const depuisHt = (ht: number): Montant => ({ ht, ttc: ht * TVA });
/** Les mois du choix : un mois, ceux de la période, les 12 de l'année (la Période des 12 mois de « Le mois »). PUR. */
export const moisDeLAccueil = (c: ChoixAccueil): number[] => (c.decoupage === 'mois' ? [c.mois] : c.decoupage === 'annee' ? Array.from({ length: 12 }, (_, i) => i + 1) : [...c.moisPeriode]);
const borne = (c: ChoixAccueil, jour: string) => borneCumul(c.decoupage, c.annee, c.mois, c.decoupage === 'periode' ? c.moisPeriode : null, jour);

/** « Mon espace » : les chiffres de « Mes statistiques » sur le même choix (Mois, Période, Année). PUR. */
export function tuilesPerso(s: StatsMonEspace, c: ChoixAccueil, jour: string): TuilesAccueil {
  const t = totauxDuChoix(s, { mode: c.decoupage, annee: c.annee, mois: c.mois, periode: c.decoupage === 'periode' ? c.moisPeriode : [c.mois] }, jour);
  const b = borne(c, jour);
  const cumulDe = (a: number): MontantC => sommeC((s.annees.find((x) => x.annee === a)?.ca ?? []).slice(0, b.fin));
  const [cu, cu1] = [cumulDe(c.annee), cumulDe(c.annee - 1)];
  // 🔴 Décision 13 — mon CA net cumulé, de janvier à la même borne (la carte « CA net cumulé » du mode agence) ; absent des statistiques : pas de carte.
  const netDe = (a: number): MontantC => sommeC((s.annees.find((x) => x.annee === a)?.net ?? []).slice(0, b.fin));
  const avecNet = s.annees.some((x) => x.net !== undefined);
  const [ne, ne1] = [netDe(c.annee), netDe(c.annee - 1)];
  return {
    ca: { valeur: deC(t.n.ca), n1: t.n1 === null ? null : deC(t.n1.ca), pct: t.n1 === null ? null : variation(t.n.ca.htC, t.n1.ca.htC) },
    nb: { valeur: t.n.nb, n1: t.n1?.nb ?? null },
    cumul: { valeur: deC(cu), n1: deC(cu1), pct: variation(cu.htC, cu1.htC), fin: b.fin, mot: b.mot },
    ...(avecNet ? { net: { valeur: deC(ne), n1: deC(ne1), pct: variation(ne.htC, ne1.htC) } } : {}),
  };
}

type DonneesAgence = Pick<DonneesSociete, 'societe' | 'ventes' | 'retrocessions'> & Partial<Pick<DonneesSociete, 'statutsNegociateurs'>>;
/** Mode agence : les tuiles de « Le mois » du Suivi CA (mode « Vendu »), sur la structure. PUR. */
export function tuilesAgence(d: DonneesAgence, c: ChoixAccueil, jour: string): TuilesAccueil {
  const enPeriode = c.decoupage !== 'mois';
  const ms: MoisChoisi[] = moisDeLAccueil(c).map((mois) => ({ annee: c.annee, mois }));
  const opts = { retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
  const T = totauxPeriode(d, ms, 'vendu', jour);
  const T1 = totauxPeriode(d, unAnPlusTot(ms), 'vendu', jour);
  const sansN1 = sansN1Pour(d.ventes, c.annee, 'vendu');
  const n1Affiche = enPeriode ? sommeDesMoisAffiches(unAnPlusTot(ms).map((m) => totauxPeriode(d, [m], 'vendu', jour).caHt)) : null;
  const rc = resultatDesCartes(ventesPeriode(d.ventes, ms), d.societe, opts).ca;
  const b = borne(c, jour);
  const cumulHt = (a: number): number => cumulA(cumuler(caHtParMoisMode(d.ventes, a, d.societe, 'vendu', jour)), b.fin);
  const [cu, cu1] = [cumulHt(c.annee), cumulHt(c.annee - 1)];
  const netDe = (a: number): MontantC => sommeC(caNetParMoisMode(d.ventes, a, d.societe, 'vendu', jour, opts).slice(0, b.fin));
  const [net, net1] = [netDe(c.annee), netDe(c.annee - 1)];
  return {
    ca: { valeur: deC(rc), n1: sansN1 ? null : n1Affiche === null ? depuisHt(T1.caHt) : n1Affiche, pct: sansN1 ? null : variation(T.caHt, T1.caHt) },
    nb: { valeur: T.nbVentes, n1: sansN1 ? null : T1.nbVentes },
    cumul: { valeur: depuisHt(cu), n1: sansN1 ? null : depuisHt(cu1), pct: sansN1 ? null : variation(cu, cu1), fin: b.fin, mot: b.mot },
    net: { valeur: deC(net), n1: sansN1 ? null : deC(net1), pct: sansN1 ? null : variation(net.htC, net1.htC) },
  };
}

/**
 * ══ L'ONGLET « ANNÉE(S) » : LES QUATRE TUILES ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * `sel` : les années montrées (Année : une ; Période : celles cochées ; Tout : toutes) ; `tout` : sans comparaison N−1 (null).
 *   · « Mon espace » : mes chiffres de « Mes statistiques » (une année = ses 12 mois + ses ventes « mois à confirmer », comme « L'année ») ; « à
 *     date » : les mois de janvier au mois du jour (une année passée : l'année entière), N−1 sur le même nombre de mois ;
 *   · mode agence : les expressions de « L'année » du Suivi CA (mode « Vendu ») : la somme des cartes de `ventesDesAnnees`, `listeDesAnnees` pour
 *     N−1, `listeADate` pour « à date », `caNetVente` pour le CA net. PUR.
 */
export interface TuilesAnnees {
  ca: { valeur: Montant; n1: Montant | null; pct: number | null };
  nb: { valeur: number; n1: number | null };
  aDate: { valeur: Montant; n1: Montant | null; pct: number | null };
  net?: { valeur: Montant; n1: Montant | null; pct: number | null };
}
const avec = (a: Montant | null, pct: number | null, tout: boolean, sansN1: boolean) => (tout || sansN1 ? { n1: null, pct: null } : { n1: a, pct });

export function tuilesAnneesPerso(s: StatsMonEspace, sel: readonly number[], tout: boolean, jour: string): TuilesAnnees {
  const an = (a: number) => s.annees.find((x) => x.annee === a);
  const annee = (a: number) => totauxDuChoix(s, { mode: 'annee', annee: a, mois: 1, periode: [1] }, jour).n;
  const somme = (as: readonly number[]) => as.map(annee).reduce((t, x) => ({ ca: sommeC([t.ca, x.ca]), nb: t.nb + x.nb }), { ca: { htC: 0, ttcC: 0 }, nb: 0 });
  /** L'année `a` sur `nb` mois (12 : avec ses « mois à confirmer », comme `listeADate`). */
  const aDateDe = (a: number, nb: number): MontantC => { const x = an(a); return x === undefined ? { htC: 0, ttcC: 0 } : sommeC([...x.ca.slice(0, nb), ...(nb >= 12 ? [x.aConfirmer] : [])]); };
  const n = somme(sel); const n1 = somme(sel.map((a) => a - 1));
  const d = sommeC(sel.map((a) => aDateDe(a, moisADate(a, jour)))); const d1 = sommeC(sel.map((a) => aDateDe(a - 1, moisADate(a, jour))));
  // 🔴 Décision 13 — mon CA net des années (12 mois + « mois à confirmer », comme le CA) ; absent des statistiques : pas de carte.
  const netAn = (a: number): MontantC => { const x = an(a); return x?.net === undefined ? { htC: 0, ttcC: 0 } : sommeC([...x.net, x.netAConfirmer ?? { htC: 0, ttcC: 0 }]); };
  const avecNet = s.annees.some((x) => x.net !== undefined);
  const [na, na1] = [sommeC(sel.map(netAn)), sommeC(sel.map((a) => netAn(a - 1)))];
  return {
    ca: { valeur: deC(n.ca), ...avec(deC(n1.ca), variation(n.ca.htC, n1.ca.htC), tout, false) },
    nb: { valeur: n.nb, n1: tout ? null : n1.nb },
    aDate: { valeur: deC(d), ...avec(deC(d1), variation(d.htC, d1.htC), tout, false) },
    ...(avecNet ? { net: { valeur: deC(na), ...avec(deC(na1), variation(na.htC, na1.htC), tout, false) } } : {}),
  };
}

export function tuilesAnneesAgence(dx: DonneesAgence, sel: readonly number[], tout: boolean, jour: string): TuilesAnnees {
  const opts = { retros: dx.retrocessions, statutDuLibelle: resolveurDe(dx.statutsNegociateurs) };
  const cartes = (vs: Parameters<typeof resultatDesCartes>[0]) => resultatDesCartes(vs, dx.societe, opts).ca;
  const sel1 = sel.map((a) => a - 1);
  const sansN1 = sel.some((a) => sansN1Pour(dx.ventes, a, 'vendu'));
  const liste = ventesDesAnnees(dx.ventes, sel);
  const liste1 = listeDesAnnees(dx.ventes, sel1, 'vendu', jour);
  const [rc, r1] = [cartes(liste), cartes(liste1)];
  const [rd, rd1] = [cartes(sel.flatMap((a) => listeADate(dx.ventes, a, moisADate(a, jour), 'vendu', jour))), cartes(sel.flatMap((a) => listeADate(dx.ventes, a - 1, moisADate(a, jour), 'vendu', jour)))];
  const net = (vs: typeof liste): MontantC => sommeC(vs.map((v) => caNetVente(v, dx.societe, opts)));
  const [na, na1] = [net(liste), net(ventesDesAnnees(dx.ventes, sel1))];
  return {
    ca: { valeur: deC(rc), ...avec(deC(r1), variation(rc.htC, r1.htC), tout, sansN1) },
    nb: { valeur: liste.length, n1: tout || sansN1 ? null : liste1.length },
    aDate: { valeur: deC(rd), ...avec(deC(rd1), variation(rd.htC, rd1.htC), tout, sansN1) },
    net: { valeur: deC(na), ...avec(deC(na1), variation(na.htC, na1.htC), tout, sansN1) },
  };
}

/**
 * ══ LE GRAPHIQUE DU SUIVI CA SUR MES CHIFFRES (« Mon espace ») ══════════════════════════════════════════════════════════════════════════════════════
 * Les graphiques de « Le mois » / « L'année » (`GrapheMois`, `GrapheAnnees`), en « Vendu + compromis » comme la page du Suivi CA, avec MES chiffres :
 * le vendu = « Mes statistiques » (mon CA, décision 1), les compromis = mes compromis en cours placés par la règle du Suivi CA (ma part, décision 6).
 * Aucun montant d'un autre collaborateur : le serveur ne calcule que mon CA. « CA net » (décision 13) : mon CA net (`monCaNet`), de même. PUR.
 */
const RIEN_C: MontantC = { htC: 0, ttcC: 0 };
/** Décision 13 — la définition de MON CA net, dite sous le graphique. */
export const NOTE_NET_PERSO = 'Mon CA net : mon CA moins ma commission déduite et les rétrocessions de mon côté (la colonne « CA net » de ma ligne dans l’Espace par négociateur du Suivi CA).';
const anDe = (s: StatsMonEspace, a: number) => s.annees.find((x) => x.annee === a);
const douze = <T>(f: (i: number) => T): T[] => Array.from({ length: 12 }, (_, i) => f(i));
/** Pas d'année précédente à comparer pour l'année `a` : ni vente ni compromis l'année d'avant (la règle `sansN1Pour` en « Vendu + compromis »). */
const sansN1Perso = (s: StatsMonEspace, a: number): boolean => {
  const x = anDe(s, a - 1);
  return x === undefined || (x.nb.every((n) => n === 0) && x.aConfirmerNb === 0 && (x.nbComp ?? []).every((n) => n === 0));
};
export function sourceMoisPerso(s: StatsMonEspace, annee: number): SourceGrapheMois {
  const ht = (a: number, avecComp: boolean): number[] => { const x = anDe(s, a); return douze((i) => (x === undefined ? 0 : (x.ca[i].htC + (avecComp ? (x.caComp?.[i] ?? RIEN_C).htC : 0)) / 100)); };
  const nb = (a: number, avecComp: boolean): number[] => { const x = anDe(s, a); return douze((i) => (x === undefined ? 0 : x.nb[i] + (avecComp ? x.nbComp?.[i] ?? 0 : 0))); };
  // « CA net » : mon CA net de chaque mois ; « Vendu + compromis » : + celui de mes compromis en cours (le même placement)
  const net = (a: number, mode: ModeMois): MontantC[] => { const x = anDe(s, a); return douze((i) => (x === undefined ? RIEN_C
    : sommeC([x.net?.[i] ?? RIEN_C, ...(mode === 'tous' ? [x.netComp?.[i] ?? RIEN_C] : [])]))); };
  return { ca: (a) => ht(a, true), caVendu: (a) => ht(a, false), nb: (a) => nb(a, true), nbVendu: (a) => nb(a, false), sansN1: sansN1Perso(s, annee), nbReportes: s.reportes ?? 0, net, noteNet: NOTE_NET_PERSO };
}
export function sourceAnneesPerso(s: StatsMonEspace): SourceGrapheAnnees {
  return {
    valeur: (a, mode, mesure, unite) => {
      const x = anDe(s, a);
      if (x === undefined) return 0;
      const comp = mode === 'tous';
      if (mesure === 'net') { const n = sommeC([...(x.net ?? []), x.netAConfirmer ?? RIEN_C, ...(comp ? x.netComp ?? [] : [])]); return (unite === 'ht' ? n.htC : n.ttcC) / 100; }
      if (mesure === 'nombre') return x.nb.reduce((t, n) => t + n, 0) + x.aConfirmerNb + (comp ? (x.nbComp ?? []).reduce((t, n) => t + n, 0) : 0);
      const m = sommeC([...x.ca, x.aConfirmer, ...(comp ? x.caComp ?? [] : [])]);
      return (unite === 'ht' ? m.htC : m.ttcC) / 100;
    },
    nbReportes: s.reportes ?? 0,
    avecNet: true,
    noteNet: NOTE_NET_PERSO,
  };
}
