import type { MontantC } from './partAgence';
import type { Societe } from './modele';

/**
 * ══ 🔴 MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, migration 451) — LES COÛTS SAISIS (PUR) ═════════════════════════════════════════════════
 * Une ligne = un salarié d'un mois (poste « salaires », un profil) ou un frais « Autres » (un libellé), d'une structure et d'une famille. UNE seule
 * source (`transaction_cout_ligne`) : les salaires de la Location et de la Gestion entrent par leur page (`lireSalairesLocation`, `lireGestion`,
 * la somme des salariés du mois) ; les salaires de la vente et les « Autres » par `coutsGlobaux` (`saisis`). Jamais les deux.
 * Montants saisis en HT. TVA : les salaires n'en ont pas (comme partout) ; « Autres » : aucune convention dans « Coûts globaux » → saisis en HT,
 * comptés sans TVA ajoutée (TTC = HT), et l'écran le dit (question posée à Arno).
 */
export type FamilleCout = 'vente' | 'location' | 'gestion';
export type PosteSaisi = 'salaires' | 'autres';
export const FAMILLES_COUT: readonly FamilleCout[] = ['vente', 'location', 'gestion'];
export interface CoutSaisi { societe: Societe; famille: FamilleCout; poste: PosteSaisi; annee: number; mois: number; montantHt: number }
/** Une ligne telle que l'écran la reçoit : son id, son profil (salaires) ou son libellé (« Autres »), sa version (le dernier n° de son journal). */
export interface CoutLigne extends CoutSaisi { id: number; compteId: number | null; compteLibelle: string | null; libelle: string | null; version: number }

const centimes = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const RIEN: MontantC = { htC: 0, ttcC: 0 };

/** Le montant (HT, et TTC = HT) des lignes d'une famille et d'un poste sur des mois, pour une structure (absente : les deux). Chaque ligne au centime. PUR. */
export function montantSaisi(lignes: readonly CoutSaisi[], f: { famille: FamilleCout; poste: PosteSaisi; ms: readonly { annee: number; mois: number }[]; societe?: Societe | null }): MontantC {
  const cles = new Set(f.ms.map((m) => m.annee * 100 + m.mois));
  const c = lignes.filter((l) => l.famille === f.famille && l.poste === f.poste && cles.has(l.annee * 100 + l.mois) && (f.societe == null || l.societe === f.societe))
    .reduce((t, l) => t + centimes(l.montantHt), 0);
  return c === 0 ? RIEN : { htC: c, ttcC: c };
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
