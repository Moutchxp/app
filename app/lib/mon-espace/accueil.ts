import { caNetParMoisMode, caNetVente, resultatDesCartes } from '../transaction/carteAffaireLignes';
import { cumuler } from '../transaction/cumul';
import { borneCumul, cumulA, listeADate, listeDesAnnees, moisADate, ventesDesAnnees } from '../transaction/periodeAnnees';
import { sommeDesMoisAffiches, totauxPeriode, unAnPlusTot, ventesPeriode, type MoisChoisi } from '../transaction/periodeMois';
import { caHtParMoisMode, sansN1Pour, TVA, variation, type DonneesSociete } from '../transaction/modele';
import type { MontantC } from '../transaction/partAgence';
import { resolveurDe } from '../transaction/statutLigne';
import { sommeC, totauxDuChoix, type StatsMonEspace } from './statistiques';

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
  return {
    ca: { valeur: deC(t.n.ca), n1: t.n1 === null ? null : deC(t.n1.ca), pct: t.n1 === null ? null : variation(t.n.ca.htC, t.n1.ca.htC) },
    nb: { valeur: t.n.nb, n1: t.n1?.nb ?? null },
    cumul: { valeur: deC(cu), n1: deC(cu1), pct: variation(cu.htC, cu1.htC), fin: b.fin, mot: b.mot },
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
  return {
    ca: { valeur: deC(n.ca), ...avec(deC(n1.ca), variation(n.ca.htC, n1.ca.htC), tout, false) },
    nb: { valeur: n.nb, n1: tout ? null : n1.nb },
    aDate: { valeur: deC(d), ...avec(deC(d1), variation(d.htC, d1.htC), tout, false) },
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
