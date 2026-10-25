import { compteCommeGestion, type RegleAnnexes } from './annexesGestion';
import {
  caLigne, entreeEnGestion, honorairesGestionMensuels, totaux, totauxPeriode, variation, type ActiviteCalcul, type AnneeHistorique, type ContexteCalcul,
  type LigneGestion, type Totaux, type Transition,
} from './tableauBord';
import { anneesDeLaPeriode, moisDeLaPeriode, portionDeLAnnee, reculer, type PeriodeSuivi } from './periodeSuivi';

/**
 * ══ 🔴 Arno (25/10/2026) — LE SUIVI ANNUEL SUR UNE PÉRIODE « DÉBUT / FIN » : LES CALCULS (tuiles, années, gestion) ═══════════════════
 * Chaque total de la période est la somme de ses mois (ou de ses jours) : les lignes de la période, rien d'autre. La comparaison des tuiles
 * se fait avec la PÉRIODE PRÉCÉDENTE (2a : mêmes dates, autant d'années plus tôt ; aucune avant la première donnée). L'encart du graphique
 * compare une année à la MÊME PORTION de l'année d'avant (une dernière année partielle face à la même période de l'année précédente). PUR.
 */
type Dates = { debutDate: string; finDate: string };
const entre = (a: { dateSignature: string }, p: Dates): boolean => a.dateSignature.slice(0, 10) >= p.debutDate && a.dateSignature.slice(0, 10) <= p.finDate;

/** Les entrées / sorties de gestion d'un intervalle de dates (les règles de la section Gestion, annexes comprises). */
export function mouvementsGestionEntre(transitions: readonly Transition[], p: Dates, regle: RegleAnnexes): { entrees: number; sorties: number; solde: number } {
  const dans = transitions.filter((t) => t.effetLe >= p.debutDate && t.effetLe <= p.finDate && compteCommeGestion(t.lotId, t.effetLe, regle));
  const entrees = dans.filter(entreeEnGestion).length;
  const sorties = dans.filter((t) => t.avant === 'en_gestion' && t.apres !== 'en_gestion').length;
  return { entrees, sorties, solde: entrees - sorties };
}

/** Le stock de biens en gestion à une date : le stock d'aujourd'hui, moins les mouvements postérieurs (les règles de `sectionGestion`). */
export function stockALaDate(transitions: readonly Transition[], stockActuel: number, date: string, regle: RegleAnnexes): number {
  const apres = transitions.filter((t) => t.effetLe > date && compteCommeGestion(t.lotId, t.effetLe, regle));
  return stockActuel - apres.reduce((s, t) => s + (entreeEnGestion(t) ? 1 : t.avant === 'en_gestion' && t.apres !== 'en_gestion' ? -1 : 0), 0);
}

export interface TuilesPeriode {
  courant: Totaux; precedent: Totaux | null; libellePrecedent: string | null;
  ecartCa: number | null; variationCa: number | null; ecartNb: number | null; variationNb: number | null; ecartCaNet: number | null; variationCaNet: number | null;
  gestion: { nouvelles: number; perdues: number; gagneMensuel: number; perduMensuel: number; sansLoyer: number; lotsEntres: number[]; lotsSortis: number[]; stockFin: number };
}

/** Les 4 tuiles du Suivi annuel sur la période : ses totaux, la période précédente (« — » sans elle), la gestion de la période. */
export function tuilesPeriode(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: PeriodeSuivi, precedente: (Dates & { libelle: string }) | null,
  gestionLignes: readonly LigneGestion[], regle: RegleAnnexes, transitions: readonly Transition[], stockActuel: number): TuilesPeriode {
  const courant = totaux(activites.filter((a) => entre(a, p)), ctx);
  const precedent = precedente === null ? null : totaux(activites.filter((a) => entre(a, precedente)), ctx);
  const g = gestionLignes.filter((l) => l.effetLe >= p.debutDate && l.effetLe <= p.finDate);
  const nouvelles = g.filter((l) => l.apres === 'en_gestion' && l.avant !== 'en_gestion');
  const perdues = g.filter((l) => l.avant === 'en_gestion' && l.apres !== 'en_gestion');
  const somme = (x: LigneGestion[]): number => x.reduce((t, l) => t + (honorairesGestionMensuels(l) ?? 0), 0);
  return {
    courant, precedent, libellePrecedent: precedente?.libelle ?? null,
    ecartCa: precedent === null ? null : courant.ca - precedent.ca, variationCa: precedent === null ? null : variation(courant.ca, precedent.ca),
    ecartNb: precedent === null ? null : courant.nbBaux - precedent.nbBaux, variationNb: precedent === null ? null : variation(courant.nbBaux, precedent.nbBaux),
    ecartCaNet: precedent === null ? null : courant.caNet - precedent.caNet, variationCaNet: precedent === null ? null : variation(courant.caNet, precedent.caNet),
    gestion: { nouvelles: nouvelles.filter((l) => compteCommeGestion(l.lotId, l.effetLe, regle)).length,
      perdues: perdues.filter((l) => compteCommeGestion(l.lotId, l.effetLe, regle)).length, gagneMensuel: somme(nouvelles), perduMensuel: somme(perdues),
      sansLoyer: [...nouvelles, ...perdues].filter((l) => honorairesGestionMensuels(l) === null).length,
      lotsEntres: nouvelles.map((l) => l.lotId).filter((x): x is number => x !== null), lotsSortis: perdues.map((l) => l.lotId).filter((x): x is number => x !== null),
      stockFin: stockALaDate(transitions, stockActuel, p.finDate, regle) },
  };
}

/**
 * Les années de la période (« Année par année ») : chacune sur sa PORTION de la période, la somme de ses mois (`totauxPeriode`, les règles du
 * tableau d'avant : une année entière ou l'année en cours y donnent exactement les mêmes chiffres). Toutes affaires, sans filtre.
 */
export function historiquePeriode(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: PeriodeSuivi, voirCommissions: boolean): AnneeHistorique[] {
  return anneesDeLaPeriode(p).map((annee) => {
    const portion = portionDeLAnnee(annee, p);
    const lignes = activites.filter((a) => entre(a, portion));
    const ts = moisDeLaPeriode(portion).map((m) => totauxPeriode(lignes, ctx, { annee, mois: Number(m.slice(5, 7)) }));
    const s = (f: (t: (typeof ts)[number]) => number): number => ts.reduce((x, t) => x + f(t), 0);
    return { annee, nbBaux: s((t) => t.nbBaux), nb: s((t) => t.nb), ca: s((t) => t.ca), caNet: s((t) => t.caNet), apporteurs: s((t) => t.apporteurs),
      commission: voirCommissions ? s((t) => t.commission) : null };
  });
}

/** Pour l'encart : l'année précédente sur la MÊME PORTION (du 1er janvier à la même date) — CA HT, baux, solde de gestions ; null sans donnée. */
export interface ValeursAnnee { annee: number; ca: number; nbBaux: number; solde: number }
export function comparaisonsAnnees(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, transitions: readonly Transition[], p: PeriodeSuivi, regle: RegleAnnexes, origine: number):
  { courant: ValeursAnnee; precedent: ValeursAnnee | null }[] {
  const valeurs = (annee: number, d: Dates): ValeursAnnee => {
    const lignes = activites.filter((a) => entre(a, d));
    return { annee, ca: lignes.reduce((s, a) => s + caLigne(a), 0), nbBaux: totaux(lignes, ctx).nbBaux,
      solde: mouvementsGestionEntre(transitions, d, regle).solde };
  };
  return anneesDeLaPeriode(p).map((annee) => {
    const portion = portionDeLAnnee(annee, p);
    const avant = { debutDate: reculer(portion.debutDate, 1), finDate: reculer(portion.finDate, 1) };
    return { courant: valeurs(annee, portion), precedent: annee - 1 < origine ? null : valeurs(annee - 1, avant) };
  });
}
