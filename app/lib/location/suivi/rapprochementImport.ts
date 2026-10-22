import type { LigneExcel } from './lectureExcel';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : RAPPROCHER LE SUIVI D'ARNO DES BAUX DE L'OUTIL (Arno, 22/10/2026) ══════════════════════════
 * Chaque ligne du fichier (propriétaire, locataire, mois) cherche SON bail dans l'outil, avec un SCORE de confiance (0 à 1) :
 *   nom du propriétaire (45 %) + nom du ou des locataires (45 %) + proximité du mois de signature et de l'entrée (10 %).
 *   Un avenant (signé sur un bail ancien) ne regarde que les noms.
 * Score ≥ 0,80 → « rapprochée » ; ≥ 0,50 → « douteuse » (proposée, non rattachée) ; sinon « non trouvée ». Un bail ne sert
 * qu'UNE fois (le meilleur score l'emporte). La ligne non rapprochée n'est jamais perdue : elle entre comme « historique non
 * rattaché ». PUR.
 */

export interface CandidatBail {
  bailId: number;
  lotId: number;
  entree: string | null;
  proprietaireId: number | null;
  proprietaire: string;
  locataires: string;
  locataireId: number | null;
  avecGestion: boolean | null;
  parking: boolean;
}

export type StatutRapprochement = 'rattache' | 'douteux' | 'non_rattache';
export interface Rapprochement { cle: string; candidat: CandidatBail | null; score: number; statut: StatutRapprochement }

export const SEUIL_RATTACHE = 0.8;
export const SEUIL_DOUTEUX = 0.5;

const VIDES = new Set(['SCI', 'SAS', 'SARL', 'SA', 'EURL', 'SNC', 'CIE', 'ET', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'M', 'MME', 'MR', 'MLLE',
  'PARK', 'PARKING', 'BOX', 'AVENANT', 'SOCIETE', 'CIVILE', 'IMMOBILIERE', 'PETIT', 'LOCAL', 'EPOUX', 'MONSIEUR', 'MADAME', 'IMMO']);

/** « SCI CAP FORTIUS (Parking) » → [CAP, FORTIUS] : majuscules, sans accents, sans mots vides ni nombres. PUR. */
export function mots(t: string): string[] {
  return [...new Set(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(' ')
    .filter((m) => m.length >= 2 && !/^\d+$/.test(m) && !VIDES.has(m)))];
}

/** Distance d'édition (insertion, suppression, substitution, interversion de deux lettres voisines). PUR. */
export function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Le même nom : identique, l'un préfixe de l'autre (≥ 4 lettres), ou UNE faute de frappe sur un nom de 5 lettres ou plus
 *  (« GANMIEN » / « GNAMIEN », « MILLION » / « MILLON », « MOURA » / « MOURRA »). */
const memeMot = (a: string, b: string): boolean => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))
  || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 1);

/** La part des mots du plus court des deux noms retrouvés dans l'autre (0 à 1). PUR. */
export function ressemblance(a: string, b: string): number {
  const x = mots(a);
  const y = mots(b);
  if (x.length === 0 || y.length === 0) return 0;
  const [court, long] = x.length <= y.length ? [x, y] : [y, x];
  return court.filter((m) => long.some((n) => memeMot(m, n))).length / court.length;
}

/** Proximité entre le mois du fichier (« AAAA-MM ») et l'entrée du bail : même mois 1 ; ±1 mois 0,7 ; ±2 mois 0,4 ; sinon 0. */
export function proximiteMois(mois: string, entree: string | null): number {
  if (entree === null) return 0;
  const ecart = Math.abs((Number(entree.slice(0, 4)) * 12 + Number(entree.slice(5, 7))) - (Number(mois.slice(0, 4)) * 12 + Number(mois.slice(5, 7))));
  return ecart === 0 ? 1 : ecart === 1 ? 0.7 : ecart === 2 ? 0.4 : 0;
}

export function scoreLigne(l: LigneExcel, c: CandidatBail): number {
  const p = ressemblance(l.proprietaire, c.proprietaire);
  const lo = ressemblance(l.locataire, c.locataires);
  if (l.avenant) return 0.5 * p + 0.5 * lo;
  const d = proximiteMois(l.mois, c.entree);
  if (d === 0) return 0;
  return 0.45 * p + 0.45 * lo + 0.1 * d;
}

const statutDe = (score: number): StatutRapprochement => (score >= SEUIL_RATTACHE ? 'rattache' : score >= SEUIL_DOUTEUX ? 'douteux' : 'non_rattache');

/** Rapproche toutes les lignes : chaque bail sert une fois, au meilleur score (les égalités : l'ordre du fichier). PUR. */
export function rapprocher(lignes: readonly LigneExcel[], candidats: readonly CandidatBail[]): Rapprochement[] {
  const paires: { i: number; c: CandidatBail; s: number }[] = [];
  lignes.forEach((l, i) => { for (const c of candidats) { const s = scoreLigne(l, c); if (s >= SEUIL_DOUTEUX) paires.push({ i, c, s }); } });
  paires.sort((a, b) => b.s - a.s || a.i - b.i);
  const pris = new Set<number>();
  const choix = new Map<number, { c: CandidatBail; s: number }>();
  for (const p of paires) {
    if (choix.has(p.i) || pris.has(p.c.bailId)) continue;
    choix.set(p.i, { c: p.c, s: p.s });
    pris.add(p.c.bailId);
  }
  return lignes.map((l, i) => {
    const ch = choix.get(i);
    if (ch === undefined) {
      const meilleur = Math.max(0, ...candidats.map((c) => scoreLigne(l, c)));
      return { cle: l.cle, candidat: null, score: meilleur, statut: 'non_rattache' as const };
    }
    return { cle: l.cle, candidat: ch.c, score: ch.s, statut: statutDe(ch.s) };
  });
}
