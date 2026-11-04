import type { MontantC } from './partAgence';
import type { Vente } from './modele';
import { ventesDeLAnnee, ventesDuMois } from './modele';
import { venteDansSociete } from './interCabinet';
import { celluleGlobalEn, type EntreesGlobalUnite } from './globalUnite';
import { coutsGlobaux, coutsVente, type CoutsVente, type EntreesCoutsGlobaux } from './coutsGlobal';
import { espaceNegociateurs } from './carteAffaireLignes';
import { coutsLocation } from './locationCa';
import { montantSaisi } from './coutsSaisis';

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
export type FamilleGraphe = 'commissions' | 'apporteursVente' | 'exterieures' | 'apporteursLocation' | 'primes' | 'variable' | 'salairesLocation' | 'adhoc' | 'monga' | 'salairesGestion'
  // 🔴 « Les coûts », lot 2 (03/11/2026) — les coûts saisis et les dus du module Location (C19 option A)
  | 'salairesVente' | 'autresVente' | 'partGestion' | 'collegues' | 'autresLocation' | 'autresGestion';
export type ComparerGraphe = 'n1' | 'structures' | 'activites' | 'familles' | 'rien';

// 🔴 D33 (Arno, 03/11/2026) — « Résultat net (CA − coûts) » s'appelle « CA net (CA − coûts) » (le même calcul)
export const MESURES_GRAPHE: readonly { cle: MesureGraphe; mot: string }[] = [{ cle: 'ca', mot: 'CA brut' }, { cle: 'couts', mot: 'Coûts' }, { cle: 'net', mot: 'CA net (CA − coûts)' }];
export const STRUCTURES_GRAPHE: readonly { cle: StructureGraphe; mot: string }[] = [{ cle: 'criterimmo', mot: 'CRITERIMMO' }, { cle: 'macj', mot: 'MACJ' }];
export const ACTIVITES_GRAPHE: readonly { cle: ActiviteGraphe; mot: string }[] = [{ cle: 'vente', mot: 'Vente' }, { cle: 'location', mot: 'Location' }, { cle: 'gestion', mot: 'Gestion' }];
export const FAMILLES_GRAPHE: readonly { cle: FamilleGraphe; mot: string; activite: ActiviteGraphe }[] = [
  { cle: 'commissions', mot: 'Commissions des négociateurs', activite: 'vente' }, { cle: 'apporteursVente', mot: 'Apporteurs vente', activite: 'vente' },
  { cle: 'exterieures', mot: 'Agences extérieures', activite: 'vente' }, { cle: 'apporteursLocation', mot: 'Apporteurs location', activite: 'location' },
  { cle: 'primes', mot: 'Primes de gestion', activite: 'location' }, { cle: 'variable', mot: 'Variable négociateur', activite: 'location' },
  { cle: 'salairesLocation', mot: 'Salaires location', activite: 'location' }, { cle: 'adhoc', mot: 'ADHOC', activite: 'gestion' },
  { cle: 'monga', mot: 'MONGA', activite: 'gestion' }, { cle: 'salairesGestion', mot: 'Salaires gestion', activite: 'gestion' },
  { cle: 'salairesVente', mot: 'Salaires vente', activite: 'vente' }, { cle: 'autresVente', mot: 'Autres vente', activite: 'vente' },
  { cle: 'partGestion', mot: 'Part de gestion versée aux apporteurs', activite: 'location' }, { cle: 'collegues', mot: 'Rémunération des collègues apporteurs', activite: 'location' },
  { cle: 'autresLocation', mot: 'Autres location', activite: 'location' }, { cle: 'autresGestion', mot: 'Autres gestion', activite: 'gestion' },
];
export const COMPARER_GRAPHE: readonly { cle: ComparerGraphe; mot: string }[] = [{ cle: 'n1', mot: 'Année précédente' }, { cle: 'structures', mot: 'Structures entre elles' },
  { cle: 'activites', mot: 'Activités entre elles' }, { cle: 'familles', mot: 'Familles de coûts entre elles' }, { cle: 'rien', mot: 'Rien' }];

export interface FiltresGraphe { mesure: MesureGraphe; familles: FamilleGraphe[]; structures: StructureGraphe[]; activites: ActiviteGraphe[]; comparer: ComparerGraphe; cumul: boolean; empile: boolean;
  /** 🔴 LOT CG10 — « Location et Gestion : Séparées | Réunies » : réunies, une seule case et une seule série « Location & Gestion » (leur somme exacte). */
  reunies: boolean;
  /** 🔴 D33 — les collaborateurs DÉCOCHÉS (« activité:compte », « activité:non_attribue ») en « CA brut » / « CA net » ; vide : tous cochés. */
  exclus: string[];
  /** 🔴 D36 — « Collaborateurs : Réunis | Séparés » : les activités dont chaque case cochée a SA courbe ; vide : toutes « Réunis » (comme avant). */
  separes: ActiviteGraphe[] }
export const FILTRES_GRAPHE_DEFAUT: FiltresGraphe = { mesure: 'ca', familles: FAMILLES_GRAPHE.map((f) => f.cle), structures: STRUCTURES_GRAPHE.map((s) => s.cle),
  activites: ACTIVITES_GRAPHE.map((a) => a.cle), comparer: 'n1', cumul: false, empile: true, reunies: false, exclus: [], separes: [] };

/** Un atome d'un point : sa structure (ou « inter » : l'inter-cabinet entre nos sociétés, neutralisé), son activité, sa famille (null : le CA).
 *  🔴 D33 — `collab` : le collaborateur (son compte) ou « non_attribue » ; absent : un montant non réparti par collaborateur (coûts généraux). */
export interface AtomeGraphe { structure: StructureGraphe | 'inter' | 'a_attribuer'; activite: ActiviteGraphe; famille: FamilleGraphe | null; m: MontantC; collab?: string }

/**
 * ══ 🔴 D33 (Arno, 03/11/2026) — LES COLLABORATEURS DANS LES BOUTONS D'ACTIVITÉ (« CA brut », « CA net ») ═══════════════════════════════════════════
 * Les collaborateurs proposés pour une activité : les comptes de cette FONCTION (page Comptes, C9) rattachés à au moins une structure cochée ; puis
 * « Non attribué ». L'attribution : celle des écrans existants — la Vente, les lignes de l'« Espace par négociateur » (`espaceNegociateurs`, par
 * structure : part de chaque côté, co-négociateurs ; « CA généré » et leurs coûts : commission, rétrocessions de leur côté avec la TVA non
 * récupérable) ; la Location, le négociateur de chaque ligne (`LigneLocationCa`) ; la Gestion n'a pas d'attribution par collaborateur : tout est
 * « Non attribué ». « Non attribué » = le total de l'atome − la somme des collaborateurs (la part conservée par la structure — apporteur de la
 * répartition, agences extérieures, inter-cabinet versé —, les affaires sans négociateur reconnu, les anciens négociateurs) : tout coché, la
 * somme est l'atome d'avant, au centime. Les coûts non rattachés à une affaire (salaires, autres, ADHOC, MONGA, part de gestion récurrente,
 * collègues apporteurs) ne se déduisent en « CA net » que si TOUTE l'activité est cochée (collaborateurs et « Non attribué »).
 */
export interface CollaborateurGraphe { id: number; libelle: string; fonctions: ActiviteGraphe[]; societes: StructureGraphe[] }
export interface CollaborateursGraphe { comptes: CollaborateurGraphe[];
  /** Le libellé de négociateur d'une vente (tel qu'en base) → le compte (la règle de rapprochement existante). */
  libelles: Record<string, number> }
export const NON_ATTRIBUE = 'non_attribue';
/** La clé d'un collaborateur dans `exclus`. PUR. */
export const cleCollab = (a: ActiviteGraphe, c: string): string => `${a}:${c}`;
/** Les collaborateurs proposés pour une activité, selon les structures cochées (la Gestion : aucun). PUR. */
export const collaborateursProposes = (cs: CollaborateursGraphe | null | undefined, a: ActiviteGraphe, structures: readonly StructureGraphe[]): CollaborateurGraphe[] =>
  a === 'gestion' || cs == null ? [] : cs.comptes.filter((c) => c.fonctions.includes(a) && c.societes.some((s) => structures.includes(s)))
    .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'));
/** Les familles de coûts NON rattachées à une affaire (« coûts généraux ») : jamais réparties par collaborateur. */
export const FAMILLES_GENERALES: readonly FamilleGraphe[] = ['salairesVente', 'autresVente', 'salairesLocation', 'partGestion', 'collegues', 'autresLocation', 'adhoc', 'monga', 'salairesGestion', 'autresGestion'];
/** Une activité est-elle filtrée par collaborateur (une case décochée, collaborateur proposé ou « Non attribué ») ? PUR. */
export const activiteFiltree = (f: Pick<FiltresGraphe, 'exclus'>, a: ActiviteGraphe): boolean => f.exclus.some((e) => e.startsWith(`${a}:`));

/**
 * ══ 🔴 D36 (Arno, 04/11/2026) — UNE COURBE PAR COLLABORATEUR (« Collaborateurs : Réunis | Séparés ») ═══════════════════════════════════════════════
 * Les activités dont les collaborateurs sont « Séparés » : en « CA brut » / « CA net », incluses, et quand les séries sont par activité (« Activités
 * entre elles ») ou qu'il n'y en a qu'une (« Année précédente », « Rien » : elles deviennent une série par activité, chacune avec son N−1).
 * « Structures » / « Familles » entre elles : sans effet (leurs séries ne sont pas des activités). PUR.
 */
export const separesEffectifs = (f: Pick<FiltresGraphe, 'mesure' | 'comparer' | 'activites'> & Partial<Pick<FiltresGraphe, 'separes'>>): ActiviteGraphe[] =>
  f.mesure === 'couts' || f.comparer === 'structures' || f.comparer === 'familles' ? [] : (f.separes ?? []).filter((a) => f.activites.includes(a));
/** 🔴 D36 — les séries sont-elles une par activité (« Activités entre elles », ou des collaborateurs « Séparés ») ? PUR. */
export const seriesParActivite = (f: FiltresGraphe): boolean => f.comparer === 'activites' || separesEffectifs(f).length > 0;
/** 🔴 D36 — une activité « vide » : tous ses collaborateurs ET « Non attribué » décochés (elle compte pour 0, comme exclue). PUR. */
export function activiteVide(f: Pick<FiltresGraphe, 'exclus'>, a: ActiviteGraphe, proposes: ReadonlySet<string> | undefined): boolean {
  return f.exclus.includes(cleCollab(a, NON_ATTRIBUE)) && [...(proposes ?? [])].every((c) => f.exclus.includes(cleCollab(a, c)));
}
/** 🔴 D36 — les coûts généraux d'une activité « Séparés » en « CA net » (non répartis par collaborateur) : leur propre série. */
export const GENERAUX = 'generaux';

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const moins = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC - b.htC, ttcC: a.ttcC - b.ttcC });
const cent = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) || 0;

/**
 * Les coûts de vente d'UNE société sur un point (mois 1 → 12, ou l'année : mois null) : ses propres ventes (`venteDansSociete` : celles qu'elle porte,
 * ses lignes miroir), la règle de sa page. CRITERIMMO + MACJ = la page FUSION. 🔴 Mon espace « Les coûts » (03/11/2026) : extraite telle quelle
 * d'`atomesDuPoint`, pour la lire sans la recopier. PUR.
 */
export function coutsVenteDeLaSociete(eC: EntreesCoutsGlobaux, s: StructureGraphe, annee: number, mois: number | null): CoutsVente {
  const p = ventesDeLaSociete(eC, s, annee, mois);
  return coutsVente(p.ventes, p.o, s);
}
/** Les ventes d'une société sur un point et les options de sa page (les mêmes pour ses coûts et, D33, pour ses collaborateurs). PUR. */
function ventesDeLaSociete(eC: EntreesCoutsGlobaux, s: StructureGraphe, annee: number, mois: number | null) {
  const ventes = eC.ventes.map((v) => (v.double === undefined || v.lignes === undefined ? { ...v, double: v.double ?? null, lignes: v.lignes ?? [] } : v)) as Vente[];
  const duPoint = mois === null ? ventesDeLAnnee(ventes, annee) : ventesDuMois(ventes, annee, mois);
  // 🔴 (03/11/2026) — les rétrocessions de LA société, comme sa page (`lireRetrocessions(s)`) : une rétrocession CRITERIMMO rattachée à une vente
  // partagée ne se compte plus aussi sur la ligne miroir de MACJ (CRITERIMMO + MACJ dépassait la FUSION de son montant ; aucun cas en base ce jour)
  return { ventes: duPoint.map((v) => venteDansSociete(v, s)).filter((v): v is Vente => v !== null),
    o: { retros: eC.retrocessions.filter((r) => r.societe === s), statutDuLibelle: eC.statutDuLibelle } };
}

/**
 * 🔴 D33 — un atome éclaté par collaborateur : un atome par candidat (0 s'il n'a rien sur ce point : les mêmes atomes à chaque point, dans le même
 * ordre), puis « Non attribué » = l'atome − la somme des candidats (au centime). PUR.
 */
function eclater(a: AtomeGraphe, parts: ReadonlyMap<string, MontantC>, candidats: readonly string[]): AtomeGraphe[] {
  const xs = candidats.map((c) => ({ ...a, collab: c, m: parts.get(c) ?? RIEN }));
  return [...xs, { ...a, collab: NON_ATTRIBUE, m: xs.reduce((t, x) => moins(t, x.m), a.m) }];
}
const ajouterPart = (m: Map<string, MontantC>, c: string, x: MontantC): void => { m.set(c, plus(m.get(c) ?? RIEN, x)); };
/** Les candidats d'une activité : les comptes de cette fonction (toutes structures : le filtre des structures se fait à l'écran), par id. PUR. */
const candidatsDe = (cs: CollaborateursGraphe, a: ActiviteGraphe): string[] =>
  cs.comptes.filter((c) => c.fonctions.includes(a)).map((c) => c.id).sort((x, y) => x - y).map(String);

/**
 * 🔴 D33 — les atomes du point, éclatés par collaborateur (CA et coûts rattachés aux affaires) ; les coûts généraux restent entiers (sans `collab`).
 * Vente : les lignes de l'Espace par négociateur de chaque structure (CA généré, commissions, rétrocessions de son côté) ; Location : les lignes de
 * chaque négociateur (`coutsLocation` sur ses seules lignes : apporteurs, primes et variable déduits, la règle du mois) ; Gestion : « Non attribué ».
 * L'inter-cabinet neutralisé : la part versée, comptée dans le « Non attribué » de la porteuse. PUR.
 */
function eclaterParCollaborateur(atomes: readonly AtomeGraphe[], eC: EntreesCoutsGlobaux, cs: CollaborateursGraphe, annee: number, mois: number | null, avecSalaires: boolean): AtomeGraphe[] {
  const candV = candidatsDe(cs, 'vente'); const candL = candidatsDe(cs, 'location');
  const parts = new Map<string, Map<string, MontantC>>(); // « structure|activité|famille » → collaborateur → montant
  const part = (st: string, act: ActiviteGraphe, fam: FamilleGraphe | null, c: string, x: MontantC): void => {
    const k = `${st}|${act}|${fam ?? ''}`; if (!parts.has(k)) parts.set(k, new Map()); ajouterPart(parts.get(k)!, c, x);
  };
  for (const st of ['criterimmo', 'macj'] as const) {
    const p = ventesDeLaSociete(eC, st, annee, mois);
    for (const l of espaceNegociateurs(p.ventes, st, p.o)) {
      const id = cs.libelles[l.negociateur]; const c = id === undefined ? null : String(id);
      if (c === null || !candV.includes(c)) continue;
      part(st, 'vente', null, c, l.ca); part(st, 'vente', 'commissions', c, l.com); part(st, 'vente', 'apporteursVente', c, l.retro);
    }
  }
  if (eC.location !== null && candL.length > 0) {
    const ms = mois === null ? Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 })) : mois >= 1 && mois <= 12 ? [{ annee, mois }] : [];
    for (const c of candL) {
      const lignes = eC.location.lignes.filter((l) => l.negociateur.cle === `id:${c}`);
      if (lignes.length === 0 || ms.length === 0) continue;
      const x = coutsLocation(lignes, ms, [], eC.location.salaires, avecSalaires, null);
      part('criterimmo', 'location', null, c, x.ca); part('criterimmo', 'location', 'apporteursLocation', c, x.apporteurs);
      part('criterimmo', 'location', 'primes', c, x.primesDeduites); part('criterimmo', 'location', 'variable', c, x.variableDeduit);
    }
  }
  const AFFAIRES: Partial<Record<ActiviteGraphe, readonly (FamilleGraphe | null)[]>> = { vente: [null, 'commissions', 'apporteursVente', 'exterieures'],
    location: [null, 'apporteursLocation', 'primes', 'variable'], gestion: [null] };
  return atomes.flatMap((a) => {
    if (a.structure === 'a_attribuer') return [a];
    if (a.structure === 'inter') return [{ ...a, collab: NON_ATTRIBUE }];
    if (!(AFFAIRES[a.activite] ?? []).includes(a.famille)) return [a];
    const cand = a.activite === 'vente' ? candV : a.activite === 'location' ? candL : [];
    return eclater(a, parts.get(`${a.structure}|${a.activite}|${a.famille ?? ''}`) ?? new Map(), cand);
  });
}

/** Les atomes d'un point (mois 1 → 12, ou l'année : mois null) : les cellules du Bilan, en HT et en TTC. PUR. */
export function atomesDuPoint(eG: EntreesGlobalUnite, eC: EntreesCoutsGlobaux, annee: number, mois: number | null, avecSalaires: boolean,
  /** 🔴 D33 — les collaborateurs (le Suivi CA) : les atomes éclatés par collaborateur ; absents : comme avant. */
  cs: CollaborateursGraphe | null = null): AtomeGraphe[] {
  const ht = celluleGlobalEn(eG, annee, mois, 'ht'); const ttc = celluleGlobalEn(eG, annee, mois, 'ttc');
  const ca = (k: 'venteCriterimmoHt' | 'venteMacjHt' | 'aAttribuerHt' | 'interCabinetHt' | 'locationHt' | 'gestionHt'): MontantC => ({ htC: cent(ht[k] ?? 0), ttcC: cent(ttc[k] ?? 0) });
  const c = coutsGlobaux(eC, annee, mois, avecSalaires);
  const vc = coutsVenteDeLaSociete(eC, 'criterimmo', annee, mois); const vm = coutsVenteDeLaSociete(eC, 'macj', annee, mois);
  const a: AtomeGraphe[] = [
    { structure: 'criterimmo', activite: 'vente', famille: null, m: ca('venteCriterimmoHt') },
    { structure: 'macj', activite: 'vente', famille: null, m: ca('venteMacjHt') },
    { structure: 'a_attribuer', activite: 'vente', famille: null, m: ca('aAttribuerHt') },
    { structure: 'inter', activite: 'vente', famille: null, m: moins(RIEN, ca('interCabinetHt')) },
    { structure: 'criterimmo', activite: 'location', famille: null, m: ca('locationHt') },
    { structure: 'criterimmo', activite: 'gestion', famille: null, m: ca('gestionHt') },
  ];
  // 🔴 « Les coûts », lot 2 — les coûts saisis de la vente de chaque structure (salaires « Avec salaires » seulement, comme `coutsGlobaux`)
  const ms = mois === null ? Array.from({ length: 12 }, (_, i) => ({ annee, mois: i + 1 })) : [{ annee, mois }];
  const saisi = (societe: 'criterimmo' | 'macj', poste: 'salaires' | 'autres', famille: 'vente' | 'location' | 'gestion' = 'vente') => montantSaisi(eC.saisis ?? [], { famille, poste, ms, societe });
  for (const [s, x] of [['criterimmo', vc], ['macj', vm]] as const) {
    a.push({ structure: s, activite: 'vente', famille: 'commissions', m: x.commissions }, { structure: s, activite: 'vente', famille: 'apporteursVente', m: x.apporteurs },
      { structure: s, activite: 'vente', famille: 'exterieures', m: x.exterieures },
      { structure: s, activite: 'vente', famille: 'salairesVente', m: avecSalaires ? saisi(s, 'salaires') : { htC: 0, ttcC: 0 } }, { structure: s, activite: 'vente', famille: 'autresVente', m: saisi(s, 'autres') });
  }
  if (c.location !== null) a.push({ structure: 'criterimmo', activite: 'location', famille: 'apporteursLocation', m: c.location.apporteurs },
    { structure: 'criterimmo', activite: 'location', famille: 'primes', m: c.location.primesDeduites }, { structure: 'criterimmo', activite: 'location', famille: 'variable', m: c.location.variableDeduit },
    { structure: 'criterimmo', activite: 'location', famille: 'salairesLocation', m: c.location.salaires },
    { structure: 'criterimmo', activite: 'location', famille: 'partGestion', m: c.location.partGestion }, { structure: 'criterimmo', activite: 'location', famille: 'collegues', m: c.location.collegues },
    { structure: 'criterimmo', activite: 'location', famille: 'autresLocation', m: c.saisis.locationAutres });
  a.push({ structure: 'criterimmo', activite: 'gestion', famille: 'adhoc', m: c.gestion.adhoc }, { structure: 'criterimmo', activite: 'gestion', famille: 'monga', m: c.gestion.monga },
    { structure: 'criterimmo', activite: 'gestion', famille: 'salairesGestion', m: c.gestion.salaires }, { structure: 'criterimmo', activite: 'gestion', famille: 'autresGestion', m: c.saisis.gestionAutres });
  return cs === null ? a : eclaterParCollaborateur(a, eC, cs, annee, mois, avecSalaires);
}

/** L'atome est-il retenu par les filtres ? L'inter-cabinet : seulement si CRITERIMMO ET MACJ (sinon il n'y a rien à neutraliser). PUR. */
export function retenu(x: AtomeGraphe, f: Pick<FiltresGraphe, 'structures' | 'activites' | 'familles' | 'mesure'> & Partial<Pick<FiltresGraphe, 'exclus'>>,
  /** 🔴 D33 — les collaborateurs proposés (par activité, selon les structures cochées) : un collaborateur non proposé compte dans « Non attribué ». */
  proposes?: Partial<Record<ActiviteGraphe, ReadonlySet<string>>>): boolean {
  // 🔴 LOT CG10 — les ventes à attribuer : jamais retenues (le graphique ne les compte plus ; la mention dit leur montant)
  if (x.structure === 'a_attribuer') return false;
  const struct = x.structure === 'inter' ? f.structures.includes('criterimmo') && f.structures.includes('macj') : f.structures.includes(x.structure);
  if (!struct || !f.activites.includes(x.activite)) return false;
  // 🔴 D33 — « CA brut » / « CA net » : un collaborateur décoché (ou « Non attribué ») n'est pas compté ; en « CA net », une activité filtrée ne
  // déduit pas ses coûts généraux (non répartis par collaborateur). « Coûts » : inchangé (la liste des coûts, D25).
  const exclus = f.exclus ?? [];
  if (f.mesure !== 'couts' && exclus.length > 0) {
    if (x.collab !== undefined) {
      const c = x.collab === NON_ATTRIBUE || proposes?.[x.activite]?.has(x.collab) === true ? x.collab : NON_ATTRIBUE;
      if (exclus.includes(cleCollab(x.activite, c))) return false;
    } else if (x.famille !== null && f.mesure === 'net' && activiteFiltree({ exclus }, x.activite)) return false;
  }
  if (x.famille === null) return f.mesure !== 'couts';
  if (f.mesure === 'ca') return false;
  return f.mesure === 'net' || f.familles.includes(x.famille);
}
/** La valeur d'un atome dans la mesure : le CA (+), un coût (+ en « Coûts », − en « Résultat net »). PUR. */
const signe = (x: AtomeGraphe, mesure: MesureGraphe): MontantC => (x.famille !== null && mesure === 'net' ? moins(RIEN, x.m) : x.m);

/** Une série : sa clé, son nom, sa couleur (1 → 10, fixe pour un élément), ses montants.
 *  🔴 D36 — `nuance` : une série d'un collaborateur « Séparés », son rang dans la couleur de son activité (0 : la couleur de l'activité). */
export interface SerieValeur { cle: string; nom: string; couleur: number; m: MontantC; nuance?: number }
const COULEURS: Record<string, number> = { criterimmo: 1, macj: 2, inter: 4, vente: 1, location: 3, gestion: 5, location_gestion: 6,
  ...Object.fromEntries(FAMILLES_GRAPHE.map((f, i) => [f.cle, (i % 10) + 1])) };
const NOMS: Record<string, string> = { ...Object.fromEntries([...STRUCTURES_GRAPHE, ...ACTIVITES_GRAPHE, ...FAMILLES_GRAPHE].map((x) => [x.cle, x.mot])), inter: 'Inter-cabinet (neutralisé)', total: 'Total',
  location_gestion: 'Location & Gestion' };

/** Les séries comparées : une par élément retenu (structures, activités ou familles), sinon le total seul. PUR. */
export function seriesDuPoint(atomes: readonly AtomeGraphe[], f: FiltresGraphe, proposes?: Partial<Record<ActiviteGraphe, ReadonlySet<string>>>,
  /** 🔴 D36 — les collaborateurs (leurs noms et leur ordre, pour les séries « Séparés ») ; absents : les comptes de `proposes`, par numéro. */
  cs?: CollaborateursGraphe | null): { total: MontantC; series: SerieValeur[] } {
  const garde = atomes.filter((x) => retenu(x, f, proposes));
  const total = garde.reduce((t, x) => plus(t, signe(x, f.mesure)), RIEN);
  // 🔴 LOT CG10 — « Réunies » : la location et la gestion, une seule série « Location & Gestion » (leur somme exacte)
  const activiteDe = (a: ActiviteGraphe): string => (f.reunies && a !== 'vente' ? 'location_gestion' : a);
  // 🔴 D36 — les activités « Séparés » : une série par case cochée (« Non attribué » compris ; en « CA net », leurs coûts généraux à part) ; la même
  // règle que le filtre : un collaborateur non proposé compte dans « Non attribué »
  const sep = separesEffectifs(f); const parActivite = seriesParActivite(f);
  const collabDe = (x: AtomeGraphe): string => (x.collab === undefined ? GENERAUX : x.collab === NON_ATTRIBUE || proposes?.[x.activite]?.has(x.collab) === true ? x.collab : NON_ATTRIBUE);
  const cleDe = (x: AtomeGraphe): string => (f.comparer === 'structures' ? x.structure
    : parActivite ? (sep.includes(x.activite) ? cleCollab(x.activite, collabDe(x)) : activiteDe(x.activite))
      : f.comparer === 'familles' ? x.famille ?? 'ca' : 'total');
  const nomsCollabs = new Map<string, { nom: string; couleur: number; nuance: number }>();
  const parActivites = (): string[] => [...new Set(ACTIVITES_GRAPHE.filter((a) => f.activites.includes(a.cle)).flatMap((a) => {
    if (!sep.includes(a.cle)) return [activiteDe(a.cle)];
    const comptes = cs != null ? collaborateursProposes(cs, a.cle, f.structures).filter((c) => proposes?.[a.cle]?.has(String(c.id)) ?? true).map((c) => ({ id: String(c.id), nom: c.libelle }))
      : [...(proposes?.[a.cle] ?? [])].sort((x, y) => Number(x) - Number(y)).map((id) => ({ id, nom: id }));
    const xs = [...comptes, { id: NON_ATTRIBUE, nom: `Non attribué (${a.mot})` }, ...(f.mesure === 'net' ? [{ id: GENERAUX, nom: `Coûts généraux (${a.mot})` }] : [])]
      .filter((c) => c.id === GENERAUX || !f.exclus.includes(cleCollab(a.cle, c.id)));
    xs.forEach((c, i) => nomsCollabs.set(cleCollab(a.cle, c.id), { nom: c.nom, couleur: COULEURS[a.cle] ?? 1, nuance: i }));
    return xs.map((c) => cleCollab(a.cle, c.id));
  }))];
  const ordre = f.comparer === 'structures' ? [...f.structures, 'inter'] : parActivite ? parActivites()
    : f.comparer === 'familles' ? FAMILLES_GRAPHE.map((x) => x.cle).filter((c) => f.familles.includes(c)) : ['total'];
  const parCle = new Map<string, MontantC>(ordre.map((c) => [c, RIEN]));
  for (const x of garde) { const c = cleDe(x); if (parCle.has(c)) parCle.set(c, plus(parCle.get(c)!, signe(x, f.mesure))); }
  const series = [...parCle].filter(([c, m]) => c !== 'inter' || m.htC !== 0 || m.ttcC !== 0)
    .map(([c, m]) => { const n = nomsCollabs.get(c); return n === undefined ? { cle: c, nom: NOMS[c] ?? c, couleur: COULEURS[c] ?? 1, m } : { cle: c, nom: n.nom, couleur: n.couleur, nuance: n.nuance, m }; });
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
  // 🔴 D36 — des collaborateurs « Séparés » : plusieurs séries, même en « Année précédente » / « Rien »
  return (f.comparer === 'n1' || f.comparer === 'rien') && !seriesParActivite(f) ? 'Une seule série : choisissez une comparaison entre structures, activités ou familles.' : null;
}

/** Le nombre de filtres actifs (différents du réglage par défaut), pour « Filtres (n actifs) ». PUR. */
export function nbFiltresActifs(f: FiltresGraphe,
  /** 🔴 Mon espace « Les coûts » — le réglage de départ de la page (absent : celui du Suivi CA). */
  d: FiltresGraphe = FILTRES_GRAPHE_DEFAUT): number {
  const egal = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
  return [f.mesure !== d.mesure, f.mesure === 'couts' && !egal(f.familles, d.familles), !egal(f.structures, d.structures), !egal(f.activites, d.activites), f.comparer !== d.comparer,
    f.cumul !== d.cumul, f.empile !== d.empile, f.reunies !== d.reunies, f.mesure !== 'couts' && (f.exclus ?? []).length > 0,
    // 🔴 D36 — des collaborateurs « Séparés »
    f.mesure !== 'couts' && (f.separes ?? []).length > 0].filter(Boolean).length;
}

/** Les filtres dans l'adresse (le partage) et leur relecture ; une valeur inconnue : le défaut. PUR. */
export function filtresVersAdresse(f: FiltresGraphe): Record<string, string | null> {
  const d = FILTRES_GRAPHE_DEFAUT; const liste = <T extends string>(xs: readonly T[], tout: readonly T[]): string | null => (xs.length === tout.length && tout.every((x) => xs.includes(x)) ? null : xs.join(',') || 'aucun');
  return { 'g-mesure': f.mesure === d.mesure ? null : f.mesure, 'g-familles': liste(f.familles, d.familles), 'g-structures': liste(f.structures, d.structures),
    'g-activites': liste(f.activites, d.activites), 'g-comparer': f.comparer === d.comparer ? null : f.comparer, 'g-cumul': f.cumul ? '1' : null, 'g-empile': f.empile ? null : 'non',
    'g-lg': f.reunies ? 'reunies' : null, 'g-exclus': (f.exclus ?? []).length === 0 ? null : (f.exclus ?? []).join(','),
    'g-separes': (f.separes ?? []).length === 0 ? null : (f.separes ?? []).join(',') };
}
export function filtresDepuisAdresse(lire: (k: string) => string | null): FiltresGraphe {
  const d = FILTRES_GRAPHE_DEFAUT;
  const liste = <T extends string>(x: string | null, tout: readonly T[]): T[] => (x === null ? [...tout] : x === 'aucun' ? [] : x.split(',').filter((c): c is T => (tout as readonly string[]).includes(c)));
  const un = <T extends string>(x: string | null, tout: readonly T[], defaut: T): T => ((tout as readonly string[]).includes(x ?? '') ? (x as T) : defaut);
  return { mesure: un(lire('g-mesure'), MESURES_GRAPHE.map((x) => x.cle), d.mesure), familles: liste(lire('g-familles'), d.familles), structures: liste(lire('g-structures'), d.structures),
    activites: liste(lire('g-activites'), d.activites), comparer: un(lire('g-comparer'), COMPARER_GRAPHE.map((x) => x.cle), d.comparer), cumul: lire('g-cumul') === '1', empile: lire('g-empile') !== 'non',
    reunies: lire('g-lg') === 'reunies',
    // 🔴 D33 — « activité:compte » (un compte en chiffres) ou « activité:non_attribue »
    exclus: (lire('g-exclus') ?? '').split(',').filter((x) => /^(vente|location|gestion):(\d+|non_attribue)$/.test(x)),
    // 🔴 D36 — les activités aux collaborateurs « Séparés »
    separes: [...new Set((lire('g-separes') ?? '').split(',').filter((x): x is ActiviteGraphe => ACTIVITES_GRAPHE.some((a) => a.cle === x)))] };
}
/**
 * 🔴 LOT CG10 — « Réunies » : une seule case « Location & Gestion » ; la passer coche ou décoche les deux ensemble. En passant à « Réunies », une
 * sélection où une seule des deux était cochée les coche toutes deux (la case unique les représente ensemble). PUR.
 */
export function avecReunies(f: FiltresGraphe, reunies: boolean): FiltresGraphe {
  if (!reunies) return { ...f, reunies };
  const une = f.activites.includes('location') || f.activites.includes('gestion');
  const autres = f.activites.filter((a) => a === 'vente');
  // 🔴 D36 — de même, « Séparés » vaut pour les deux ensemble (le bouton « Location & Gestion » n'a qu'une liste)
  const sep = f.separes ?? []; const sepUne = sep.includes('location') || sep.includes('gestion');
  return { ...f, reunies, activites: une ? [...autres, 'location', 'gestion'] : autres,
    separes: sepUne ? [...sep.filter((a) => a === 'vente'), 'location', 'gestion'] : sep.filter((a) => a === 'vente') };
}

/**
 * ══ 🔴 LOT CG11 (Arno) — « MOIS À CONFIRMER » : LA FIN D'ANNÉE DU GRAPHIQUE = LE TOTAL DE L'ANNÉE ══════════════════════════════════════════════
 * Les ventes signées sans mois (« mois à confirmer ») comptent dans l'année (tuiles, Bilan) mais dans aucun mois : la somme des 12 mois du graphique
 * restait en deçà. Les atomes « hors mois » = ceux de l'année − la somme de ceux des 12 mois (le même découpage : structure, activité, famille), soit
 * ces ventes (CA et leurs coûts), et l'écart d'arrondi au centime éventuel. Ajoutés après décembre, ils font tomber la fin d'année sur le total
 * de l'année, au centime, pour tous les filtres. PUR.
 */
export function atomesHorsMois(annee: readonly AtomeGraphe[], mois: readonly (readonly AtomeGraphe[])[]): AtomeGraphe[] {
  const cle = (x: AtomeGraphe): string => `${x.structure}|${x.activite}|${x.famille ?? ''}|${x.collab ?? ''}`;
  const somme = new Map<string, MontantC>();
  for (const xs of mois) for (const x of xs) somme.set(cle(x), plus(somme.get(cle(x)) ?? RIEN, x.m));
  return annee.map((x) => ({ ...x, m: moins(x.m, somme.get(cle(x)) ?? RIEN) }));
}
/**
 * 🔴 LOT CG12 (Arno) — les points de l'axe des mois : les 12 mois, puis « Mois à confirmer » = les cellules d'un 13e « mois » qui ne contient que les
 * ventes signées sans mois (les mêmes règles et le même arrondi au centime qu'un mois) ; l'écart d'arrondi qui reste (l'année − la somme de ces
 * 13 points) est REPORTÉ, poste par poste, sur le dernier mois affiché (`dernier`, 1 → 12) qui a une valeur pour ce poste, sans point à part : la fin d'année = le total de l'année, au centime. PUR.
 */
export function atomesDesMois(eG: EntreesGlobalUnite, eC: EntreesCoutsGlobaux, annee: number, avecSalaires: boolean, dernier: number,
  cs: CollaborateursGraphe | null = null): { mois: AtomeGraphe[][]; aConfirmer: AtomeGraphe[] } {
  const mois = Array.from({ length: 12 }, (_, i) => atomesDuPoint(eG, eC, annee, i + 1, avecSalaires, cs));
  const treize = <V extends { annee: number; mois: number | null }>(vs: readonly V[]): V[] => vs.map((v) => (v.annee === annee && v.mois === null ? { ...v, mois: MOIS_A_CONFIRMER } : v));
  const aConfirmer = atomesDuPoint({ ...eG, ventes: treize(eG.ventes) }, { ...eC, ventes: treize(eC.ventes) }, annee, MOIS_A_CONFIRMER, avecSalaires, cs);
  const reste = atomesHorsMois(atomesDuPoint(eG, eC, annee, null, avecSalaires, cs), [...mois, aConfirmer]);
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
