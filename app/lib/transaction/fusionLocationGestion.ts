import type { GestionMois } from './modele';
import type { MontantC } from './partAgence';
import { motSalairesASaisir, nbMoisSalairesASaisir, type MoisChoisi } from './periodeMois';
import { aSaisirGestion, moisGestion, totauxGestion, type MoisGestionVu, type TotauxGestion } from './gestionVue';
import { coutsLocationMois, lignesDesMois, plusC, salairesLocationDuMois, totauxLocation, type DuLocationMois, type LigneLocationCa, type RetroLocation, type SalairesLocation, type TotauxLocationCa } from './locationCa';
import { montantSaisi, type CoutSaisi } from './coutsSaisis';

/**
 * ══ 🔴 LOT LG1 (Arno, 01/11/2026) — « FUSION LOCATION & GESTION » : LE CUMUL DES DEUX ACTIVITÉS (PUR) ═════════════════════════════════════════════
 * AUCUN CALCUL PROPRE : la part LOCATION est `totauxLocation` (la page Location : chaque ligne au centime, `sommesLocation`), la part GESTION est
 * `totauxGestion` (la page Gestion : chaque mois au centime, TTC à ses taux, salaires chargés sans TVA). La fusion n'additionne que leurs
 * centimes : chaque part = sa page d'origine, et CA net = CA brut − coûts, au centime, en HT et en TTC (vrai dans chaque page, donc dans la somme).
 * « Activité » : les deux (défaut), la location seule, la gestion seule — une partition exacte (l'autre part compte 0).
 */
export type ActiviteFusion = 'deux' | 'location' | 'gestion';
export const ACTIVITES_FUSION: readonly ActiviteFusion[] = ['deux', 'location', 'gestion'];
export const LIBELLE_ACTIVITE_FUSION: Record<ActiviteFusion, string> = { deux: 'Les deux', location: 'Location', gestion: 'Gestion' };
export const estActiviteFusion = (x: unknown): x is ActiviteFusion => x === 'deux' || x === 'location' || x === 'gestion';

/**
 * Les familles de coûts, dans l'ordre comptable : la location (primes, apporteurs, variable du négociateur, ses salaires chargés), puis la gestion
 * (ADHOC, MONGA, ses salaires chargés). 🔴 LOT LO11 — « Coûts salariaux chargés » devient « Salaires chargés » ; le variable et les salaires de la
 * Location s'ajoutent.
 */
export type FamilleCout = 'primes' | 'apporteurs' | 'variable' | 'salairesLocation' | 'adhoc' | 'monga' | 'salaries'
  // 🔴 « Les coûts » (03/11/2026) — C19 option A : les dus du module Location ; lot 2 : les « Autres » saisis
  | 'partGestion' | 'collegues' | 'autresLocation' | 'autresGestion';
export const FAMILLES_COUTS: readonly { cle: FamilleCout; libelle: string; activite: 'location' | 'gestion' }[] = [
  { cle: 'primes', libelle: 'Primes de nouvelle gestion', activite: 'location' },
  { cle: 'apporteurs', libelle: 'Commissions d’apporteurs', activite: 'location' },
  { cle: 'variable', libelle: 'Variable du négociateur', activite: 'location' },
  { cle: 'salairesLocation', libelle: 'Salaires chargés — location', activite: 'location' },
  { cle: 'adhoc', libelle: 'Coût ADHOC', activite: 'gestion' },
  { cle: 'monga', libelle: 'Coût MONGA', activite: 'gestion' },
  { cle: 'salaries', libelle: 'Salaires chargés — gestion', activite: 'gestion' },
  { cle: 'partGestion', libelle: 'Part de gestion versée aux apporteurs', activite: 'location' },
  { cle: 'collegues', libelle: 'Rémunération des collègues apporteurs', activite: 'location' },
  { cle: 'autresLocation', libelle: 'Autres — location', activite: 'location' },
  { cle: 'autresGestion', libelle: 'Autres — gestion', activite: 'gestion' },
];

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const familles0 = (): Record<FamilleCout, MontantC> => ({ primes: RIEN, apporteurs: RIEN, variable: RIEN, salairesLocation: RIEN, adhoc: RIEN, monga: RIEN, salaries: RIEN,
  partGestion: RIEN, collegues: RIEN, autresLocation: RIEN, autresGestion: RIEN });
/**
 * Une part d'activité : CA brut ; `couts` : le montant de chaque famille (montré) ; `deduits` : ce qui en est déduit (🔴 LOT LO11 : les primes et le
 * variable d'un mois avec salaires chargés sont « inclus dans les salaires », non déduits ; en « Sans salaires », les salaires ne sont pas comptés) ;
 * `coutsTotal` = Σ `deduits` ; CA net = CA − `coutsTotal` (centimes HT et TTC).
 */
export interface PartFusion { ca: MontantC; couts: Record<FamilleCout, MontantC>; deduits: Record<FamilleCout, MontantC>; coutsTotal: MontantC; net: MontantC }
export interface TotauxFusion {
  activite: ActiviteFusion;
  /** 🔴 LOT LG2 — « Avec salaires » : les salaires chargés sont comptés ; « Sans salaires » : ni dans les coûts, ni déduits (montrés « non comptés »). */
  salaires: boolean;
  location: PartFusion; gestion: PartFusion;
  /** Les totaux des parts comptées (la somme des deux, ou une seule). */
  ca: MontantC; couts: Record<FamilleCout, MontantC>; deduits: Record<FamilleCout, MontantC>; coutsTotal: MontantC; net: MontantC;
  /** 🔴 LOT LO11 — les primes et le variable montrés mais NON déduits (« inclus dans les salaires ») : leur montant, et le nombre de mois concernés. */
  inclus: { primes: MontantC; variable: MontantC; mois: number };
  /** Les détails des pages d'origine (pour le volume, les parts propriétaire / locataire, les mois saisis). */
  tLocation: TotauxLocationCa; tGestion: TotauxGestion;
  /** Baux signés (location) ; lots gérés (gestion : ceux du mois, ou leur moyenne) ; null : activité non comptée. */
  baux: number | null; lots: number | null;
}
const somme = (a: Record<FamilleCout, MontantC>, b: Record<FamilleCout, MontantC>): Record<FamilleCout, MontantC> =>
  Object.fromEntries(FAMILLES_COUTS.map((f) => [f.cle, plusC(a[f.cle], b[f.cle])])) as Record<FamilleCout, MontantC>;
const total = (r: Record<FamilleCout, MontantC>): MontantC => FAMILLES_COUTS.reduce((s, f) => plusC(s, r[f.cle]), RIEN);
const part = (ca: MontantC, couts: Record<FamilleCout, MontantC>, deduits: Record<FamilleCout, MontantC>): PartFusion => {
  const coutsTotal = total(deduits);
  return { ca, couts, deduits, coutsTotal, net: { htC: ca.htC - coutsTotal.htC, ttcC: ca.ttcC - coutsTotal.ttcC } };
};
const VIDE: PartFusion = part(RIEN, familles0(), familles0());
const additionner = (a: PartFusion, b: PartFusion): PartFusion => part(plusC(a.ca, b.ca), somme(a.couts, b.couts), somme(a.deduits, b.deduits));

/** La part gestion d'un mois : la page Gestion (`moisGestion` : ADHOC, MONGA, salaires chargés sans TVA) ; « Sans salaires » : salaires non comptés. PUR. */
export function partGestionMois(g: MoisGestionVu, salaires = true): PartFusion {
  const couts = { ...familles0(), adhoc: { htC: g.adhocC, ttcC: g.adhocTtcC }, monga: { htC: g.mongaC, ttcC: g.mongaTtcC }, salaries: { htC: g.salariesC, ttcC: g.salariesC } };
  return part({ htC: g.honorairesC, ttcC: g.honorairesTtcC }, couts, salaires ? couts : { ...couts, salaries: RIEN });
}

/**
 * ══ 🔴 LOT LO11 (règle d'Arno) — LES TOTAUX DE LA FUSION, MOIS PAR MOIS ═════════════════════════════════════════════════════════════════════
 * Chaque mois, la location à la règle de sa page (`coutsLocationMois` : apporteurs + primes + variable, ou apporteurs + ses salaires chargés) et la
 * gestion à celle de la sienne (`moisGestion`). 🔴 LOT LO15 (règle d'Arno) — les primes et le variable sont payés au négociateur de la location, dont
 * le salaire est saisi dans les salaires chargés de la LOCATION : « Avec salaires », ils ne sont « inclus dans les salaires » (non déduits) QUE les
 * mois où les salaires de la LOCATION sont saisis ; les salaires de la Gestion (d'autres personnes) restent un coût de la Gestion, sans effet sur eux
 * (remplace les règles des lots LG4 / LO11). « Sans salaires » : aucun salaire compté, primes et variable toujours déduits. Ainsi la FUSION = la
 * page Location + la page Gestion, au centime, chaque mois. Une période = la somme de ses mois. PUR.
 */
export function totauxFusion(lignes: readonly LigneLocationCa[], gestion: readonly GestionMois[], ms: readonly MoisChoisi[], activite: ActiviteFusion = 'deux', salaires = true,
  loc: { retros: readonly RetroLocation[]; salaires: readonly SalairesLocation[] | null;
    /** 🔴 « Les coûts » — les dus du module Location (C19 option A) et les coûts saisis (« Autres ») ; absents : 0. */
    dus?: readonly DuLocationMois[] | null; saisis?: readonly CoutSaisi[] } = { retros: [], salaires: null }): TotauxFusion {
  let location = VIDE; let gest = VIDE;
  const inclus = { primes: RIEN, variable: RIEN, mois: 0 };
  for (const m of ms) {
    const g = moisGestion(gestion, m.annee, m.mois);
    if (activite !== 'gestion') {
      const salL = salairesLocationDuMois(loc.salaires, m.annee, m.mois);
      // 🔴 LOT LO15 — la règle de la page Location, telle quelle (`coutsLocationMois`, « Avec | Sans salaires ») : primes et variable « inclus » les
      // seuls mois où les salaires chargés de la LOCATION sont saisis ; les salaires de la Gestion n'y jouent plus
      const c = coutsLocationMois(lignesDesMois(lignes, [m]), loc.retros.filter((r) => r.annee === m.annee && r.mois === m.mois), salL, salaires,
        loc.dus?.find((d) => d.annee === m.annee && d.mois === m.mois) ?? null);
      const incl = c.moisAvecSalaires > 0;
      const autresL = montantSaisi(loc.saisis ?? [], { famille: 'location', poste: 'autres', ms: [m] });
      const couts = { ...familles0(), primes: c.primes, apporteurs: c.apporteurs, variable: c.variable, salairesLocation: c.salairesSaisis, partGestion: c.partGestion, collegues: c.collegues,
        autresLocation: autresL };
      const deduits = { ...couts, primes: c.primesDeduites, variable: c.variableDeduit, salairesLocation: c.salaires };
      location = additionner(location, part(c.ca, couts, deduits));
      if (incl && (c.primes.htC !== 0 || c.variable.htC !== 0)) { inclus.primes = plusC(inclus.primes, c.primes); inclus.variable = plusC(inclus.variable, c.variable); inclus.mois += 1; }
    }
    if (activite !== 'location') {
      const autresG = montantSaisi(loc.saisis ?? [], { famille: 'gestion', poste: 'autres', ms: [m] });
      gest = additionner(gest, additionner(partGestionMois(g, salaires), part(RIEN, { ...familles0(), autresGestion: autresG }, { ...familles0(), autresGestion: autresG })));
    }
  }
  const tLocation = totauxLocation(lignesDesMois(lignes, ms));
  const tGestion = totauxGestion(gestion, ms);
  const t = additionner(location, gest);
  return { activite, salaires, location, gestion: gest, ca: t.ca, couts: t.couts, deduits: t.deduits, coutsTotal: t.coutsTotal, net: t.net, inclus, tLocation, tGestion,
    baux: activite === 'gestion' ? null : tLocation.nb, lots: activite === 'location' ? null : tGestion.lots };
}

/** Le mois de gestion tel que la page Gestion le compte (`moisGestion`), pour le tableau et les fenêtres. PUR. */
export const moisDeGestion = (gestion: readonly GestionMois[], m: MoisChoisi): MoisGestionVu => moisGestion(gestion, m.annee, m.mois);

/** Les années de la fusion : celles de la location et de la gestion, et l'année en cours, croissantes. PUR. */
export const anneesFusion = (lignes: readonly LigneLocationCa[], gestion: readonly GestionMois[], jour: string): number[] =>
  [...new Set([Number(jour.slice(0, 4)), ...lignes.map((l) => l.annee), ...gestion.map((g) => g.annee)])].sort((a, b) => a - b);

/**
 * 🔴 LOT LO15 — les mois « à saisir » d'une période de la FUSION : ceux de la Location (ses salaires chargés) et ceux de la Gestion (la case
 * salarié), selon l'activité comptée ; et le mot de l'encadré et des fenêtres (vide : rien à saisir). PUR.
 */
export function aSaisirFusion(gestion: readonly GestionMois[], salairesLoc: readonly SalairesLocation[] | null, ms: readonly MoisChoisi[], activite: ActiviteFusion, jour: string): { location: number; gestion: number; mot: string } {
  const location = activite === 'gestion' ? 0 : nbMoisSalairesASaisir(ms, (m) => salairesLocationDuMois(salairesLoc, m.annee, m.mois) !== null, jour);
  const gest = activite === 'location' ? 0 : aSaisirGestion(gestion, ms, jour);
  const mot = activite === 'deux' ? [location > 0 ? `location : ${motSalairesASaisir(location)}` : '', gest > 0 ? `gestion : ${motSalairesASaisir(gest)}` : ''].filter(Boolean).join(' · ')
    : location + gest > 0 ? motSalairesASaisir(location + gest) : '';
  return { location, gestion: gest, mot };
}
