import type { GestionMois } from './modele';
import type { MontantC } from './partAgence';
import type { MoisChoisi } from './periodeMois';
import { moisGestion, totauxGestion, type MoisGestionVu, type TotauxGestion } from './gestionVue';
import { lignesDesMois, plusC, totauxLocation, type LigneLocationCa, type TotauxLocationCa } from './locationCa';

/**
 * ══ 🔴 LOT LG1 (Arno, 01/11/2026) — « FUSION LOCATION & GESTION » : LE CUMUL DES DEUX ACTIVITÉS (PUR) ═════════════════════════════════════════════
 * AUCUN CALCUL PROPRE : la part LOCATION est `totauxLocation` (la page Location : chaque ligne au centime, `sommesLocation`), la part GESTION est
 * `totauxGestion` (la page Gestion : chaque mois au centime, TTC à ses taux, coûts salariaux chargés sans TVA). La fusion n'additionne que leurs
 * centimes : chaque part = sa page d'origine, et CA net = CA brut − coûts, au centime, en HT et en TTC (vrai dans chaque page, donc dans la somme).
 * « Activité » : les deux (défaut), la location seule, la gestion seule — une partition exacte (l'autre part compte 0).
 */
export type ActiviteFusion = 'deux' | 'location' | 'gestion';
export const ACTIVITES_FUSION: readonly ActiviteFusion[] = ['deux', 'location', 'gestion'];
export const LIBELLE_ACTIVITE_FUSION: Record<ActiviteFusion, string> = { deux: 'Les deux', location: 'Location', gestion: 'Gestion' };
export const estActiviteFusion = (x: unknown): x is ActiviteFusion => x === 'deux' || x === 'location' || x === 'gestion';

/** Les familles de coûts, dans l'ordre comptable : la location (primes, apporteurs), puis la gestion (ADHOC, MONGA, coûts salariaux chargés). */
export type FamilleCout = 'primes' | 'apporteurs' | 'adhoc' | 'monga' | 'salaries';
export const FAMILLES_COUTS: readonly { cle: FamilleCout; libelle: string; activite: 'location' | 'gestion' }[] = [
  { cle: 'primes', libelle: 'Primes de nouvelle gestion', activite: 'location' },
  { cle: 'apporteurs', libelle: 'Commissions d’apporteurs', activite: 'location' },
  { cle: 'adhoc', libelle: 'Coût ADHOC', activite: 'gestion' },
  { cle: 'monga', libelle: 'Coût MONGA', activite: 'gestion' },
  { cle: 'salaries', libelle: 'Coûts salariaux chargés', activite: 'gestion' },
];

const RIEN: MontantC = { htC: 0, ttcC: 0 };
/** Une part d'activité : CA brut, ses coûts, son CA net (centimes HT et TTC). */
export interface PartFusion { ca: MontantC; couts: Record<FamilleCout, MontantC>; coutsTotal: MontantC; net: MontantC }
export interface TotauxFusion {
  activite: ActiviteFusion;
  location: PartFusion; gestion: PartFusion;
  /** Les totaux des parts comptées (la somme des deux, ou une seule). */
  ca: MontantC; couts: Record<FamilleCout, MontantC>; coutsTotal: MontantC; net: MontantC;
  /** Les détails des pages d'origine (pour le volume, les parts propriétaire / locataire, les mois saisis). */
  tLocation: TotauxLocationCa; tGestion: TotauxGestion;
  /** Baux signés (location) ; lots gérés (gestion : ceux du mois, ou leur moyenne) ; null : activité non comptée. */
  baux: number | null; lots: number | null;
}

/** La part location : la page Location, telle quelle (`totauxLocation`). PUR. */
export function partLocation(t: TotauxLocationCa): PartFusion {
  const couts = { primes: t.primes, apporteurs: t.apporteurs, adhoc: RIEN, monga: RIEN, salaries: RIEN };
  return { ca: t.ca, couts, coutsTotal: plusC(t.primes, t.apporteurs), net: t.net };
}
/** La part gestion : la page Gestion, telle quelle (`totauxGestion` ; les coûts salariaux chargés : sans TVA). PUR. */
export function partGestion(t: Pick<TotauxGestion, 'honorairesC' | 'honorairesTtcC' | 'adhocC' | 'adhocTtcC' | 'mongaC' | 'mongaTtcC' | 'salariesC' | 'netC' | 'netTtcC'>): PartFusion {
  const adhoc = { htC: t.adhocC, ttcC: t.adhocTtcC }; const monga = { htC: t.mongaC, ttcC: t.mongaTtcC }; const salaries = { htC: t.salariesC, ttcC: t.salariesC };
  return { ca: { htC: t.honorairesC, ttcC: t.honorairesTtcC }, couts: { primes: RIEN, apporteurs: RIEN, adhoc, monga, salaries },
    coutsTotal: plusC(plusC(adhoc, monga), salaries), net: { htC: t.netC, ttcC: t.netTtcC } };
}
const VIDE: PartFusion = { ca: RIEN, couts: { primes: RIEN, apporteurs: RIEN, adhoc: RIEN, monga: RIEN, salaries: RIEN }, coutsTotal: RIEN, net: RIEN };
const somme = (a: PartFusion, b: PartFusion): Omit<PartFusion, never> => ({
  ca: plusC(a.ca, b.ca), coutsTotal: plusC(a.coutsTotal, b.coutsTotal), net: plusC(a.net, b.net),
  couts: Object.fromEntries(FAMILLES_COUTS.map((f) => [f.cle, plusC(a.couts[f.cle], b.couts[f.cle])])) as Record<FamilleCout, MontantC>,
});

/** Les totaux de la fusion sur des mois : la part de chaque page, puis leur somme (la part non comptée par « Activité » : 0). PUR. */
export function totauxFusion(lignes: readonly LigneLocationCa[], gestion: readonly GestionMois[], ms: readonly MoisChoisi[], activite: ActiviteFusion = 'deux'): TotauxFusion {
  const tLocation = totauxLocation(lignesDesMois(lignes, ms));
  const tGestion = totauxGestion(gestion, ms);
  const location = activite === 'gestion' ? VIDE : partLocation(tLocation);
  const gest = activite === 'location' ? VIDE : partGestion(tGestion);
  return { activite, location, gestion: gest, ...somme(location, gest), tLocation, tGestion,
    baux: activite === 'gestion' ? null : tLocation.nb, lots: activite === 'location' ? null : tGestion.lots };
}

/** Le mois de gestion tel que la page Gestion le compte (`moisGestion`), pour le tableau et les fenêtres. PUR. */
export const moisDeGestion = (gestion: readonly GestionMois[], m: MoisChoisi): MoisGestionVu => moisGestion(gestion, m.annee, m.mois);

/** Les années de la fusion : celles de la location et de la gestion, et l'année en cours, croissantes. PUR. */
export const anneesFusion = (lignes: readonly LigneLocationCa[], gestion: readonly GestionMois[], jour: string): number[] =>
  [...new Set([Number(jour.slice(0, 4)), ...lignes.map((l) => l.annee), ...gestion.map((g) => g.annee)])].sort((a, b) => a - b);
