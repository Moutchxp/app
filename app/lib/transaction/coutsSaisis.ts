import type { MontantC } from './partAgence';
import { TVA, type Societe } from './modele';

/**
 * ══ 🔴 MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, migration 451) — LES COÛTS SAISIS (PUR) ═════════════════════════════════════════════════
 * Une ligne = un salarié d'un mois (poste « salaires », un profil) ou un frais « Autres » (un libellé), d'une structure et d'une famille. UNE seule
 * source (`transaction_cout_ligne`) : les salaires de la Location et de la Gestion entrent par leur page (`lireSalairesLocation`, `lireGestion`,
 * la somme des salariés du mois) ; les salaires de la vente et les « Autres » par `coutsGlobaux` (`saisis`). Jamais les deux.
 * Montants saisis en HT. TVA (R2 d'Arno, 03/11/2026) : PAR LIGNE — « TVA 20 % » (TTC = HT × 1,20) ou « sans TVA » (TTC = HT) ; « Autres » : 20 % par
 * défaut, modifiable ; les salaires chargés : jamais de TVA.
 */
export type FamilleCout = 'vente' | 'location' | 'gestion';
export type PosteSaisi = 'salaires' | 'autres';
export const FAMILLES_COUT: readonly FamilleCout[] = ['vente', 'location', 'gestion'];
export interface CoutSaisi { societe: Societe; famille: FamilleCout; poste: PosteSaisi; annee: number; mois: number; montantHt: number;
  /** R2 (Arno, 03/11/2026) — la TVA de la ligne : vrai → TTC = HT × 1,20 ; faux → TTC = HT. Salaires : jamais. Absente (ligne d'avant) : faux. */
  tva?: boolean }
/** Une ligne telle que l'écran la reçoit : son id, son profil (salaires) ou son libellé (« Autres »), sa version (le dernier n° de son journal). */
export interface CoutLigne extends CoutSaisi { id: number; compteId: number | null; compteLibelle: string | null; libelle: string | null; version: number }

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

/** Les lignes qui passent par `coutsGlobaux` (`saisis`) : tout sauf les salaires de la location et de la gestion (ils passent par leur page). PUR. */
export const lignesPourCoutsGlobaux = <T extends Pick<CoutSaisi, 'famille' | 'poste'>>(lignes: readonly T[]): T[] =>
  lignes.filter((l) => !(l.poste === 'salaires' && l.famille !== 'vente'));
