import type { MontantC } from './partAgence';
import type { Vente } from './modele';
import { ventesDeLAnnee, ventesDuMois } from './modele';
import { venteDansSociete } from './interCabinet';
import { celluleGlobalEn, type EntreesGlobalUnite } from './globalUnite';
import { coutsGlobaux, coutsVente, type EntreesCoutsGlobaux } from './coutsGlobal';

/**
 * ══ 🔴 LOT CG9 (Arno) — LE GRAPHIQUE DU CA GLOBAL : LES FILTRES PAR FAMILLE, SUR LES DONNÉES MÊMES DU BILAN (PUR) ════════════════════════════════════
 * Aucun calcul propre : chaque point (un mois, ou une année) est découpé en « atomes » — une structure, une activité, une famille de coûts (ou le CA) —
 * dont les montants sont les cellules des tableaux du Bilan : le CA de `celluleGlobalEn` (vente CRITERIMMO, vente MACJ, ventes à attribuer, location,
 * gestion ; l'inter-cabinet entre nos sociétés neutralisé une fois), les coûts de `coutsGlobaux` (location, gestion) et de `coutsVente` (la vente de
 * chaque société sur ses propres ventes, `venteDansSociete` : CRITERIMMO + MACJ = la page FUSION, au centime). Tout coché, la somme des atomes = les
 * totaux du Bilan ; Résultat net = CA − coûts de la même sélection ; N−1 = les mêmes filtres un an plus tôt.
 */
export type MesureGraphe = 'ca' | 'couts' | 'net';
/** 🔴 LOT CG10 (retrait autorisé par Arno) — plus de « Ventes à attribuer » : le graphique ne les compte plus (le Bilan, si). */
export type StructureGraphe = 'criterimmo' | 'macj';
export type ActiviteGraphe = 'vente' | 'location' | 'gestion';
export type FamilleGraphe = 'commissions' | 'apporteursVente' | 'exterieures' | 'apporteursLocation' | 'primes' | 'variable' | 'salairesLocation' | 'adhoc' | 'monga' | 'salairesGestion';
export type ComparerGraphe = 'n1' | 'structures' | 'activites' | 'familles' | 'rien';

export const MESURES_GRAPHE: readonly { cle: MesureGraphe; mot: string }[] = [{ cle: 'ca', mot: 'CA brut' }, { cle: 'couts', mot: 'Coûts' }, { cle: 'net', mot: 'Résultat net (CA − coûts)' }];
export const STRUCTURES_GRAPHE: readonly { cle: StructureGraphe; mot: string }[] = [{ cle: 'criterimmo', mot: 'CRITERIMMO' }, { cle: 'macj', mot: 'MACJ' }];
export const ACTIVITES_GRAPHE: readonly { cle: ActiviteGraphe; mot: string }[] = [{ cle: 'vente', mot: 'Vente' }, { cle: 'location', mot: 'Location' }, { cle: 'gestion', mot: 'Gestion' }];
export const FAMILLES_GRAPHE: readonly { cle: FamilleGraphe; mot: string; activite: ActiviteGraphe }[] = [
  { cle: 'commissions', mot: 'Commissions des négociateurs', activite: 'vente' }, { cle: 'apporteursVente', mot: 'Apporteurs vente', activite: 'vente' },
  { cle: 'exterieures', mot: 'Agences extérieures', activite: 'vente' }, { cle: 'apporteursLocation', mot: 'Apporteurs location', activite: 'location' },
  { cle: 'primes', mot: 'Primes de gestion', activite: 'location' }, { cle: 'variable', mot: 'Variable négociateur', activite: 'location' },
  { cle: 'salairesLocation', mot: 'Salaires location', activite: 'location' }, { cle: 'adhoc', mot: 'ADHOC', activite: 'gestion' },
  { cle: 'monga', mot: 'MONGA', activite: 'gestion' }, { cle: 'salairesGestion', mot: 'Salaires gestion', activite: 'gestion' },
];
export const COMPARER_GRAPHE: readonly { cle: ComparerGraphe; mot: string }[] = [{ cle: 'n1', mot: 'Année précédente' }, { cle: 'structures', mot: 'Structures entre elles' },
  { cle: 'activites', mot: 'Activités entre elles' }, { cle: 'familles', mot: 'Familles de coûts entre elles' }, { cle: 'rien', mot: 'Rien' }];

export interface FiltresGraphe { mesure: MesureGraphe; familles: FamilleGraphe[]; structures: StructureGraphe[]; activites: ActiviteGraphe[]; comparer: ComparerGraphe; cumul: boolean; empile: boolean;
  /** 🔴 LOT CG10 — « Location et Gestion : Séparées | Réunies » : réunies, une seule case et une seule série « Location & Gestion » (leur somme exacte). */
  reunies: boolean }
export const FILTRES_GRAPHE_DEFAUT: FiltresGraphe = { mesure: 'ca', familles: FAMILLES_GRAPHE.map((f) => f.cle), structures: STRUCTURES_GRAPHE.map((s) => s.cle),
  activites: ACTIVITES_GRAPHE.map((a) => a.cle), comparer: 'n1', cumul: false, empile: true, reunies: false };

/** Un atome d'un point : sa structure (ou « inter » : l'inter-cabinet entre nos sociétés, neutralisé), son activité, sa famille (null : le CA). */
export interface AtomeGraphe { structure: StructureGraphe | 'inter' | 'a_attribuer'; activite: ActiviteGraphe; famille: FamilleGraphe | null; m: MontantC }

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const cent = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0;

/** Les atomes d'un point (mois 1 → 12, ou l'année : mois null) : les cellules du Bilan, en HT et en TTC. PUR. */
export function atomesDuPoint(eG: EntreesGlobalUnite, eC: EntreesCoutsGlobaux, annee: number, mois: number | null, avecSalaires: boolean): AtomeGraphe[] {
  const ht = celluleGlobalEn(eG, annee, mois, 'ht'); const ttc = celluleGlobalEn(eG, annee, mois, 'ttc');
  const ca = (k: 'venteCriterimmoHt' | 'venteMacjHt' | 'aAttribuerHt' | 'interCabinetHt' | 'locationHt' | 'gestionHt'): MontantC => ({ htC: cent(ht[k] ?? 0), ttcC: cent(ttc[k] ?? 0) });
  const c = coutsGlobaux(eC, annee, mois, avecSalaires);
  // la vente de chaque société, sur ses propres ventes (la règle de sa page) : CRITERIMMO + MACJ = la page FUSION
  const ventes = eC.ventes.map((v) => (v.double === undefined || v.lignes === undefined ? { ...v, double: v.double ?? null, lignes: v.lignes ?? [] } : v)) as Vente[];
  const duPoint = mois === null ? ventesDeLAnnee(ventes, annee) : ventesDuMois(ventes, annee, mois);
  const o = { retros: eC.retrocessions, statutDuLibelle: eC.statutDuLibelle };
  const vente = (s: 'criterimmo' | 'macj') => coutsVente(duPoint.map((v) => venteDansSociete(v, s)).filter((v): v is Vente => v !== null), o, s);
  const vc = vente('criterimmo'); const vm = vente('macj');
  const a: AtomeGraphe[] = [
    { structure: 'criterimmo', activite: 'vente', famille: null, m: ca('venteCriterimmoHt') },
    { structure: 'macj', activite: 'vente', famille: null, m: ca('venteMacjHt') },
    { structure: 'a_attribuer', activite: 'vente', famille: null, m: ca('aAttribuerHt') },
    { structure: 'inter', activite: 'vente', famille: null, m: moins(RIEN, ca('interCabinetHt')) },
    { structure: 'criterimmo', activite: 'location', famille: null, m: ca('locationHt') },
    { structure: 'criterimmo', activite: 'gestion', famille: null, m: ca('gestionHt') },
  ];
  for (const [s, x] of [['criterimmo', vc], ['macj', vm]] as const) {
    a.push({ structure: s, activite: 'vente', famille: 'commissions', m: x.commissions }, { structure: s, activite: 'vente', famille: 'apporteursVente', m: x.apporteurs },
      { structure: s, activite: 'vente', famille: 'exterieures', m: x.exterieures });
  }
  if (c.location !== null) a.push({ structure: 'criterimmo', activite: 'location', famille: 'apporteursLocation', m: c.location.apporteurs },
    { structure: 'criterimmo', activite: 'location', famille: 'primes', m: c.location.primesDeduites }, { structure: 'criterimmo', activite: 'location', famille: 'variable', m: c.location.variableDeduit },
    { structure: 'criterimmo', activite: 'location', famille: 'salairesLocation', m: c.location.salaires });
  a.push({ structure: 'criterimmo', activite: 'gestion', famille: 'adhoc', m: c.gestion.adhoc }, { structure: 'criterimmo', activite: 'gestion', famille: 'monga', m: c.gestion.monga },
    { structure: 'criterimmo', activite: 'gestion', famille: 'salairesGestion', m: c.gestion.salaires });
  return a;
}

/** L'atome est-il retenu par les filtres ? L'inter-cabinet : seulement si CRITERIMMO ET MACJ (sinon il n'y a rien à neutraliser). PUR. */
export function retenu(x: AtomeGraphe, f: Pick<FiltresGraphe, 'structures' | 'activites' | 'familles' | 'mesure'>): boolean {
  // 🔴 LOT CG10 — les ventes à attribuer : jamais retenues (le graphique ne les compte plus ; la mention dit leur montant)
  if (x.structure === 'a_attribuer') return false;
  const struct = x.structure === 'inter' ? f.structures.includes('criterimmo') && f.structures.includes('macj') : f.structures.includes(x.structure);
  if (!struct || !f.activites.includes(x.activite)) return false;
  if (x.famille === null) return f.mesure !== 'couts';
  if (f.mesure === 'ca') return false;
  return f.mesure === 'net' || f.familles.includes(x.famille);
}
/** La valeur d'un atome dans la mesure : le CA (+), un coût (+ en « Coûts », − en « Résultat net »). PUR. */
const signe = (x: AtomeGraphe, mesure: MesureGraphe): MontantC => (x.famille !== null && mesure === 'net' ? moins(RIEN, x.m) : x.m);

/** Une série : sa clé, son nom, sa couleur (1 → 10, fixe pour un élément), ses montants. */
export interface SerieValeur { cle: string; nom: string; couleur: number; m: MontantC }
const COULEURS: Record<string, number> = { criterimmo: 1, macj: 2, inter: 4, vente: 1, location: 3, gestion: 5, location_gestion: 6,
  ...Object.fromEntries(FAMILLES_GRAPHE.map((f, i) => [f.cle, i + 1])) };
const NOMS: Record<string, string> = { ...Object.fromEntries([...STRUCTURES_GRAPHE, ...ACTIVITES_GRAPHE, ...FAMILLES_GRAPHE].map((x) => [x.cle, x.mot])), inter: 'Inter-cabinet (neutralisé)', total: 'Total',
  location_gestion: 'Location & Gestion' };

/** Les séries comparées : une par élément retenu (structures, activités ou familles), sinon le total seul. PUR. */
export function seriesDuPoint(atomes: readonly AtomeGraphe[], f: FiltresGraphe): { total: MontantC; series: SerieValeur[] } {
  const garde = atomes.filter((x) => retenu(x, f));
  const total = garde.reduce((t, x) => plus(t, signe(x, f.mesure)), RIEN);
  // 🔴 LOT CG10 — « Réunies » : la location et la gestion, une seule série « Location & Gestion » (leur somme exacte)
  const activiteDe = (a: ActiviteGraphe): string => (f.reunies && a !== 'vente' ? 'location_gestion' : a);
  const cleDe = (x: AtomeGraphe): string => (f.comparer === 'structures' ? x.structure : f.comparer === 'activites' ? activiteDe(x.activite) : f.comparer === 'familles' ? x.famille ?? 'ca' : 'total');
  const ordre = f.comparer === 'structures' ? [...f.structures, 'inter'] : f.comparer === 'activites' ? [...new Set(ACTIVITES_GRAPHE.map((a) => a.cle).filter((a) => f.activites.includes(a)).map(activiteDe))]
    : f.comparer === 'familles' ? FAMILLES_GRAPHE.map((x) => x.cle).filter((c) => f.familles.includes(c)) : ['total'];
  const parCle = new Map<string, MontantC>(ordre.map((c) => [c, RIEN]));
  for (const x of garde) { const c = cleDe(x); if (parCle.has(c)) parCle.set(c, plus(parCle.get(c)!, signe(x, f.mesure))); }
  const series = [...parCle].filter(([c, m]) => c !== 'inter' || m.htC !== 0 || m.ttcC !== 0)
    .map(([c, m]) => ({ cle: c, nom: NOMS[c] ?? c, couleur: COULEURS[c] ?? 1, m }));
  return { total, series };
}

/**
 * Les choix impossibles ou vides (grisés, avec leur raison) : MACJ n'a que de la vente ; les ventes à attribuer, aucun coût ; la location et la
 * gestion sont à CRITERIMMO ; une famille de coûts suit son activité ; « Familles de coûts entre elles » seulement en « Coûts » ; « Empilées /
 * Côte à côte » seulement avec plusieurs séries. null : le choix est possible. PUR.
 */
export function raisonGrise(f: FiltresGraphe, quoi: { sorte: 'structure'; cle: StructureGraphe } | { sorte: 'activite'; cle: ActiviteGraphe } | { sorte: 'famille'; cle: FamilleGraphe }
  | { sorte: 'comparer'; cle: ComparerGraphe } | { sorte: 'affichage' }): string | null {
  if (quoi.sorte === 'structure') {
    if (quoi.cle === 'macj' && !f.activites.includes('vente')) return 'MACJ n’a que de la vente : cochez « Vente ».';
    return null;
  }
  if (quoi.sorte === 'activite') return quoi.cle !== 'vente' && !f.structures.includes('criterimmo') ? 'La location et la gestion sont à CRITERIMMO : cochez « CRITERIMMO ».' : null;
  if (quoi.sorte === 'famille') {
    const a = FAMILLES_GRAPHE.find((x) => x.cle === quoi.cle)!.activite;
    return f.activites.includes(a) ? null : `Cette famille est de l’activité « ${ACTIVITES_GRAPHE.find((x) => x.cle === a)!.mot} » : cochez-la.`;
  }
  if (quoi.sorte === 'comparer') return quoi.cle === 'familles' && f.mesure !== 'couts' ? 'Seulement avec la mesure « Coûts ».' : null;
  return f.comparer === 'n1' || f.comparer === 'rien' ? 'Une seule série : choisissez une comparaison entre structures, activités ou familles.' : null;
}

/** Le nombre de filtres actifs (différents du réglage par défaut), pour « Filtres (n actifs) ». PUR. */
export function nbFiltresActifs(f: FiltresGraphe): number {
  const d = FILTRES_GRAPHE_DEFAUT; const egal = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
  return [f.mesure !== d.mesure, f.mesure === 'couts' && !egal(f.familles, d.familles), !egal(f.structures, d.structures), !egal(f.activites, d.activites), f.comparer !== d.comparer,
    f.cumul !== d.cumul, f.empile !== d.empile, f.reunies !== d.reunies].filter(Boolean).length;
}

/** Les filtres dans l'adresse (le partage) et leur relecture ; une valeur inconnue : le défaut. PUR. */
export function filtresVersAdresse(f: FiltresGraphe): Record<string, string | null> {
  const d = FILTRES_GRAPHE_DEFAUT; const liste = <T extends string>(xs: readonly T[], tout: readonly T[]): string | null => (xs.length === tout.length && tout.every((x) => xs.includes(x)) ? null : xs.join(',') || 'aucun');
  return { 'g-mesure': f.mesure === d.mesure ? null : f.mesure, 'g-familles': liste(f.familles, d.familles), 'g-structures': liste(f.structures, d.structures),
    'g-activites': liste(f.activites, d.activites), 'g-comparer': f.comparer === d.comparer ? null : f.comparer, 'g-cumul': f.cumul ? '1' : null, 'g-empile': f.empile ? null : 'non',
    'g-lg': f.reunies ? 'reunies' : null };
}
export function filtresDepuisAdresse(lire: (k: string) => string | null): FiltresGraphe {
  const d = FILTRES_GRAPHE_DEFAUT;
  const liste = <T extends string>(x: string | null, tout: readonly T[]): T[] => (x === null ? [...tout] : x === 'aucun' ? [] : x.split(',').filter((c): c is T => (tout as readonly string[]).includes(c)));
  const un = <T extends string>(x: string | null, tout: readonly T[], defaut: T): T => ((tout as readonly string[]).includes(x ?? '') ? (x as T) : defaut);
  return { mesure: un(lire('g-mesure'), MESURES_GRAPHE.map((x) => x.cle), d.mesure), familles: liste(lire('g-familles'), d.familles), structures: liste(lire('g-structures'), d.structures),
    activites: liste(lire('g-activites'), d.activites), comparer: un(lire('g-comparer'), COMPARER_GRAPHE.map((x) => x.cle), d.comparer), cumul: lire('g-cumul') === '1', empile: lire('g-empile') !== 'non',
    reunies: lire('g-lg') === 'reunies' };
}
/**
 * 🔴 LOT CG10 — « Réunies » : une seule case « Location & Gestion » ; la passer coche ou décoche les deux ensemble. En passant à « Réunies », une
 * sélection où une seule des deux était cochée les coche toutes deux (la case unique les représente ensemble). PUR.
 */
export function avecReunies(f: FiltresGraphe, reunies: boolean): FiltresGraphe {
  if (!reunies) return { ...f, reunies };
  const une = f.activites.includes('location') || f.activites.includes('gestion');
  const autres = f.activites.filter((a) => a === 'vente');
  return { ...f, reunies, activites: une ? [...autres, 'location', 'gestion'] : autres };
}

/**
 * ══ 🔴 LOT CG11 (Arno) — « MOIS À CONFIRMER » : LA FIN D'ANNÉE DU GRAPHIQUE = LE TOTAL DE L'ANNÉE ══════════════════════════════════════════════
 * Les ventes signées sans mois (« mois à confirmer ») comptent dans l'année (tuiles, Bilan) mais dans aucun mois : la somme des 12 mois du graphique
 * restait en deçà. Les atomes « hors mois » = ceux de l'année − la somme de ceux des 12 mois (le même découpage : structure, activité, famille), soit
 * ces ventes (CA et leurs coûts), et l'écart d'arrondi au centime éventuel. Ajoutés après décembre, ils font tomber la fin d'année sur le total
 * de l'année, au centime, pour tous les filtres. PUR.
 */
export function atomesHorsMois(annee: readonly AtomeGraphe[], mois: readonly (readonly AtomeGraphe[])[]): AtomeGraphe[] {
  const cle = (x: AtomeGraphe): string => `${x.structure}|${x.activite}|${x.famille ?? ''}`;
  const somme = new Map<string, MontantC>();
  for (const xs of mois) for (const x of xs) somme.set(cle(x), plus(somme.get(cle(x)) ?? RIEN, x.m));
  return annee.map((x) => ({ ...x, m: moins(x.m, somme.get(cle(x)) ?? RIEN) }));
}
/**
 * 🔴 LOT CG12 (Arno) — les points de l'axe des mois : les 12 mois, puis « Mois à confirmer » = les cellules d'un 13e « mois » qui ne contient que les
 * ventes signées sans mois (les mêmes règles et le même arrondi au centime qu'un mois) ; l'écart d'arrondi qui reste (l'année − la somme de ces
 * 13 points) est REPORTÉ, poste par poste, sur le dernier mois affiché (`dernier`, 1 → 12) qui a une valeur pour ce poste, sans point à part : la fin d'année = le total de l'année, au centime. PUR.
 */
export function atomesDesMois(eG: EntreesGlobalUnite, eC: EntreesCoutsGlobaux, annee: number, avecSalaires: boolean, dernier: number): { mois: AtomeGraphe[][]; aConfirmer: AtomeGraphe[] } {
  const mois = Array.from({ length: 12 }, (_, i) => atomesDuPoint(eG, eC, annee, i + 1, avecSalaires));
  const treize = <V extends { annee: number; mois: number | null }>(vs: readonly V[]): V[] => vs.map((v) => (v.annee === annee && v.mois === null ? { ...v, mois: MOIS_A_CONFIRMER } : v));
  const aConfirmer = atomesDuPoint({ ...eG, ventes: treize(eG.ventes) }, { ...eC, ventes: treize(eC.ventes) }, annee, MOIS_A_CONFIRMER, avecSalaires);
  const reste = atomesHorsMois(atomesDuPoint(eG, eC, annee, null, avecSalaires), [...mois, aConfirmer]);
  // chaque poste (structure, activité, famille) : sur le dernier mois affiché où il a une valeur (un mois vide reste à 0) ; à défaut, le dernier mois affiché
  const fin = Math.min(12, Math.max(1, dernier)) - 1;
  reste.forEach((r, j) => {
    if (r.m.htC === 0 && r.m.ttcC === 0) return;
    let i = fin; while (i > 0 && mois[i][j].m.htC === 0 && mois[i][j].m.ttcC === 0) i -= 1;
    if (mois[i][j].m.htC === 0 && mois[i][j].m.ttcC === 0) i = fin;
    mois[i][j] = { ...mois[i][j], m: plus(mois[i][j].m, r.m) };
  });
  return { mois, aConfirmer };
}
/** Le « mois » des ventes signées sans mois, après décembre (aucun mois réel : ni location ni gestion n'y tombent). */
const MOIS_A_CONFIRMER = 13;
