import type { MontantC } from '../transaction/partAgence';
import { coutsGlobaux, type EntreesCoutsGlobaux } from '../transaction/coutsGlobal';
import { coutsVenteDeLaSociete } from '../transaction/grapheGlobal';
import { variableNegociateur } from '../transaction/locationCa';
import { montantSaisi } from '../transaction/coutsSaisis';
import type { Agence } from './agence';
import { caGestionDuMoisC } from '../transaction/modele';

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
export interface CoutsVentePoste { commissions: MontantC; apporteurs: MontantC; exterieures: MontantC;
  /** 🔴 472 — saisi : « Rémunérations associés » (par associé, sans TVA), juste au-dessus des salaires. */
  remunerations: MontantC;
  /** 🔴 Lot 2 (451) — saisis : salaires chargés (par salarié), « Autres ». */
  salaires: MontantC; autres: MontantC; total: MontantC }
export interface CoutsLocationPoste {
  apporteurs: MontantC;
  /** « dont primes de gestion » : comptées dans `variable` (information). */
  primes: MontantC;
  /** Le variable négociateur compté, primes incluses (« inclus dans les salaires » : 0 les mois où les salaires de la Location sont saisis). */
  variable: MontantC;
  salaires: MontantC;
  /** 🔴 C3 — pour information, hors totaux : le variable calculé, primes incluses. */
  variableCalcule: MontantC;
  /** 🔴 C19 option A — automatiques (module Location) : la part de gestion récurrente des apporteurs, la rémunération des collègues ; lot 2 : « Autres » saisis. */
  partGestion: MontantC; collegues: MontantC; autres: MontantC;
  total: MontantC;
}
export interface CoutsGestionPoste { salaires: MontantC; adhoc: MontantC; monga: MontantC; autres: MontantC; total: MontantC }
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
  // les coûts saisis de la vente : ceux de « Coûts globaux » (FUSION), ou ceux de la structure (même fonction, `montantSaisi`)
  const ms = mois === null ? Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 })) : [{ annee, mois }];
  const sv = agence === 'tous' ? { salaires: c.saisis.venteSalaires, autres: c.saisis.venteAutres, remunerations: c.saisis.venteRemunerations ?? RIEN }
    : { salaires: montantSaisi(e.saisis ?? [], { famille: 'vente', poste: 'salaires', ms, societe: agence }), autres: montantSaisi(e.saisis ?? [], { famille: 'vente', poste: 'autres', ms, societe: agence }),
      remunerations: montantSaisi(e.saisis ?? [], { famille: 'vente', poste: 'remunerations', ms, societe: agence }) };
  const vente: CoutsVentePoste = { commissions: v.commissions, apporteurs: v.apporteurs, exterieures: v.exterieures, remunerations: sv.remunerations, salaires: sv.salaires, autres: sv.autres,
    total: somme([v.commissions, v.apporteurs, v.exterieures, sv.remunerations, sv.salaires, sv.autres]) };
  const L = avecLocationGestion(agence) ? c.location : null;
  const location: CoutsLocationPoste | null = L === null ? null : {
    apporteurs: L.apporteurs, primes: L.primesDeduites, variable: variableNegociateur(L.variableDeduit, L.primesDeduites), salaires: L.salaires,
    variableCalcule: variableNegociateur(L.variable, L.primes), partGestion: L.partGestion, collegues: L.collegues, autres: c.saisis.locationAutres,
    total: somme([L.apporteurs, L.primesDeduites, L.variableDeduit, L.salaires, L.partGestion, L.collegues, c.saisis.locationAutres]),
  };
  const gestion: CoutsGestionPoste | null = !avecLocationGestion(agence) ? null
    : { salaires: c.gestion.salaires, adhoc: c.gestion.adhoc, monga: c.gestion.monga, autres: c.saisis.gestionAutres,
      total: somme([c.gestion.salaires, c.gestion.adhoc, c.gestion.monga, c.saisis.gestionAutres]) };
  // FUSION : le total de « Coûts globaux » lui-même ; une structure : la somme de ses familles
  const total = agence === 'tous' ? c.total : somme([vente.total, location?.total ?? RIEN, gestion?.total ?? RIEN]);
  return { vente, location, gestion, total };
}

/**
 * ══ 🔴 « COÛTS ET CA » (Arno, 13/11/2026, 471) — LE CA DE GESTION D'UN POINT (un mois, ou l'année) ═════════════════════════════════════════════════
 * AUCUN CALCUL PROPRE : `caGestionDuMoisC`, la fonction du Suivi CA (honoraires de gestion + honoraires GLI, chacun à son taux). La gestion est à
 * CRITERIMMO : MACJ n'en a pas (null) ; FUSION = celui de CRITERIMMO. PUR.
 */
export interface CaGestionDuPoint { honoraires: MontantC; gli: MontantC; total: MontantC }
export function caGestionDuPoint(gestion: EntreesCoutsGlobaux['gestion'], agence: Agence, annee: number, mois: number | null): CaGestionDuPoint | null {
  if (!avecLocationGestion(agence)) return null;
  const xs = gestion.filter((g) => g.annee === annee && (mois === null || g.mois === mois) && g.id > 0).map((g) => caGestionDuMoisC(g));
  const s2 = (h: 'honorairesC' | 'gliC' | 'totalC', t: 'honorairesTtcC' | 'gliTtcC' | 'totalTtcC'): MontantC => ({ htC: xs.reduce((a, x) => a + x[h], 0), ttcC: xs.reduce((a, x) => a + x[t], 0) });
  return { honoraires: s2('honorairesC', 'honorairesTtcC'), gli: s2('gliC', 'gliTtcC'), total: s2('totalC', 'totalTtcC') };
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

/** Le refus de la route (403) : un compte sans la case « Les coûts » (D37, qui remplace « associé »), ou pas administrateur (« Voir »). */
export const MOTIF_COUTS = 'L’onglet « Coûts et CA » est réservé aux comptes qui ont la case « Les coûts » (Administratif › Comptes).';
/** L'adresse de lecture de l'onglet. */
export const URL_COUTS = '/api/admin/mon-espace/couts';
/** L'onglet est-il proposé ? 🔴 D37 : la case « Les coûts » (absente d'une réponse d'avant : le statut « Associé », décision C1) ; décision
 *  C2 : en mode agence (« Voir »), jamais dans la vue perso. PUR. */
export const ongletCoutsVisible = (titulaire: { associe?: boolean; couts?: boolean; administrateur: boolean }, agence: Agence | null): boolean =>
  agence !== null && (titulaire.couts ?? titulaire.associe === true) && titulaire.administrateur;

// ══ 🔴 LOT 2 (451) — LA SAISIE : ce que la route accepte (lu et vérifié ici, PUR) ══════════════════════════════════════════════════════════════
export type GesteCout =
  | { action: 'ligne-ajouter'; ligne: { societe: 'criterimmo' | 'macj'; famille: 'vente' | 'location' | 'gestion'; poste: 'salaires' | 'autres' | 'remunerations'; annee: number; mois: number;
      compteId: number | null; libelle: string | null; montantHt: number; tva: boolean } }
  | { action: 'ligne-modifier'; id: number; version: number; montantHt?: number; compteId?: number; libelle?: string; tva?: boolean }
  | { action: 'ligne-retirer'; id: number; version: number }
  | { action: 'gestion-poste'; annee: number; mois: number; poste: 'adhoc' | 'monga'; montantHt: number | null; version: number }
  /** 🔴 471 — le CA de gestion du mois (CRITERIMMO) : honoraires de gestion ou honoraires GLI, HT et taux de TVA (en %). */
  | { action: 'ca-gestion'; annee: number; mois: number; poste: 'honoraires' | 'gli'; montantHt: number | null; tauxTva: number; version: number }
  | { action: 'valider'; validation: { societe: 'criterimmo' | 'macj'; famille: 'vente' | 'location' | 'gestion'; poste: 'salaires' | 'autres' | 'adhoc' | 'monga' | 'honoraires' | 'gli' | 'remunerations'; annee: number; mois: number };
      valide: boolean };
/** Un montant saisi : un nombre ≥ 0, au plus 2 décimales, au plus 10 millions. PUR. */
export const estMontantSaisi = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e7 && Math.abs(Math.round(x * 100) - x * 100) < 1e-6;
/** 🔴 471 — un taux de TVA saisi (en %) : un nombre entre 0 et 100, au plus 2 décimales. PUR. */
export const estMontantSaisiTaux = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 && Math.abs(Math.round(x * 100) - x * 100) < 1e-6;
const entier = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
/** Le geste demandé, ou le motif du refus (422). C7 : la location et la gestion se saisissent sur CRITERIMMO seulement. PUR. */
export function lireGesteCout(b: unknown): { ok: true; geste: GesteCout } | { ok: false; motif: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const refus = (motif: string) => ({ ok: false as const, motif });
  const moisOk = entier(o.annee, 2000, 2100) && entier(o.mois, 1, 12);
  if (o.action === 'ligne-ajouter') {
    const l = (o.ligne ?? {}) as Record<string, unknown>;
    if (l.societe !== 'criterimmo' && l.societe !== 'macj') return refus('Structure attendue : CRITERIMMO ou MACJ (FUSION se lit, elle ne se saisit pas).');
    if (l.famille !== 'vente' && l.famille !== 'location' && l.famille !== 'gestion') return refus('Famille inconnue.');
    if (l.famille !== 'vente' && l.societe !== 'criterimmo') return refus('La location et la gestion sont à CRITERIMMO : saisissez-les sur CRITERIMMO.');
    if (l.poste !== 'salaires' && l.poste !== 'autres' && l.poste !== 'remunerations') return refus('Poste inconnu.');
    // 🔴 472 — « Rémunérations associés » : un coût de la VENTE, rattaché à un associé, jamais de TVA
    if (l.poste === 'remunerations' && l.famille !== 'vente') return refus('Les rémunérations des associés sont un coût de la vente.');
    if (!entier(l.annee, 2000, 2100) || !entier(l.mois, 1, 12)) return refus('Mois invalide.');
    if (!estMontantSaisi(l.montantHt)) return refus('Montant invalide (un nombre positif, deux décimales au plus).');
    if (l.poste === 'salaires' && !entier(l.compteId, 1, Number.MAX_SAFE_INTEGER)) return refus('Choisissez le salarié.');
    if (l.poste === 'remunerations' && !entier(l.compteId, 1, Number.MAX_SAFE_INTEGER)) return refus('Choisissez l’associé.');
    const libelle = typeof l.libelle === 'string' ? l.libelle.trim() : '';
    if (l.poste === 'autres' && (libelle === '' || libelle.length > 120)) return refus('Donnez un libellé (120 caractères au plus).');
    if (l.tva !== undefined && typeof l.tva !== 'boolean') return refus('TVA : 20 % ou sans TVA.');
    if (l.poste === 'salaires' && l.tva === true) return refus('Les salaires chargés n’ont jamais de TVA.');
    if (l.poste === 'remunerations' && l.tva === true) return refus('Les rémunérations des associés n’ont jamais de TVA.');
    return { ok: true, geste: { action: 'ligne-ajouter', ligne: { societe: l.societe, famille: l.famille, poste: l.poste, annee: l.annee, mois: l.mois,
      compteId: l.poste === 'salaires' || l.poste === 'remunerations' ? l.compteId as number : null, libelle: l.poste === 'autres' ? libelle : null, montantHt: l.montantHt,
      // R2 — « Autres » : 20 % par défaut ; salaires : jamais
      tva: l.poste === 'autres' ? l.tva !== false : false } } };
  }
  if (o.action === 'ligne-modifier' || o.action === 'ligne-retirer') {
    if (!entier(o.id, 1, Number.MAX_SAFE_INTEGER) || !entier(o.version, 0, Number.MAX_SAFE_INTEGER)) return refus('Ligne inconnue.');
    if (o.action === 'ligne-retirer') return { ok: true, geste: { action: 'ligne-retirer', id: o.id, version: o.version } };
    if (o.montantHt !== undefined && !estMontantSaisi(o.montantHt)) return refus('Montant invalide (un nombre positif, deux décimales au plus).');
    if (o.compteId !== undefined && !entier(o.compteId, 1, Number.MAX_SAFE_INTEGER)) return refus('Choisissez le salarié.');
    if (o.libelle !== undefined && (typeof o.libelle !== 'string' || o.libelle.trim() === '' || o.libelle.length > 120)) return refus('Donnez un libellé (120 caractères au plus).');
    if (o.tva !== undefined && typeof o.tva !== 'boolean') return refus('TVA : 20 % ou sans TVA.');
    return { ok: true, geste: { action: 'ligne-modifier', id: o.id, version: o.version, ...(o.montantHt === undefined ? {} : { montantHt: o.montantHt as number }),
      ...(o.compteId === undefined ? {} : { compteId: o.compteId as number }), ...(o.libelle === undefined ? {} : { libelle: (o.libelle as string).trim() }),
      ...(o.tva === undefined ? {} : { tva: o.tva as boolean }) } };
  }
  if (o.action === 'gestion-poste') {
    if (!moisOk) return refus('Mois invalide.');
    if (o.poste !== 'adhoc' && o.poste !== 'monga') return refus('Poste inconnu.');
    if (o.montantHt !== null && !estMontantSaisi(o.montantHt)) return refus('Montant invalide (un nombre positif, deux décimales au plus).');
    if (!entier(o.version, 0, Number.MAX_SAFE_INTEGER)) return refus('Version manquante : rechargez.');
    return { ok: true, geste: { action: 'gestion-poste', annee: o.annee as number, mois: o.mois as number, poste: o.poste, montantHt: o.montantHt as number | null, version: o.version } };
  }
  if (o.action === 'ca-gestion') {
    // 🔴 471 — la gestion est à CRITERIMMO : aucune structure à choisir (MACJ ne fait pas de gestion)
    if (!moisOk) return refus('Mois invalide.');
    if (o.poste !== 'honoraires' && o.poste !== 'gli') return refus('Poste inconnu.');
    if (o.montantHt !== null && !estMontantSaisi(o.montantHt)) return refus('Montant invalide (un nombre positif, deux décimales au plus).');
    if (!estMontantSaisiTaux(o.tauxTva)) return refus('Taux de TVA invalide (un pourcentage entre 0 et 100, deux décimales au plus).');
    if (!entier(o.version, 0, Number.MAX_SAFE_INTEGER)) return refus('Version manquante : rechargez.');
    return { ok: true, geste: { action: 'ca-gestion', annee: o.annee as number, mois: o.mois as number, poste: o.poste, montantHt: o.montantHt as number | null, tauxTva: o.tauxTva as number, version: o.version } };
  }
  if (o.action === 'valider') {
    const v = (o.validation ?? {}) as Record<string, unknown>;
    if (v.societe !== 'criterimmo' && v.societe !== 'macj') return refus('Structure attendue : CRITERIMMO ou MACJ (FUSION se lit, elle ne se saisit pas).');
    if (v.famille !== 'vente' && v.famille !== 'location' && v.famille !== 'gestion') return refus('Famille inconnue.');
    if (v.famille !== 'vente' && v.societe !== 'criterimmo') return refus('La location et la gestion sont à CRITERIMMO : saisissez-les sur CRITERIMMO.');
    if (v.poste !== 'salaires' && v.poste !== 'autres' && !(v.famille === 'gestion' && (v.poste === 'adhoc' || v.poste === 'monga' || v.poste === 'honoraires' || v.poste === 'gli'))
      && !(v.famille === 'vente' && v.poste === 'remunerations')) return refus('Poste inconnu.');
    if (!entier(v.annee, 2000, 2100) || !entier(v.mois, 1, 12)) return refus('Mois invalide.');
    if (typeof o.valide !== 'boolean') return refus('Valider : oui ou non.');
    return { ok: true, geste: { action: 'valider', validation: { societe: v.societe, famille: v.famille, poste: v.poste as 'salaires', annee: v.annee, mois: v.mois }, valide: o.valide } };
  }
  return refus('Action inconnue.');
}

/**
 * 🔴 R3 (accord d'Arno, 03/11/2026) — L'ADRESSE « SAISIR DANS LES COÛTS » : les salaires chargés ne se saisissent plus que dans « Mon espace › Les
 * coûts » (par salarié) ; le Suivi CA (Gestion, Location) montre leur total et ce lien. CRITERIMMO (C7), l'onglet du tableau de la famille. PUR.
 */
export const lienSaisirCouts = (famille: 'vente' | 'location' | 'gestion'): string => `/admin/mon-espace?espace=criterimmo&onglet=couts&couts-tableau=${famille}`;
export const MOT_SAISIR_COUTS = 'Saisir dans Les coûts';
