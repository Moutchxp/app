import { depuisTtc, ventilationVente, type MontantC } from './partAgence';
import type { GestionMois, Retrocession, Societe, Vente } from './modele';
import { ventesDeLAnnee, ventesDuMois } from './modele';
import { caNetVente, lignesCarteAffaire } from './carteAffaireLignes';
import type { StatutDuLibelle } from './statutLigne';
import { coutsLocation, type CoutsLocation, type LigneLocationCa, type RetroLocation, type SalairesLocation } from './locationCa';
import { totauxGestion } from './gestionVue';

/**
 * ══ 🔴 LOT CG2 (Arno) — « COÛTS GLOBAUX » DU CA GLOBAL : CHAQUE COÛT, CELUI DE SA PAGE D'ORIGINE (PUR) ═══════════════════════════════════════════
 * Aucune règle de calcul ne change ; chaque famille reprend la fonction de sa page, HT et TTC au centime :
 *  · VENTE (la page Transaction vente FUSION : les deux sociétés, chaque affaire une fois ; les ventes signées du mois, `ventesDuMois`, ou de l'année,
 *    `ventesDeLAnnee`) — sur les lignes de chaque carte (`lignesCarteAffaire`, vue FUSION) : les commissions de TOUS les négociateurs (celles du CA net,
 *    lot CW), les apporteurs (répartition + rétrocessions rattachées), les agences extérieures. L'inter-cabinet entre nos sociétés n'est jamais un coût.
 *    CA − ces coûts = le CA net de la page (`caNetVente`) ;
 *  · LOCATION (la page « Suivi CA › Location » : `coutsLocation`, « Avec | Sans salaires ») : apporteurs, primes et variable (déduits, ou « inclus dans
 *    les salaires » les mois où ceux de la Location sont saisis), salaires chargés ;
 *  · GESTION (la page Gestion : `totauxGestion`) : ADHOC, MONGA (20 %), salaires chargés (sans TVA ; « Sans salaires » : non comptés).
 * Total coûts = la somme des colonnes affichées.
 */
export interface CoutsVente { ca: MontantC; commissions: MontantC; apporteurs: MontantC; exterieures: MontantC; net: MontantC; nb: number }
export interface CoutsGestion { adhoc: MontantC; monga: MontantC;
  /** Les salaires chargés comptés (« Sans salaires » : 0) ; `salairesSaisis` : le montant saisi, compté ou non. */
  salaires: MontantC; salairesSaisis: MontantC; honoraires: MontantC; net: MontantC; moisSalairesSaisis: number }
export interface CoutsGlobaux { vente: CoutsVente; location: CoutsLocation | null; gestion: CoutsGestion; total: MontantC }

export interface EntreesCoutsGlobaux {
  /** Les ventes de la page FUSION (`lireVentes(null)`) et ses rétrocessions ; le statut des négociateurs payés (la paye importée). */
  ventes: readonly Vente[]; retrocessions: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle;
  /** Les données de la page « Suivi CA › Location » ; null : la location n'a pas pu être lue. */
  location: { lignes: readonly LigneLocationCa[]; retrocessions: readonly RetroLocation[]; salaires: readonly SalairesLocation[] | null } | null;
  gestion: readonly GestionMois[];
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);
const sansTva = (c: number): MontantC => ({ htC: c, ttcC: c });

/** Les coûts de ventes (la page FUSION, vue « les deux sociétés ») : sur les lignes de chaque carte, aucune copie de calcul. PUR. */
export function coutsVente(ventes: readonly Vente[], o: { retros?: readonly Retrocession[]; statutDuLibelle?: StatutDuLibelle } = {},
  /** 🔴 LOT CG9 — la vue d'une société (ses lignes de carte : la page CRITERIMMO ou MACJ) ; null : la page FUSION, comme avant. */
  vue: Societe | null = null): CoutsVente {
  let r: CoutsVente = { ca: RIEN, commissions: RIEN, apporteurs: RIEN, exterieures: RIEN, net: RIEN, nb: 0 };
  for (const v of ventes) {
    const l = lignesCarteAffaire(v, vue, o);
    const vent = ventilationVente(v, vue);
    r = { ca: plus(r.ca, (vent.entree ?? vent.sortie)?.commissionVente ?? depuisTtc(v.honorairesTtc)),
      commissions: plus(r.commissions, somme(l.lignes.map((x) => x.com))),
      apporteurs: plus(plus(r.apporteurs, l.apporteur ?? RIEN), l.retro ?? RIEN),
      exterieures: plus(r.exterieures, somme(l.lignes.flatMap((x) => x.exterieures.map((y) => y.m)))),
      net: plus(r.net, caNetVente(v, vue, o)), nb: r.nb + 1 };
  }
  return r;
}

/** Les coûts globaux d'un mois (1 → 12) ou d'une année (mois null : les ventes « mois à confirmer » comprises, comme le CA de l'année). PUR. */
export function coutsGlobaux(e: EntreesCoutsGlobaux, annee: number, mois: number | null, avecSalaires = true): CoutsGlobaux {
  return mois === null ? coutsGlobauxAnnees(e, [annee], avecSalaires) : coutsDe(e, (vs) => ventesDuMois(vs, annee, mois), [{ annee, mois }], avecSalaires);
}
/**
 * 🔴 LOT CG3 — les coûts globaux de plusieurs années (« Période », « Tout ») : les ventes de chaque année (mois à confirmer compris), tous leurs mois
 * pour la Location et la Gestion — la somme exacte des années, au centime (chaque montant s'additionne vente par vente, mois par mois). PUR.
 */
export function coutsGlobauxAnnees(e: EntreesCoutsGlobaux, annees: readonly number[], avecSalaires = true): CoutsGlobaux {
  return coutsDe(e, (vs) => annees.flatMap((a) => ventesDeLAnnee(vs, a)), annees.flatMap((annee) => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 }))), avecSalaires);
}
function coutsDe(e: EntreesCoutsGlobaux, choisir: (vs: Vente[]) => Vente[], ms: readonly { annee: number; mois: number }[], avecSalaires: boolean): CoutsGlobaux {
  // une vente sans note « à attribuer » : `double` null (la règle `compteDansSociete`, comme `celluleGlobal`) ; une vente lue sans ses lignes de paye
  // (une route d'avant le lot CG2) : aucune ligne
  const ventes = e.ventes.map((v) => (v.double === undefined || v.lignes === undefined ? { ...v, double: v.double ?? null, lignes: v.lignes ?? [] } : v));
  const vente = coutsVente(choisir(ventes), { retros: e.retrocessions, statutDuLibelle: e.statutDuLibelle });
  const location = e.location === null ? null : coutsLocation(e.location.lignes, ms, e.location.retrocessions, e.location.salaires, avecSalaires);
  const g = totauxGestion(e.gestion, ms, avecSalaires);
  const moisSalairesSaisis = ms.filter((m) => e.gestion.some((x) => x.annee === m.annee && x.mois === m.mois && x.salarieHt != null)).length;
  const gestion: CoutsGestion = { adhoc: { htC: g.adhocC, ttcC: g.adhocTtcC }, monga: { htC: g.mongaC, ttcC: g.mongaTtcC },
    salaires: sansTva(avecSalaires ? g.salariesC : 0), salairesSaisis: sansTva(g.salariesC), honoraires: { htC: g.honorairesC, ttcC: g.honorairesTtcC },
    net: { htC: g.netC, ttcC: g.netTtcC }, moisSalairesSaisis };
  const total = somme([vente.commissions, vente.apporteurs, vente.exterieures,
    ...(location === null ? [] : [location.apporteurs, location.primesDeduites, location.variableDeduit, location.salaires]),
    gestion.adhoc, gestion.monga, gestion.salaires]);
  return { vente, location, gestion, total };
}
