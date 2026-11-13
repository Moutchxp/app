import type { MontantC } from './partAgence';
import { TVA, type Societe } from './modele';
import { repartirSalaire, type VersionPrincipale } from '../admin/activitePrincipale';

/**
 * ══ 🔴 MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, migration 451) — LES COÛTS SAISIS (PUR) ═════════════════════════════════════════════════
 * Une ligne = un salarié d'un mois (poste « salaires », un profil) ou un frais « Autres » (un libellé), d'une structure et d'une famille. UNE seule
 * source (`transaction_cout_ligne`) : les salaires de la Location et de la Gestion entrent par leur page (`lireSalairesLocation`, `lireGestion`,
 * la somme des salariés du mois) ; les salaires de la vente et les « Autres » par `coutsGlobaux` (`saisis`). Jamais les deux.
 * Montants saisis en HT. TVA (R2 d'Arno, 03/11/2026) : PAR LIGNE — « TVA 20 % » (TTC = HT × 1,20) ou « sans TVA » (TTC = HT) ; « Autres » : 20 % par
 * défaut, modifiable ; les salaires chargés : jamais de TVA.
 */
export type FamilleCout = 'vente' | 'location' | 'gestion';
/** 🔴 472 — `remunerations` : « Rémunérations associés » (vente seulement, par associé, sans TVA). */
export type PosteSaisi = 'salaires' | 'autres' | 'remunerations';
export const FAMILLES_COUT: readonly FamilleCout[] = ['vente', 'location', 'gestion'];
export interface CoutSaisi { societe: Societe; famille: FamilleCout; poste: PosteSaisi; annee: number; mois: number; montantHt: number;
  /** R2 (Arno, 03/11/2026) — la TVA de la ligne : vrai → TTC = HT × 1,20 ; faux → TTC = HT. Salaires : jamais. Absente (ligne d'avant) : faux. */
  tva?: boolean }
/** Une ligne telle que l'écran la reçoit : son id, son profil (salaires) ou son libellé (« Autres »), sa version (le dernier n° de son journal). */
export interface CoutLigne extends CoutSaisi { id: number; compteId: number | null; compteLibelle: string | null; libelle: string | null; version: number;
  /** 🔴 D35 — un salaire : le montant SAISI du mois (entier) ; `montantHt` est la part de CETTE activité (le mois d'un changement : son prorata). */
  montantSaisiHt?: number;
  /** 🔴 D35 — la part d'un mois partagé (« prorata 15/30 j ») ; absente : le mois entier. `derniere` : la part de la nouvelle activité (le reste). */
  prorata?: { jours: number; joursMois: number; derniere: boolean };
  /** 🔴 D35 — un salaire sans activité principale ce mois-là (impossible à saisir ; une principale retirée depuis) : compté en vente, signalé. */
  sansPrincipale?: boolean }

/**
 * 🔴 D35 (Arno, 03/11/2026, option C) — LE SALAIRE RATTACHÉ AU COLLABORATEUR : une ligne de salaire sans famille enregistrée (`famille` null) devient
 * UNE ligne par activité de son mois (`repartirSalaire` : l'activité principale en vigueur, au prorata des jours le mois d'un changement), chacune
 * avec SA part en `montantHt` (la somme = le montant saisi, au centime) ; les autres lignes passent telles quelles. C'est le seul endroit où la famille
 * d'un salaire se calcule : Les coûts, la Location, la Gestion, Coûts globaux, le CA net et le graphique lisent ces lignes. PUR.
 */
export function eclaterSalaires<T extends Omit<CoutLigne, 'famille'> & { famille: FamilleCout | null }>(lignes: readonly T[],
  principales: ReadonlyMap<number, readonly VersionPrincipale[]>): CoutLigne[] {
  const out: CoutLigne[] = [];
  for (const l of lignes) {
    if (l.famille !== null) { out.push(l as CoutLigne); continue; }
    const parts = l.compteId === null ? [] : repartirSalaire(principales.get(l.compteId) ?? [], l.annee, l.mois, l.montantHt);
    if (parts.length === 0) { out.push({ ...l, famille: 'vente', montantSaisiHt: l.montantHt, sansPrincipale: true }); continue; }
    parts.forEach((p, i) => out.push({ ...l, famille: p.famille, montantHt: p.htC / 100, montantSaisiHt: l.montantHt,
      ...(p.jours === p.joursMois ? {} : { prorata: { jours: p.jours, joursMois: p.joursMois, derniere: i === parts.length - 1 } }) }));
  }
  return out;
}

const centimes = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const RIEN: MontantC = { htC: 0, ttcC: 0 };

/** R2 — le TTC d'une ligne, au centime : HT × 1,20 si la ligne porte la TVA (la règle d'ADHOC et MONGA, `Math.round(htC × 1,2)`), sinon le HT. PUR. */
export const ttcDeLigne = (htC: number, tva: boolean | undefined): number => (tva === true ? Math.round(htC * TVA) : htC);
/** Le montant (HT et TTC, chaque ligne selon SA TVA, R2) des lignes d'une famille et d'un poste sur des mois, pour une structure (absente : les deux). PUR. */
export function montantSaisi(lignes: readonly CoutSaisi[], f: { famille: FamilleCout; poste: PosteSaisi; ms: readonly { annee: number; mois: number }[]; societe?: Societe | null }): MontantC {
  const cles = new Set(f.ms.map((m) => m.annee * 100 + m.mois));
  return lignes.filter((l) => l.famille === f.famille && l.poste === f.poste && cles.has(l.annee * 100 + l.mois) && (f.societe == null || l.societe === f.societe))
    .reduce((t, l) => { const h = centimes(l.montantHt); return { htC: t.htC + h, ttcC: t.ttcC + ttcDeLigne(h, l.poste === 'autres' ? l.tva : false) }; }, RIEN);
}

/**
 * Les salaires d'une famille (location ou gestion) par mois : la somme des salariés de chaque mois qui en a (« AAAA-MM » → euros HT). Un mois sans
 * salarié n'y est pas (le montant mensuel d'avant, s'il existe encore, reste lu — jusqu'à son effacement, décision C8). PUR.
 */
export function salairesParMois(lignes: readonly Pick<CoutSaisi, 'famille' | 'poste' | 'annee' | 'mois' | 'montantHt'>[], famille: 'location' | 'gestion'): Map<string, number> {
  const r = new Map<string, number>();
  for (const l of lignes) if (l.famille === famille && l.poste === 'salaires') {
    const k = `${l.annee}-${String(l.mois).padStart(2, '0')}`;
    r.set(k, Math.round(((r.get(k) ?? 0) + l.montantHt) * 100) / 100);
  }
  return r;
}

/**
 * 🔴 D35 — la part d'un salaire tapé (`montantHt`, le mois entier) qui revient à `famille` ce mois-là : la même règle (`repartirSalaire`) ; un profil
 * sans activité principale connue (avant la 453) : le montant entier. Sert au sous-total d'un écran de saisie avant l'enregistrement. PUR.
 */
export function partDuSalaire(principales: readonly VersionPrincipale[] | undefined, annee: number, mois: number, montantHt: number, famille: FamilleCout): number {
  if (principales === undefined || principales.length === 0) return montantHt;
  return (repartirSalaire(principales, annee, mois, montantHt).find((p) => p.famille === famille)?.htC ?? 0) / 100;
}

/** Les lignes qui passent par `coutsGlobaux` (`saisis`) : tout sauf les salaires de la location et de la gestion (ils passent par leur page). PUR. */
export const lignesPourCoutsGlobaux = <T extends Pick<CoutSaisi, 'famille' | 'poste'>>(lignes: readonly T[]): T[] =>
  lignes.filter((l) => !(l.poste === 'salaires' && l.famille !== 'vente'));
