import type { MontantC } from '../transaction/partAgence';
import type { EntreesCoutsGlobaux } from '../transaction/coutsGlobal';
import type { FamilleCout } from '../transaction/coutsSaisis';
import type { Societe } from '../transaction/modele';
import type { Agence } from './agence';
import { avecLocationGestion, caGestionDuPoint, coutsDuPoint, type CoutsDuPoint } from './couts';
import { estValide, moisProposes, type MoisAn, type PosteCa, type Validation } from './saisieMois';

/**
 * ══ 🔴 MON ESPACE « COÛTS ET CA » — LE TABLEAU RÉCAPITULATIF (Arno, 13/11/2026) — RÈGLES PURES ════════════════════════════════════════════════════
 * Douze mois (l'année civile, ou les 12 derniers mois glissants) + le total ; en lignes : les COÛTS par famille (chaque poste, un sous-total par
 * famille, le total des coûts) puis le CA GESTION (honoraires de gestion, honoraires GLI, CA global calculé).
 * AUCUN CALCUL PROPRE (une seule comptabilité) : chaque montant est celui de `coutsDuPoint` (l'onglet « Coûts et CA », « Coûts globaux » du Suivi
 * CA) et de `caGestionDuPoint` (le CA de gestion du Suivi CA) ; le total d'une ligne = la somme de ses mois affichés, au centime.
 * L'ÉTAT d'une cellule saisie (mois révolu seulement : le mois en cours et les suivants sont neutres) : « complet » quand le poste du mois est coché ✓,
 * « à compléter » sinon — la même règle que la saisie du mois et l'indicateur. FUSION : la vente se valide dans chaque structure, la location, la
 * gestion et le CA à CRITERIMMO. ADHOC et honoraires repris d'un import : en lecture (corriger dans Suivi CA › Gestion), complets d'office.
 */
export type PeriodeRecap = 'annee' | 'glissant';
export const estPeriodeRecap = (x: unknown): x is PeriodeRecap => x === 'annee' || x === 'glissant';

/** Les 12 mois de la fenêtre : l'année civile (décalée de `decalage` années) ou les 12 mois finissant au dernier mois écoulé (décalés de `decalage` mois). PUR. */
export function moisDeLaFenetre(periode: PeriodeRecap, jour: string, decalage = 0): MoisAn[] {
  if (periode === 'annee') { const a = Number(jour.slice(0, 4)) + decalage; return Array.from({ length: 12 }, (_, i) => ({ annee: a, mois: i + 1 })); }
  const fin = moisProposes(jour)[0];
  const rang = fin.annee * 12 + (fin.mois - 1) + decalage;
  return Array.from({ length: 12 }, (_, i) => { const r = rang - 11 + i; return { annee: Math.floor(r / 12), mois: (r % 12) + 1 }; });
}
/** Les abréviations usuelles des mois (en-têtes de colonne, libellé de la fenêtre). */
export const MOIS_ABREGES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;
const court = (m: MoisAn): string => MOIS_ABREGES[m.mois - 1];
/** « oct. 26 » : l'en-tête d'une colonne. PUR. */
export const moisAbrege = (m: MoisAn): string => `${MOIS_ABREGES[m.mois - 1]} ${String(m.annee).slice(2)}`;
/** « Année 2026 (janv.–déc.) » / « 12 derniers mois (nov. 2025 – oct. 2026) ». PUR. */
export function libelleFenetre(periode: PeriodeRecap, ms: readonly MoisAn[]): string {
  const a = ms[0]; const b = ms[ms.length - 1];
  return periode === 'annee' ? `Année ${a.annee} (janv.–déc.)` : `12 derniers mois (${court(a)} ${a.annee} – ${court(b)} ${b.annee})`;
}
export const cleMoisAn = (m: MoisAn): string => `${m.annee}-${String(m.mois).padStart(2, '0')}`;

/** Ce qu'un clic sur la cellule permet : rien ; l'édition sur place (un montant du mois) ; la saisie du mois (postes à plusieurs lignes) ; la lecture d'un import. */
export type EditionRecap = { sorte: 'aucune' } | { sorte: 'lignes'; famille: FamilleCout; poste: 'salaires' | 'autres' | 'remunerations' }
  | { sorte: 'gestion'; poste: 'adhoc' | 'monga' } | { sorte: 'ca'; poste: PosteCa };
/** 🔴 « provisoire » : une ligne de résultat (le CA net de gestion) calculée sur un mois dont une donnée est encore à compléter. */
export type EtatCellule = 'complet' | 'a-completer' | 'neutre' | 'provisoire';
export interface CelluleRecap { mois: MoisAn; m: MontantC; etat: EtatCellule; modifiable: 'non' | 'sur-place' | 'saisie-du-mois' | 'importe' }
export type NiveauLigne = 'poste' | 'info' | 'sous-total' | 'total' | 'calcule' | 'resultat';
export interface LigneRecap { cle: string; libelle: string; section: 'couts' | 'ca'; famille: FamilleCout | null; niveau: NiveauLigne; edition: EditionRecap;
  cellules: CelluleRecap[]; total: MontantC }
export interface TableauRecap { mois: MoisAn[]; lignes: LigneRecap[];
  /** Par mois : au moins une cellule « à compléter » (l'en-tête de la colonne le signale). */
  moisIncomplets: boolean[] }

const RIEN: MontantC = { htC: 0, ttcC: 0 };
const plus = (a: MontantC, b: MontantC): MontantC => ({ htC: a.htC + b.htC, ttcC: a.ttcC + b.ttcC });
const AUCUNE: EditionRecap = { sorte: 'aucune' };
/** Le mois est-il révolu (avant le mois en cours) ? Seuls les mois révolus ont un état « complet / à compléter ». PUR. */
export const moisRevolu = (m: MoisAn, jour: string): boolean => m.annee * 100 + m.mois < Number(jour.slice(0, 4)) * 100 + Number(jour.slice(5, 7));

export interface EntreesRecap { e: EntreesCoutsGlobaux; agence: Agence; mois: readonly MoisAn[]; jour: string; validations: readonly Validation[] | null;
  versionsGestion: Readonly<Record<string, { version: number; origine: string }>>; monga: boolean; caGestion: boolean;
  /** 🔴 472 — le poste « Rémunérations associés » est-il disponible (sinon : lu à 0, sans état ni saisie) ? */
  remunerations?: boolean }

/** Le tableau récapitulatif d'une structure sur une fenêtre de mois. PUR. */
export function tableauRecap(x: EntreesRecap): TableauRecap {
  const { e, agence, jour } = x;
  const ms = [...x.mois];
  const points = ms.map((m) => coutsDuPoint(e, agence, m.annee, m.mois));
  const ca = ms.map((m) => caGestionDuPoint(e.gestion, agence, m.annee, m.mois));
  const lg = avecLocationGestion(agence);
  const importe = (m: MoisAn): boolean => x.versionsGestion[cleMoisAn(m)]?.origine === 'import';
  // FUSION se lit : aucune modification (la saisie se fait par structure) ; CRITERIMMO / MACJ : les postes de la structure
  const saisissable = agence !== 'tous';
  const structuresDe = (f: FamilleCout): Societe[] => (f === 'vente' ? (agence === 'tous' ? ['criterimmo', 'macj'] : [agence as Societe]) : ['criterimmo']);
  const etatPoste = (f: FamilleCout, poste: Validation['poste'], m: MoisAn): EtatCellule => {
    if (x.validations === null || !moisRevolu(m, jour)) return 'neutre';
    return structuresDe(f).every((s) => estValide(x.validations!, s, { famille: f, poste }, m)) ? 'complet' : 'a-completer';
  };
  const lignes: LigneRecap[] = [];
  const ajouter = (l: Omit<LigneRecap, 'cellules' | 'total'>, valeur: (i: number) => MontantC, cellule: (m: MoisAn) => Pick<CelluleRecap, 'etat' | 'modifiable'> =
    () => ({ etat: 'neutre', modifiable: 'non' })) => {
    const cellules = ms.map((m, i) => ({ mois: m, m: valeur(i), ...cellule(m) }));
    lignes.push({ ...l, cellules, total: cellules.reduce((t, c) => plus(t, c.m), RIEN) });
  };
  const poste = (f: FamilleCout, cle: string, libelle: string, valeur: (p: CoutsDuPoint) => MontantC | undefined, edition: EditionRecap, niveau: NiveauLigne = 'poste') =>
    ajouter({ cle: `${f}-${cle}`, libelle, section: 'couts', famille: f, niveau, edition }, (i) => valeur(points[i]) ?? RIEN, (m) => {
      if (edition.sorte === 'aucune') return { etat: 'neutre', modifiable: 'non' };
      if (edition.sorte === 'gestion' && edition.poste === 'adhoc' && importe(m)) return { etat: 'neutre', modifiable: 'importe' };
      if (edition.sorte === 'gestion' && edition.poste === 'monga' && !x.monga) return { etat: 'neutre', modifiable: 'non' };
      const p = edition.sorte === 'lignes' ? edition.poste : edition.sorte === 'gestion' ? edition.poste : null;
      return { etat: p === null ? 'neutre' : etatPoste(f, p, m), modifiable: !saisissable ? 'non' : edition.sorte === 'lignes' ? 'saisie-du-mois' : 'sur-place' };
    });
  // ── COÛTS : la vente (toutes les structures), puis la location et la gestion (CRITERIMMO, donc aussi FUSION) ──
  poste('vente', 'commissions', 'Commissions des négociateurs', (p) => p.vente.commissions, AUCUNE);
  poste('vente', 'apporteurs', 'Apporteurs', (p) => p.vente.apporteurs, AUCUNE);
  poste('vente', 'exterieures', 'Agences extérieures', (p) => p.vente.exterieures, AUCUNE);
  // 🔴 472 — « Rémunérations associés », juste au-dessus des salaires chargés (la saisie du mois, comme eux)
  poste('vente', 'remunerations', 'Rémunérations associés', (p) => p.vente.remunerations, x.remunerations === false ? AUCUNE : { sorte: 'lignes', famille: 'vente', poste: 'remunerations' });
  poste('vente', 'salaires', 'Salaires chargés', (p) => p.vente.salaires, { sorte: 'lignes', famille: 'vente', poste: 'salaires' });
  poste('vente', 'autres', 'Autres', (p) => p.vente.autres, { sorte: 'lignes', famille: 'vente', poste: 'autres' });
  poste('vente', 'total', 'Sous-total vente', (p) => p.vente.total, AUCUNE, 'sous-total');
  if (lg) {
    poste('location', 'apporteurs', 'Apporteurs', (p) => p.location?.apporteurs, AUCUNE);
    poste('location', 'variable', 'Variable négociateur (primes incluses)', (p) => p.location?.variable, AUCUNE);
    poste('location', 'primes', 'dont primes de gestion', (p) => p.location?.primes, AUCUNE, 'info');
    poste('location', 'salaires', 'Salaires chargés', (p) => p.location?.salaires, { sorte: 'lignes', famille: 'location', poste: 'salaires' });
    poste('location', 'part-gestion', 'Part de gestion versée aux apporteurs', (p) => p.location?.partGestion, AUCUNE);
    poste('location', 'collegues', 'Rémunération des collègues apporteurs', (p) => p.location?.collegues, AUCUNE);
    poste('location', 'autres', 'Autres', (p) => p.location?.autres, { sorte: 'lignes', famille: 'location', poste: 'autres' });
    poste('location', 'total', 'Sous-total location', (p) => p.location?.total, AUCUNE, 'sous-total');
    poste('gestion', 'salaires', 'Salaires chargés', (p) => p.gestion?.salaires, { sorte: 'lignes', famille: 'gestion', poste: 'salaires' });
    poste('gestion', 'adhoc', 'ADHOC', (p) => p.gestion?.adhoc, { sorte: 'gestion', poste: 'adhoc' });
    poste('gestion', 'monga', 'MONGA', (p) => p.gestion?.monga, { sorte: 'gestion', poste: 'monga' });
    poste('gestion', 'autres', 'Autres', (p) => p.gestion?.autres, { sorte: 'lignes', famille: 'gestion', poste: 'autres' });
    poste('gestion', 'total', 'Sous-total gestion', (p) => p.gestion?.total, AUCUNE, 'sous-total');
  }
  ajouter({ cle: 'couts-total', libelle: 'Total des coûts', section: 'couts', famille: null, niveau: 'total', edition: AUCUNE }, (i) => points[i].total);
  // ── CA GESTION : CRITERIMMO (et FUSION, qui en est le CA) ; jamais MACJ ──
  if (lg) {
    const etatCa = (p: PosteCa, m: MoisAn): EtatCellule => (!x.caGestion || x.validations === null || !moisRevolu(m, jour) ? 'neutre'
      : estValide(x.validations, 'criterimmo', { famille: 'gestion', poste: p }, m) ? 'complet' : 'a-completer');
    const lCa = (p: PosteCa, libelle: string, k: 'honoraires' | 'gli') => ajouter({ cle: `ca-${p}`, libelle, section: 'ca', famille: null, niveau: 'poste', edition: { sorte: 'ca', poste: p } },
      (i) => ca[i]?.[k] ?? RIEN, (m) => (p === 'honoraires' && importe(m) ? { etat: 'neutre', modifiable: 'importe' }
        : { etat: etatCa(p, m), modifiable: saisissable && x.caGestion ? 'sur-place' : 'non' }));
    lCa('honoraires', 'Honoraires de gestion', 'honoraires');
    lCa('gli', 'Honoraires GLI (garantie de loyers impayés)', 'gli');
    ajouter({ cle: 'ca-total', libelle: 'CA global de gestion', section: 'ca', famille: null, niveau: 'calcule', edition: AUCUNE }, (i) => ca[i]?.total ?? RIEN);
    // ══ 🔴 Arno (13/11/2026) — le résultat de la gestion, DÉRIVÉ (rien n'est stocké) : les coûts de gestion = EXACTEMENT la ligne « Sous-total gestion »
    // des coûts (même mois, même structure) ; CA net = CA global − coûts de gestion, en HT et en TTC chacun dans son mode. Un mois dont une donnée
    // de la gestion (coûts ou CA) est « à compléter » : le CA net s'affiche, « provisoire ».
    const sousTotal = lignes.find((l) => l.cle === 'gestion-total')!;
    const caTotal = lignes.find((l) => l.cle === 'ca-total')!;
    ajouter({ cle: 'ca-couts-gestion', libelle: 'Coûts de gestion (repris du sous-total gestion)', section: 'ca', famille: null, niveau: 'calcule', edition: AUCUNE },
      (i) => sousTotal.cellules[i].m);
    const aCompleter = (i: number): boolean => lignes.some((l) => (l.famille === 'gestion' || (l.section === 'ca' && l.niveau === 'poste')) && l.cellules[i].etat === 'a-completer');
    ajouter({ cle: 'ca-net', libelle: 'CA net de gestion', section: 'ca', famille: null, niveau: 'resultat', edition: AUCUNE },
      (i) => ({ htC: caTotal.cellules[i].m.htC - sousTotal.cellules[i].m.htC, ttcC: caTotal.cellules[i].m.ttcC - sousTotal.cellules[i].m.ttcC }),
      (m) => ({ etat: aCompleter(ms.findIndex((x) => x.annee === m.annee && x.mois === m.mois)) ? 'provisoire' : 'neutre', modifiable: 'non' }));
  }
  const moisIncomplets = ms.map((_, i) => lignes.some((l) => l.cellules[i].etat === 'a-completer'));
  return { mois: ms, lignes, moisIncomplets };
}

/** Le lien de la saisie du mois (postes à plusieurs lignes) : l'onglet « Coûts et CA », la structure, le mois, la partie. PUR. */
export const lienSaisieDuMois = (societe: Societe, m: MoisAn, partie: 'couts' | 'ca'): string =>
  `/admin/mon-espace?espace=${societe}&onglet=couts&saisie=${cleMoisAn(m)}&partie=${partie}`;
/** Le lien « corriger dans Suivi CA › Gestion » d'un mois repris d'un import. PUR. */
export const lienSuiviCaGestion = (m: MoisAn): string => `/admin/transaction/gestion?vue=mois&annee=${m.annee}&mois=${m.mois}`;
/** L'adresse du récapitulatif (suit « Voir »). PUR. */
export const lienRecap = (agence: Agence): string => `/admin/mon-espace/recapitulatif?agence=${agence}`;
