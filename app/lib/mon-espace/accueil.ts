import { caNetParMoisMode, caNetVente, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import { aConfirmerDesAnnees, borneCumul, cumulA, listeADate, listeDesAnnees, moisADate, ventesDesAnnees } from '../transaction/periodeAnnees';
import { pourLaVue } from '../transaction/compromisEnCours';
import { trierListe } from '../transaction/listeCartes';
import { sommeDesMoisAffiches, totauxPeriode, unAnPlusTot, ventesPeriode, type MoisChoisi } from '../transaction/periodeMois';
import { caHtParMoisMode, compromisDuMode, sansN1Pour, TVA, variation, type DonneesSociete, type ModeMois, type Vente } from '../transaction/modele';
import type { MontantC } from '../transaction/partAgence';
import { resolveurDe } from '../transaction/statutLigne';
import { moisDuChoix, sommeC, totauxDuChoix, type StatsMonEspace } from './statistiques';
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

/**
 * ══ 🔴 LA LISTE SOUS LE GRAPHIQUE (Arno, 02/11/2026) — LES AFFAIRES QUI FONT EXACTEMENT LES CARTES ET LE GRAPHIQUE ════════════════════════════════
 * Pour la sélection de la rangée (Mois, Période, Année ; dans « Année(s) » : une, plusieurs, toutes les années) et la vue :
 *   · « Vendus » : les ventes signées que la carte « CA » additionne — choisies par LA MÊME fonction que la carte (« Mon espace » : les mois de
 *     `moisDuChoix`, le « mois à confirmer » en Année, comme « Mes statistiques » ; mode agence : `ventesPeriode` / `ventesDesAnnees`, comme le Suivi
 *     CA) ; le montant de chacune = sa part dans la carte (ma part, décision 1, calculée par le serveur ; en agence, sa carte `resultatDesCartes`) :
 *     la somme = la carte « CA », le nombre = la carte « Ventes », au centime ;
 *   · « Compromis » : les compromis en cours que le graphique place au-dessus du vendu, sur les mêmes mois (`compromisDuMode` en « Vendu +
 *     compromis » ; en Année : les 12 mois) — ma part en « Mon espace ».
 * Tri : date décroissante (`trierListe`, la règle des listes du Suivi CA). PUR.
 */
export interface AffaireListee<V> { v: V; m: MontantC }
export interface AffairesPeriode<V> { vendus: AffaireListee<V>[]; compromis: AffaireListee<V>[]; totalVendus: MontantC; totalCompromis: MontantC }
/** Ce que la rangée a choisi : des années, et pour chacune ses mois du vendu, ses mois des compromis, et le « mois à confirmer » (oui / non). */
export interface PeriodeListe { annees: { annee: number; moisVendus: readonly number[]; moisCompromis: readonly number[]; aConfirmer: boolean }[] }
const DOUZE = Array.from({ length: 12 }, (_, i) => i + 1);
/** L'onglet « Mois » : en « Mon espace », les mois de « Mes statistiques » (`moisDuChoix`) ; en agence, ceux de « Le mois » (Année : les 12). */
export function periodeMois(c: ChoixAccueil, perso: boolean, jour: string): PeriodeListe {
  const moisV = perso ? moisDuChoix({ mode: c.decoupage, annee: c.annee, mois: c.mois, periode: c.decoupage === 'periode' ? c.moisPeriode : [c.mois] }, jour) : moisDeLAccueil(c);
  return { annees: [{ annee: c.annee, moisVendus: moisV, moisCompromis: c.decoupage === 'annee' ? DOUZE : moisDeLAccueil(c), aConfirmer: perso && c.decoupage === 'annee' }] };
}
/** L'onglet « Année(s) » : chaque année choisie, ses 12 mois (« Mon espace » : ceux de « Mes statistiques », Année) et son « mois à confirmer ». */
export function periodeAnnees(sel: readonly number[], perso: boolean, jour: string): PeriodeListe {
  return { annees: sel.map((a) => ({ annee: a, moisVendus: perso ? moisDuChoix({ mode: 'annee', annee: a, mois: 1, periode: [1] }, jour) : DOUZE, moisCompromis: DOUZE, aConfirmer: true })) };
}
type VenteListe = Vente & { mesCotes?: readonly string[]; maPart?: { ca: MontantC } };
const parDate = <V extends Vente>(xs: AffaireListee<V>[]): AffaireListee<V>[] => {
  const ordre = trierListe(xs.map((x) => x.v), 'date-recent', () => 0, (v) => v.libelle);
  return ordre.map((v) => xs.find((x) => x.v === v)!);
};
function assembler<V extends Vente>(vendus: V[], compromis: V[], montant: (v: V) => MontantC): AffairesPeriode<V> {
  const a = (vs: V[]) => parDate(vs.map((v) => ({ v, m: montant(v) })));
  const [lv, lc] = [a(vendus), a(compromis)];
  return { vendus: lv, compromis: lc, totalVendus: sommeC(lv.map((x) => x.m)), totalCompromis: sommeC(lc.map((x) => x.m)) };
}
/** « Mon espace » : MES affaires (les miennes, `mesCotes`), à MA part (`maPart`, le serveur). */
export function affairesPerso<V extends VenteListe>(ventes: readonly V[], p: PeriodeListe, jour: string): AffairesPeriode<V> {
  const miennes = ventes.filter((v) => (v.mesCotes?.length ?? 0) > 0 && pourLaVue(v, null));
  const vendues = miennes.filter((v) => v.statut === 'vendue');
  const comp = miennes.filter((v) => v.statut === 'compromis');
  const vendus = p.annees.flatMap((x) => vendues.filter((v) => v.annee === x.annee && (v.mois === null ? x.aConfirmer : x.moisVendus.includes(v.mois))));
  const compromis = uniques(p.annees.flatMap((x) => x.moisCompromis.flatMap((m) => compromisDuMode(comp, x.annee, m, 'tous', jour)))) as V[];
  return assembler<V>(vendus, compromis, (v) => v.maPart?.ca ?? RIEN_C);
}
/** Mode agence : les affaires de la structure (les fonctions de « Le mois » / « L'année »), chacune à sa carte. */
export function affairesAgence<V extends Vente>(d: { societe: DonneesSociete['societe']; ventes: readonly V[]; retrocessions: DonneesSociete['retrocessions']; statutsNegociateurs?: DonneesSociete['statutsNegociateurs'] },
  p: PeriodeListe, jour: string): AffairesPeriode<V> {
  const opts = { retros: d.retrocessions, statutDuLibelle: resolveurDe(d.statutsNegociateurs) };
  const vendus = p.annees.flatMap((x) => [...ventesPeriode(d.ventes, x.moisVendus.map((mois) => ({ annee: x.annee, mois }))), ...(x.aConfirmer ? aConfirmerDesAnnees(d.ventes, [x.annee]) : [])]) as V[];
  const compromis = uniques(p.annees.flatMap((x) => x.moisCompromis.flatMap((m) => compromisDuMode(d.ventes, x.annee, m, 'tous', jour)))) as V[];
  return assembler(vendus, compromis, (v) => resultatDesCartes([v], d.societe, opts).ca);
}
const uniques = <V extends { id: number }>(vs: V[]): V[] => vs.filter((v, i) => vs.findIndex((x) => x.id === v.id) === i);
