import { compromisPeriode, totauxPeriode, ventesPeriode, type MoisChoisi } from './periodeMois';
import { additionnerTotaux, moisAConfirmer, NOMS_MOIS, totaux, ventesDeLAnnee, type DonneesSociete, type ModeMois, type Retrocession, type Totaux, type Vente } from './modele';
import { resolveurDe } from './statutLigne';

/**
 * ══ 🔴 LOT DG (Arno, 31/10/2026) — « L'ANNÉE » À L'ÉCHELLE DE L'ANNÉE : une année, plusieurs années (Période) ou toutes (Tout) ════════════════════
 * Une année = la SOMME EXACTE de ses 12 mois de « Le mois » (`ventesPeriode`, `compromisPeriode`, `totauxPeriode` : les fonctions du mois, mois après
 * mois), PLUS ses ventes signées « mois à confirmer » (dans l'année, dans aucun mois — l'écart entre l'année et ses 12 mois, exactement) ; en mode
 * « Compromis », il n'y en a pas (un compromis se compte à sa date). Plusieurs années : leurs sommes. Aucune copie de calcul. PUR.
 */
export type DecoupageAnnees = 'annee' | 'periode' | 'tout';
export const DECOUPAGES_ANNEES: readonly DecoupageAnnees[] = ['annee', 'periode', 'tout'];

/** Les 12 mois de chacune des années. */
export const moisDesAnnees = (annees: readonly number[]): MoisChoisi[] => [...annees].sort((a, b) => a - b).flatMap((annee) => Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 })));
/** Les ventes signées « mois à confirmer » des années (aucune en mode « Compromis »). */
export const aConfirmerDesAnnees = (ventes: readonly Vente[], annees: readonly number[], mode: ModeMois = 'vendu'): Vente[] =>
  (mode === 'compromis' ? [] : [...annees].sort((a, b) => a - b).flatMap((a) => ventesDeLAnnee(ventes, a).filter(moisAConfirmer)));
/** Les ventes signées des années : leurs 12 mois, puis les « mois à confirmer » de chaque année. */
export const ventesDesAnnees = (ventes: readonly Vente[], annees: readonly number[]): Vente[] =>
  [...annees].sort((a, b) => a - b).flatMap((a) => [...ventesPeriode(ventes, moisDesAnnees([a])), ...aConfirmerDesAnnees(ventes, [a])]);
/** Les compromis des années selon le mode (à la date du compromis). */
export const compromisDesAnnees = (ventes: readonly Vente[], annees: readonly number[], mode: ModeMois): Vente[] => compromisPeriode(ventes, moisDesAnnees(annees), mode);
/** Ce que l'année additionne selon le mode : les ventes signées, les compromis, ou les deux (chaque affaire une fois, règle du mois). */
export const listeDesAnnees = (ventes: readonly Vente[], annees: readonly number[], mode: ModeMois): Vente[] =>
  (mode === 'vendu' ? ventesDesAnnees(ventes, annees) : mode === 'compromis' ? compromisDesAnnees(ventes, annees, mode) : [...ventesDesAnnees(ventes, annees), ...compromisDesAnnees(ventes, annees, mode)]);
/** Les rétrocessions saisies sur les années. */
export const retrosDesAnnees = (retros: readonly Retrocession[], annees: readonly number[]): Retrocession[] => retros.filter((r) => annees.includes(r.annee));

type DonneesTotaux = Pick<DonneesSociete, 'ventes' | 'retrocessions'> & Partial<Pick<DonneesSociete, 'societe' | 'statutsNegociateurs'>>;
/** Les totaux des années = la somme de leurs mois (`totauxPeriode`) + leurs ventes « mois à confirmer ». */
export function totauxDesAnnees(d: DonneesTotaux, annees: readonly number[], mode: ModeMois): Totaux {
  const t = totauxPeriode(d, moisDesAnnees(annees), mode);
  const c = aConfirmerDesAnnees(d.ventes, annees, mode);
  return c.length === 0 ? t : additionnerTotaux(t, totaux(c, [], d.societe ?? null, resolveurDe(d.statutsNegociateurs)));
}

/** Le nombre de mois « à date » d'une année : l'année en cours jusqu'au mois d'aujourd'hui, une année passée complète (12), une année future 0. */
export const moisADate = (annee: number, jour: string): number => {
  const a = Number(jour.slice(0, 4));
  return annee < a ? 12 : annee > a ? 0 : Number(jour.slice(5, 7));
};
/**
 * ══ 🔴 LOT DN (Arno, 31/10/2026) — LA BORNE DE FIN DU CUMUL : UNE SEULE FONCTION, PARTOUT (PUR) ══════════════════════════════════════════════════
 * Les tuiles de cumul (« CA … cumulé [année] », « CA net … cumulé », « Prévisionnel … »), l'encadré du graphique en Cumul au repos et « L'année »
 * (« à date ») cumulent de janvier au mois `fin` de cette borne ; N−1 : la MÊME borne sur l'année précédente.
 * - « Mois » : le mois sélectionné (même pour une année terminée) — « à fin [mois] » ;
 * - « Période » : le DERNIER mois sélectionné de l'année — « à fin [mois] » ;
 * - « Année » : une année terminée, COMPLÈTE (12) — « année complète » ; l'année en cours, jusqu'au mois en cours — « à fin [mois en cours] » ;
 *   une année future : rien (0) — « rien encore ». Le mois de l'adresse n'est PAS une borne en « Année ».
 * Aucune règle de calcul ne change : seule la borne.
 */
export type DecoupageCumul = 'mois' | 'periode' | 'annee';
export interface BorneCumul {
  /** Le dernier mois cumulé (1 → 12) ; 0 : aucun. */
  fin: number;
  /** « à fin août », « année complète », « rien encore ». */
  mot: string;
}
export function borneCumul(decoupage: DecoupageCumul, annee: number, mois: number, moisChoisis: readonly number[] | null, jour: string): BorneCumul {
  const aFin = (k: number): BorneCumul => ({ fin: k, mot: `à fin ${NOMS_MOIS[k - 1].toLowerCase()}` });
  if (decoupage === 'mois') return aFin(mois);
  if (decoupage === 'periode') return aFin(moisChoisis !== null && moisChoisis.length > 0 ? Math.max(...moisChoisis) : mois);
  const k = moisADate(annee, jour);
  return k === 12 ? { fin: 12, mot: 'année complète' } : k === 0 ? { fin: 0, mot: 'rien encore' } : aFin(k);
}
/** Le cumul (janvier → `fin`) d'une série cumulée mois par mois ; 0 : rien. PUR. */
export const cumulA = (cumules: readonly number[], fin: number): number => (fin <= 0 ? 0 : cumules[fin - 1] ?? 0);

/**
 * « À date » : une année passée = l'année complète (ses « mois à confirmer » compris) ; l'année en cours = ses mois de janvier au mois d'aujourd'hui
 * (`nbMois`), sans les « mois à confirmer » (non datés). La même règle pour l'année précédente : les MÊMES mois (`nbMois` de l'année affichée).
 */
export const listeADate = (ventes: readonly Vente[], annee: number, nbMois: number, mode: ModeMois): Vente[] => {
  if (nbMois >= 12) return listeDesAnnees(ventes, [annee], mode);
  const ms = Array.from({ length: nbMois }, (_, i) => ({ annee, mois: i + 1 }));
  return mode === 'vendu' ? ventesPeriode(ventes, ms) : mode === 'compromis' ? compromisPeriode(ventes, ms, mode) : [...ventesPeriode(ventes, ms), ...compromisPeriode(ventes, ms, mode)];
};

/** Les années de l'adresse (« 2024,2026 »), parmi celles disponibles, croissantes, sans doublon ; null : absentes ou aucune valable. */
export function lireAnnees(x: string | null, disponibles: readonly number[]): number[] | null {
  if (x === null) return null;
  const a = [...new Set(x.split(',').map((p) => Number(p.trim())).filter((n) => Number.isInteger(n) && disponibles.includes(n)))].sort((p, q) => p - q);
  return a.length === 0 ? null : a;
}
export const ecrireAnnees = (annees: readonly number[]): string => [...annees].sort((a, b) => a - b).join(',');
/** Cocher / décocher une année ; la dernière ne se retire pas (`refus`). */
export function basculerAnnee(annees: readonly number[], a: number): { annees: number[]; refus: boolean } {
  if (!annees.includes(a)) return { annees: [...annees, a].sort((p, q) => p - q), refus: false };
  if (annees.length === 1) return { annees: [...annees], refus: true };
  return { annees: annees.filter((x) => x !== a), refus: false };
}

/**
 * L'état de « L'année » à l'arrivée : `vue-annee` (annee | periode | tout) et `annees` (Période), `annee` (l'année montrée) ; un ANCIEN lien
 * « Début / Fin » s'ouvre aussi : la même année (Année), sinon les années de Début à Fin (Période). Sans rien : l'année en cours (ou la dernière).
 */
export function anneesInitiales(p: { vueAnnee: string | null; annees: string | null; annee: string | null; debut: string | null; fin: string | null }, disponibles: readonly number[], jour: string):
  { decoupage: DecoupageAnnees; annees: number[]; annee: number } {
  const dernier = disponibles.at(-1) ?? Number(jour.slice(0, 4));
  const enCours = disponibles.includes(Number(jour.slice(0, 4))) ? Number(jour.slice(0, 4)) : dernier;
  const un = (x: string | null): number | null => { const n = Number(x); return x !== null && Number.isInteger(n) && disponibles.includes(n) ? n : null; };
  const annee = un(p.annee);
  if (p.vueAnnee === 'tout') return { decoupage: 'tout', annees: [...disponibles], annee: annee ?? enCours };
  const liste = lireAnnees(p.annees, disponibles);
  if (p.vueAnnee === 'periode' && liste !== null) return { decoupage: 'periode', annees: liste, annee: annee !== null && liste.includes(annee) ? annee : liste.at(-1)! };
  if (p.vueAnnee === null && annee === null) {
    const [d, f] = [un(p.debut), un(p.fin)];
    if (d !== null || f !== null) {
      const [a, b] = [d ?? disponibles[0], f ?? dernier].sort((x, y) => x - y);
      const plage = disponibles.filter((x) => x >= a && x <= b);
      return plage.length === 1 ? { decoupage: 'annee', annees: plage, annee: plage[0] } : { decoupage: 'periode', annees: plage, annee: plage.at(-1)! };
    }
  }
  const a = annee ?? enCours;
  return { decoupage: 'annee', annees: [a], annee: a };
}
