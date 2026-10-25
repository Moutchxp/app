import { regleAnnexesDe, type RegleAnnexes } from './annexesGestion';
import {
  apporteursEtCollegues, caLigne, gestionDuMois, gestionSurMois, NATURES_BIEN, resultatNetAgence, resumeDuMois, sectionNegociateurs, totauxPeriode,
  ventilationCommissions, type ActiviteCalcul, type ActiviteLue, type CascadeNegociateur, type ContexteCalcul, type DonneesTableau, type EcartFichier,
  type GestionDepuisJanvier, type LigneGestion, type ResultatNetAgence, type ResumeDuMois, type VentilationCommissions,
} from './tableauBord';
import { gliDuMois, type GliComptee, type GliPeriode } from './margeGli';

/**
 * ══ 🔴 Arno (25/10/2026) — LE « RÉSUMÉ » D'UNE PÉRIODE : UN MOIS (Suivi du mois) OU UNE ANNÉE (Suivi annuel) ═══════════════════════════════
 * Le résumé d'un mois est calculé UNE fois, ici (`resumeDuMoisComplet`), exactement comme le faisait la feuille du mois ; le résumé d'une
 * année est la SOMME de ses mois (`resumeDesMois`) : chaque montant annuel = la somme des montants mensuels AFFICHÉS, au centime, par
 * construction (les montants s'additionnent en centimes). Les gains de gestion s'additionnent mois par mois, sans effet boule de neige ;
 * le variable d'un négociateur = la somme de ses variables mensuels (le taux lu à la date de signature de chaque dossier, comme le mois).
 * Confidentialité : un administrateur additionne les cascades de tous ; un autre compte, SES seules cascades mensuelles reçues du serveur
 * (`variablesPropres`) ; rien d'autre n'existe côté navigateur. PUR.
 */
export interface ResumeCalcule {
  /** Les mois « AAAA-MM » de la période. */
  mois: string[];
  /** Les dossiers de la période (ceux du CA HT global). */
  dossiers: ActiviteLue[];
  ids: (number | string)[];
  r: ResumeDuMois;
  ventilation: VentilationCommissions;
  net: ResultatNetAgence;
  /** Les cascades montrées : celles de tous (administrateur), la sienne (son variable, reçu du serveur), ou aucune. */
  negociateurs: CascadeNegociateur[];
  gli: GliPeriode;
  /** Les gestions perdues notées dans le suivi mensuel (une note les dit). */
  pertesFichier: boolean;
  ecarts: EcartFichier[];
}

/** Le résumé d'UN mois « AAAA-MM » — les calculs de la feuille du mois, à l'identique. */
export function resumeDuMoisComplet(d: DonneesTableau, lignes: readonly ActiviteLue[], ctx: ContexteCalcul, cle: string, negociateur: string | null): ResumeCalcule {
  const [annee, mois] = cle.split('-').map(Number);
  const duMois = lignes.filter((a) => a.dateSignature.startsWith(cle));
  const t = totauxPeriode(lignes, ctx, { annee, mois }, negociateur);
  const negos = d.voirCommissions ? sectionNegociateurs(lignes, ctx, { annee, mois }) : [];
  const regleA = regleAnnexesDe(d);
  const g = gestionDuMois(d.gestionLignes ?? [], cle, regleA);
  const r = resumeDuMois(t, duMois, g, negos, ctx);
  const ac = apporteursEtCollegues(duMois, ctx.apporteurs, { lignes: ctx.recurrents ?? [], mois: [cle], aujourdhui: ctx.aujourdhui ?? d.aujourdhui });
  const ventilation = ventilationCommissions(ac, t, duMois, ctx, cle);
  const propre = d.variablesPropres?.[cle];
  return {
    mois: [cle], dossiers: duMois, ids: t.ids, r, ventilation, net: resultatNetAgence(r, t, d.voirCommissions === true, ventilation),
    negociateurs: d.voirCommissions ? r.negociateurs : propre !== undefined ? [propre] : [],
    gli: gliDuMois(d.gli ?? [], d.margesGli ?? [], cle),
    pertesFichier: g.perdues.some((l) => l.origine === 'fichier'),
    ecarts: (d.ecartsFichier ?? []).filter((e) => e.mois === cle),
  };
}

const cent = (x: number): number => Math.round((x + Number.EPSILON) * 100);
/** La somme des montants AFFICHÉS (chacun au centime), rendue en euros. */
const sommeAffichee = (xs: readonly number[]): number => xs.reduce((s, x) => s + cent(x), 0) / 100;

function sommerVentilation(vs: readonly VentilationCommissions[]): VentilationCommissions {
  const ligne = (k: keyof VentilationCommissions) => {
    const parCle = new Map<string, { cle: string; nom: string; centimes: number }>();
    for (const v of vs) for (const b of v[k].detail) {
      const x = parCle.get(b.cle) ?? { cle: b.cle, nom: b.nom, centimes: 0 };
      x.centimes += b.centimes; parCle.set(b.cle, x);
    }
    return { centimes: vs.reduce((s, v) => s + v[k].centimes, 0),
      detail: [...parCle.values()].filter((b) => b.centimes !== 0).sort((p, q) => q.centimes - p.centimes || p.nom.localeCompare(q.nom)) };
  };
  return { externes: ligne('externes'), internes: ligne('internes'), collegues: ligne('collegues') };
}

/** Les cascades d'un même négociateur sur plusieurs mois, additionnées (chaque montant mensuel est déjà au centime). */
export function sommerCascades(xs: readonly CascadeNegociateur[]): CascadeNegociateur {
  const s = (k: 'ca' | 'deductions' | 'net' | 'resultatCalcule' | 'resultat' | 'primes' | 'retrocessions' | 'variable' | 'recurrents'): number =>
    xs.reduce((t, x) => t + cent(x[k]), 0) / 100;
  const dossiers = xs.flatMap((x) => x.dossiers);
  const taux = [...new Set(dossiers.map((d) => d.taux))];
  return { cle: xs[0].cle, libelle: xs[0].libelle, dossiers, ca: s('ca'), deductions: s('deductions'), net: s('net'), taux: taux.length === 1 ? taux[0] : null,
    resultatCalcule: xs.reduce((t, x) => t + x.resultatCalcule, 0), resultat: s('resultat'), primes: s('primes'), retrocessions: s('retrocessions'),
    retroDetail: xs.flatMap((x) => x.retroDetail), variable: s('variable'), recurrents: xs.reduce((t, x) => t + x.recurrents, 0) };
}

/** Le résumé d'une période de plusieurs mois : la somme de ses mois (au centime affiché). */
export function resumeDesMois(ms: readonly ResumeCalcule[]): ResumeCalcule {
  const r0 = ms.map((m) => m.r);
  const ca = sommeAffichee(r0.map((r) => r.resultat.ca));
  const part = (x: number): number | null => (ca === 0 ? null : x / ca);
  const r: ResumeDuMois = {
    resultat: { ca, apporteurs: sommeAffichee(r0.map((r) => r.resultat.apporteurs)), collegues: sommeAffichee(r0.map((r) => r.resultat.collegues)),
      caNet: sommeAffichee(r0.map((r) => r.resultat.caNet)) },
    parStatut: NATURES_BIEN.map((nature) => {
      const xs = r0.map((r) => r.parStatut.find((p) => p.nature === nature)!);
      const c = sommeAffichee(xs.map((x) => x.ca));
      return { nature, nb: xs.reduce((s, x) => s + x.nb, 0), ca: c, part: part(c), ids: xs.flatMap((x) => x.ids) };
    }),
    gestion: (() => {
      const avec = sommeAffichee(r0.map((r) => r.gestion.avec.ca)); const sans = sommeAffichee(r0.map((r) => r.gestion.sans.ca));
      return { avec: { nb: r0.reduce((s, r) => s + r.gestion.avec.nb, 0), ca: avec, part: part(avec) }, sans: { nb: r0.reduce((s, r) => s + r.gestion.sans.nb, 0), ca: sans, part: part(sans) } };
    })(),
    portefeuille: (() => {
      // Les gains et pertes mensuels additionnés UNE fois (pas d'effet boule de neige) ; / an = × 12.
      const gagne = r0.reduce((s, r) => s + r.portefeuille.gagnes.mensuel, 0); const perdu = r0.reduce((s, r) => s + r.portefeuille.perdus.mensuel, 0);
      return { gagnes: { nb: r0.reduce((s, r) => s + r.portefeuille.gagnes.nb, 0), mensuel: gagne, annuel: gagne * 12 },
        perdus: { nb: r0.reduce((s, r) => s + r.portefeuille.perdus.nb, 0), mensuel: perdu, annuel: perdu * 12 },
        solde: { mensuel: gagne - perdu, annuel: (gagne - perdu) * 12 }, sansLoyer: r0.reduce((s, r) => s + r.portefeuille.sansLoyer, 0) };
    })(),
    negociateurs: [], primes: sommeAffichee(r0.map((r) => r.primes)), retrocessions: sommeAffichee(r0.map((r) => r.retrocessions)),
    annexesLouees: r0.reduce((s, r) => s + r.annexesLouees, 0),
  };
  // Les cascades : un négociateur = la somme de SES mois (dans l'ordre de première apparition).
  const parNego = new Map<string, CascadeNegociateur[]>();
  for (const m of ms) for (const x of m.negociateurs) parNego.set(x.cle, [...(parNego.get(x.cle) ?? []), x]);
  const negociateurs = [...parNego.values()].map(sommerCascades);
  r.negociateurs = negociateurs;
  const ventilation = sommerVentilation(ms.map((m) => m.ventilation));
  const nets = ms.map((m) => m.net);
  const voir = nets.every((x) => x.net !== null) && nets.length > 0;
  const parVar = new Map<string, { cle: string; libelle: string; variable: number }>();
  for (const n of nets) for (const v of n.variables) {
    const x = parVar.get(v.cle) ?? { cle: v.cle, libelle: v.libelle, variable: 0 };
    x.variable += v.variable; parVar.set(v.cle, x);
  }
  const caC = nets.reduce((s, n) => s + n.ca, 0);
  const netC = voir ? nets.reduce((s, n) => s + (n.net ?? 0), 0) : null;
  const net: ResultatNetAgence = { ca: caC, apporteurs: nets.reduce((s, n) => s + n.apporteurs, 0), apporteursRecurrents: nets.reduce((s, n) => s + n.apporteursRecurrents, 0),
    collegues: nets.reduce((s, n) => s + n.collegues, 0), colleguesRecurrents: nets.reduce((s, n) => s + n.colleguesRecurrents, 0),
    variables: voir ? [...parVar.values()] : [], net: netC, part: netC === null || caC === 0 ? null : netC / caC, ventilation };
  const gli: GliComptee[] = ms.flatMap((m) => m.gli.gli);
  const mensuelGli = ms.reduce((s, m) => s + m.gli.mensuel, 0);
  return {
    mois: ms.flatMap((m) => m.mois), dossiers: ms.flatMap((m) => m.dossiers), ids: ms.flatMap((m) => m.ids), r, ventilation, net, negociateurs,
    gli: { nb: gli.length, mensuel: mensuelGli, annuel: mensuelGli * 12, gli, sansLoyer: ms.reduce((s, m) => s + m.gli.sansLoyer, 0), sansMarge: ms.reduce((s, m) => s + m.gli.sansMarge, 0) },
    pertesFichier: ms.some((m) => m.pertesFichier), ecarts: ms.flatMap((m) => m.ecarts),
  };
}

/** Les mois « AAAA-MM » de janvier de `annee` au mois `moisFin` inclus. */
export const moisDeLAnnee = (annee: number, moisFin: number): string[] =>
  Array.from({ length: moisFin }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);

/** Le résumé de l'année : janvier → `moisFin` (l'année en cours : jusqu'au mois choisi ; une année passée : 12). */
export function resumeDeLAnnee(d: DonneesTableau, lignes: readonly ActiviteLue[], ctx: ContexteCalcul, annee: number, moisFin: number, negociateur: string | null): ResumeCalcule {
  return resumeDesMois(moisDeLAnnee(annee, moisFin).map((m) => resumeDuMoisComplet(d, lignes, ctx, m, negociateur)));
}

/**
 * « Depuis le début (<première année>) » : les entrées et sorties de gestion de janvier de la première année d'activité à la fin de la
 * période, la même grille et le même calcul que « Depuis le 1er janvier » (gains mensuels additionnés une fois).
 */
export function gestionDepuisLeDebut(lignes: readonly LigneGestion[], premiere: number, annee: number, moisFin: number, regle: RegleAnnexes): GestionDepuisJanvier {
  const mois: string[] = [];
  for (let a = premiere; a <= annee; a++) mois.push(...moisDeLAnnee(a, a === annee ? moisFin : 12));
  return gestionSurMois(lignes, mois, regle);
}

/** Les dossiers d'une période sous forme de lignes de la cascade du résultat net. */
export const dossiersCascade = (xs: readonly ActiviteCalcul[]) =>
  xs.map((a) => ({ id: a.id, libelle: [a.libelleProprietaire, a.libelleLocataire].filter((x) => x).join(' / ') || `Dossier ${a.id}`, ca: caLigne(a) }));
