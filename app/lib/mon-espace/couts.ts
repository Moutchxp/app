import type { MontantC } from '../transaction/partAgence';
import { coutsGlobaux, type EntreesCoutsGlobaux } from '../transaction/coutsGlobal';
import { coutsVenteDeLaSociete } from '../transaction/grapheGlobal';
import { variableNegociateur } from '../transaction/locationCa';
import type { Agence } from './agence';

/**
 * ══ 🔴 MON ESPACE — L'ONGLET « LES COÛTS » (Arno, 03/11/2026, lot C1 : LECTURE SEULE) ═══════════════════════════════════════════════════════════
 * AUCUN CALCUL PROPRE (règle absolue : une seule comptabilité). Ce module ne fait que RANGER par poste, par mois et par structure les montants
 * des fonctions du Suivi CA :
 *   · FUSION : `coutsGlobaux` (avec salaires), la fonction du tableau « Coûts globaux » — chaque poste, chaque total, au centime ;
 *   · CRITERIMMO / MACJ, la vente : `coutsVenteDeLaSociete`, celle du graphique du CA global (les lignes de carte de la société ; CRITERIMMO + MACJ =
 *     FUSION) ; la location et la gestion : celles de `coutsGlobaux`, à CRITERIMMO seulement (décision C7 : MACJ = vente seulement).
 * Les colonnes comptées sont celles de « Coûts globaux » (dont les primes, comptées DANS le variable) ; la colonne « Variable négo (calculé) »
 * (décision C3) est le variable calculé (`variableNegociateur(variable, primes)`, même les mois où il est « inclus dans les salaires ») : pour
 * information, jamais dans un total.
 */
export interface CoutsVentePoste { commissions: MontantC; apporteurs: MontantC; exterieures: MontantC; total: MontantC }
export interface CoutsLocationPoste {
  apporteurs: MontantC;
  /** « dont primes de gestion » : comptées dans `variable` (information). */
  primes: MontantC;
  /** Le variable négociateur compté, primes incluses (« inclus dans les salaires » : 0 les mois où les salaires de la Location sont saisis). */
  variable: MontantC;
  salaires: MontantC;
  /** 🔴 C3 — pour information, hors totaux : le variable calculé, primes incluses. */
  variableCalcule: MontantC;
  total: MontantC;
}
export interface CoutsGestionPoste { salaires: MontantC; adhoc: MontantC; monga: MontantC; total: MontantC }
export interface CoutsDuPoint {
  vente: CoutsVentePoste;
  /** null : MACJ (vente seulement), ou la location n'a pas pu être lue. */
  location: CoutsLocationPoste | null;
  /** null : MACJ (vente seulement). */
  gestion: CoutsGestionPoste | null;
  total: MontantC;
}

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const somme = (xs: readonly MontantC[]): MontantC => xs.reduce(plus, RIEN);

/** La location et la gestion sont-elles de cette structure ? (C7 : CRITERIMMO, donc aussi FUSION ; jamais MACJ.) PUR. */
export const avecLocationGestion = (agence: Agence): boolean => agence !== 'macj';

/** Les coûts d'un point — un mois (1 → 12) ou l'année (mois null : ventes « mois à confirmer » comprises, comme « Coûts globaux »). PUR. */
export function coutsDuPoint(e: EntreesCoutsGlobaux, agence: Agence, annee: number, mois: number | null): CoutsDuPoint {
  const c = coutsGlobaux(e, annee, mois, true);
  const v = agence === 'tous' ? c.vente : coutsVenteDeLaSociete(e, agence, annee, mois);
  const vente: CoutsVentePoste = { commissions: v.commissions, apporteurs: v.apporteurs, exterieures: v.exterieures, total: somme([v.commissions, v.apporteurs, v.exterieures]) };
  const L = avecLocationGestion(agence) ? c.location : null;
  const location: CoutsLocationPoste | null = L === null ? null : {
    apporteurs: L.apporteurs, primes: L.primesDeduites, variable: variableNegociateur(L.variableDeduit, L.primesDeduites), salaires: L.salaires,
    variableCalcule: variableNegociateur(L.variable, L.primes),
    total: somme([L.apporteurs, L.primesDeduites, L.variableDeduit, L.salaires]),
  };
  const gestion: CoutsGestionPoste | null = !avecLocationGestion(agence) ? null
    : { salaires: c.gestion.salaires, adhoc: c.gestion.adhoc, monga: c.gestion.monga, total: somme([c.gestion.salaires, c.gestion.adhoc, c.gestion.monga]) };
  // FUSION : le total de « Coûts globaux » lui-même ; une structure : la somme de ses familles
  const total = agence === 'tous' ? c.total : somme([vente.total, location?.total ?? RIEN, gestion?.total ?? RIEN]);
  return { vente, location, gestion, total };
}

/** Chaque montant de `a` moins celui de `b` (même forme). PUR. */
function ecart(a: CoutsDuPoint, b: readonly CoutsDuPoint[]): CoutsDuPoint {
  const s = <T extends object>(x: T | null, ys: readonly (T | null)[]): T | null => (x === null ? null
    : Object.fromEntries(Object.entries(x as Record<string, MontantC>).map(([k, m]) => [k, ys.reduce((t, y) => moins(t, (y as Record<string, MontantC> | null)?.[k] ?? RIEN), m)])) as T);
  return { vente: s(a.vente, b.map((y) => y.vente))!, location: s(a.location, b.map((y) => y.location)), gestion: s(a.gestion, b.map((y) => y.gestion)),
    total: b.reduce((t, y) => moins(t, y.total), a.total) };
}
const nul = (p: CoutsDuPoint): boolean => ([p.total, ...Object.values(p.vente), ...Object.values(p.location ?? {}), ...Object.values(p.gestion ?? {})] as MontantC[])
  .every((m) => m.htC === 0 && m.ttcC === 0);

export interface CoutsDeLAnnee {
  /** Les 12 mois. */
  mois: CoutsDuPoint[];
  /** Les ventes signées sans mois (« mois à confirmer ») : comptées dans l'année, dans aucun mois ; null : aucune (rien à montrer). */
  aConfirmer: CoutsDuPoint | null;
  /** L'année : la ligne de total, celle de « Coûts globaux » (= la somme des 12 mois et des « mois à confirmer », au centime). */
  annee: CoutsDuPoint;
}
/** Le tableau d'une année, pour une structure : les 12 mois, les « mois à confirmer » s'il y en a, l'année. PUR. */
export function coutsDeLAnnee(e: EntreesCoutsGlobaux, agence: Agence, annee: number): CoutsDeLAnnee {
  const mois = Array.from({ length: 12 }, (_, i) => coutsDuPoint(e, agence, annee, i + 1));
  const tout = coutsDuPoint(e, agence, annee, null);
  const reste = ecart(tout, mois);
  return { mois, aConfirmer: nul(reste) ? null : reste, annee: tout };
}

/** Le refus de la route (403) : un compte qui n'est pas associé (ou pas administrateur : « Voir » n'existe que pour eux). */
export const MOTIF_COUTS = 'L’onglet « Les coûts » est réservé aux associés.';
/** L'adresse de lecture de l'onglet. */
export const URL_COUTS = '/api/admin/mon-espace/couts';
/** L'onglet est-il proposé ? Décision C1 : un associé ; décision C2 : en mode agence (« Voir »), jamais dans la vue perso. PUR. */
export const ongletCoutsVisible = (titulaire: { associe?: boolean; administrateur: boolean }, agence: Agence | null): boolean =>
  agence !== null && titulaire.associe === true && titulaire.administrateur;
