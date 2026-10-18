/**
 * ══ 🔴🔴 LE PRÉAVIS DU LOCATAIRE (Arno, 18/10/2026). MODULE PUR. ════════════════════════════════════════════════════════
 *
 * « Nouveau statut EN PRÉAVIS : on saisit la DATE DE RÉCEPTION DU RECOMMANDÉ (obligatoire) ; l'outil en déduit la DATE
 * MAXIMALE DE SORTIE = réception + durée de préavis. Durée proposée : meublé → 1 mois ; vide → 1 mois si la commune du bien
 * est en zone tendue, sinon 3 mois. Modifiable préavis par préavis (1 ou 3 mois, ou date maximale saisie à la main), avec un
 * motif libre facultatif. » (Arno)
 *   · Pendant le préavis le locataire OCCUPE toujours le logement : « en préavis — sortie au plus tard le JJ/MM/AAAA ».
 *   · Date maximale dépassée sans sortie saisie : rien d'automatique — « Préavis échu — sortie à saisir ».
 * Ce module ne lit rien et n'écrit rien.
 */

import type { EdlsAffiche } from './edls';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function dateIsoValide(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** « 19/10/2026 » depuis « 2026-10-19 ». */
export function dateFrPreavis(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m === null ? 'date inconnue' : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * AJOUTE N MOIS À UNE DATE, au calendrier : le 15/01 + 1 mois = le 15/02 ; un jour qui n'existe pas dans le mois d'arrivée
 * est ramené au dernier jour de ce mois (31/01 + 1 mois = 28 ou 29/02). PUR.
 */
export function ajouterMois(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export type DureeMois = 1 | 3;

/** La durée proposée par défaut. Un bien dont le caractère meublé est inconnu est traité comme VIDE (la règle la plus longue). */
export function dureeProposee(o: { meuble: boolean | null; zoneTendue: boolean }): { duree: DureeMois; raison: string } {
  if (o.meuble === true) return { duree: 1, raison: 'logement meublé' };
  const vide = o.meuble === false ? 'logement vide' : 'logement vide (caractère meublé non renseigné)';
  return o.zoneTendue ? { duree: 1, raison: `${vide} en zone tendue` } : { duree: 3, raison: `${vide} hors zone tendue` };
}

export type ModePreavis = { mode: 'mois'; duree: DureeMois } | { mode: 'date_manuelle'; dateMax: string };

/** La date maximale de sortie. PUR. */
export function dateMaxPreavis(recuLe: string, choix: ModePreavis): string {
  return choix.mode === 'mois' ? ajouterMois(recuLe, choix.duree) : choix.dateMax;
}

export const MOTIF_MAX = 500;

export type VerdictPreavis = { ok: true; dateMax: string } | { ok: false; motif: string };

/**
 * Le contrôle d'un préavis (le même à l'écran et dans la transaction) : réception obligatoire, valide, jamais dans le futur
 * ni avant l'entrée dans les lieux ; date maximale (calculée ou saisie) jamais avant la réception. PUR.
 */
export function verifierPreavis(
  o: { recuLe: unknown; choix: ModePreavis | null; motif?: string | null; entrees: readonly (string | null)[] }, aujourdhui: string,
): VerdictPreavis {
  if (o.recuLe === null || o.recuLe === undefined || o.recuLe === '') return { ok: false, motif: 'Saisissez la date de réception du recommandé' };
  if (!dateIsoValide(o.recuLe)) return { ok: false, motif: 'La date de réception n’est pas une date valide' };
  if (o.recuLe > aujourdhui) return { ok: false, motif: 'La date de réception ne peut pas être dans le futur' };
  const entree = o.entrees.filter((e): e is string => e !== null).sort().pop();
  if (entree !== undefined && o.recuLe < entree) return { ok: false, motif: `La date de réception ne peut pas précéder l’entrée du ${dateFrPreavis(entree)}` };
  if (o.choix === null) return { ok: false, motif: 'Choisissez la durée du préavis' };
  if (o.choix.mode === 'mois' && o.choix.duree !== 1 && o.choix.duree !== 3) return { ok: false, motif: 'La durée du préavis est de 1 ou 3 mois' };
  if (o.choix.mode === 'date_manuelle') {
    if (!dateIsoValide(o.choix.dateMax)) return { ok: false, motif: 'Saisissez la date maximale de sortie' };
    if (o.choix.dateMax < o.recuLe) return { ok: false, motif: 'La date maximale ne peut pas précéder la réception du recommandé' };
  }
  if ((o.motif ?? '').length > MOTIF_MAX) return { ok: false, motif: `Le motif dépasse ${MOTIF_MAX} caractères` };
  return { ok: true, dateMax: dateMaxPreavis(o.recuLe, o.choix) };
}

/** Un préavis OUVERT, tel que les écrans le reçoivent. */
export interface PreavisAffiche {
  id: number;
  occupationId: number;
  recuLe: string;
  dateMax: string;
  mode: 'mois' | 'date_manuelle';
  dureeMois: number | null;
  motif: string | null;
  creePar: string;
  creeLe: string;
  /** La date de l'état des lieux de sortie prévu (migration 384) ; `null` / absente = non saisie. */
  etatDesLieuxLe?: string | null;
}

/** Le statut d'un préavis ouvert : « en préavis » jusqu'à la date maximale, « échu » au-delà. PUR. */
export function statutPreavis(p: Pick<PreavisAffiche, 'dateMax'>, aujourdhui: string): 'en_preavis' | 'echu' {
  return p.dateMax < aujourdhui ? 'echu' : 'en_preavis';
}

/** La mention à afficher (avec le MOT, jamais la couleur seule). PUR. */
export function mentionPreavis(p: Pick<PreavisAffiche, 'dateMax'>, aujourdhui: string): string {
  return statutPreavis(p, aujourdhui) === 'echu'
    ? `Préavis échu — sortie à saisir (au plus tard le ${dateFrPreavis(p.dateMax)})`
    : `en préavis — sortie au plus tard le ${dateFrPreavis(p.dateMax)}`;
}

/** La mention COURTE (lignes de l'accueil, où la date figure à côté) : « en préavis » ou « Préavis échu — sortie à saisir ». PUR. */
export function mentionCourtePreavis(p: Pick<PreavisAffiche, 'dateMax'>, aujourdhui: string): string {
  return statutPreavis(p, aujourdhui) === 'echu' ? 'Préavis échu — sortie à saisir' : 'en préavis';
}

// ══ LA ZONE TENDUE — une DONNÉE EN BASE (`gestion_zone_tendue`), jamais une constante ══════════════════════════════════

export interface RegleZoneTendue { portee: 'departement' | 'commune'; code: string; commune: string | null }

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Le bien est-il en zone tendue, d'après les règles en base ? Un DÉPARTEMENT couvre tout code postal qui commence par son
 * numéro ; une COMMUNE se reconnaît à son code postal ET à son nom (sans accents ni casse). Sans code postal : non. PUR.
 */
export function enZoneTendue(lot: { codePostal: string | null; commune: string | null }, regles: readonly RegleZoneTendue[]): boolean {
  const cp = (lot.codePostal ?? '').replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return false;
  return regles.some((r) => (r.portee === 'departement'
    ? cp.startsWith(r.code.trim())
    : cp === r.code.trim() && r.commune !== null && sansAccents(r.commune) === sansAccents(lot.commune ?? '')));
}

// ══ L'ÉTAT DES LIEUX DE SORTIE PRÉVU et LE BLOC « LOCATAIRES EN PRÉAVIS » DE L'ACCUEIL (Arno, 18/10/2026) ═══════════════

export const EDL_MOIS_APRES_FIN = 6;

/**
 * La date d'état des lieux : facultative (vide = EFFACER), jamais avant la réception du recommandé, jamais plus de 6 mois
 * après la fin du préavis (sur le groupe : la réception la plus tardive, la fin la plus tardive). PUR.
 */
export function verifierEtatDesLieux(date: unknown, groupe: readonly { recuLe: string; dateMax: string }[]): { ok: true; date: string | null } | { ok: false; motif: string } {
  if (date === null || date === undefined || date === '') return { ok: true, date: null };
  if (!dateIsoValide(date)) return { ok: false, motif: 'La date d’état des lieux n’est pas une date valide' };
  const recu = groupe.map((g) => g.recuLe).sort().pop();
  const fin = groupe.map((g) => g.dateMax).sort().pop();
  if (recu !== undefined && date < recu) return { ok: false, motif: `L’état des lieux ne peut pas précéder la réception du recommandé (${dateFrPreavis(recu)})` };
  if (fin !== undefined && date > ajouterMois(fin, EDL_MOIS_APRES_FIN)) {
    return { ok: false, motif: `L’état des lieux ne peut pas dépasser de plus de ${EDL_MOIS_APRES_FIN} mois la fin du préavis (au plus tard le ${dateFrPreavis(ajouterMois(fin, EDL_MOIS_APRES_FIN))})` };
  }
  return { ok: true, date };
}

/** Une ligne du bloc de l'accueil : UN préavis (les locataires d'un même bail, reçus ensemble, même fin). */
export interface LignePreavisAccueil {
  cle: string;
  lotId: number;
  adresse: string | null;
  /** L'occupation de référence (écran de sortie, lecture du bail). */
  occupationId: number;
  occupationIds: number[];
  locataires: { occupationId: number; locataireId: number; nom: string }[];
  recuLe: string;
  dateMax: string;
  /** `null` = non saisie (ou migration 384 absente). */
  etatDesLieuxLe: string | null;
  /** Arno (19/10/2026) — l'état des lieux de sortie PLANIFIÉ (tâche du module de tâches) ; absent = pas planifié (ou migration 385 absente). */
  edls?: EdlsAffiche | null;
}

export type CleTri = 'fin' | 'edl';
export type SensTri = 'asc' | 'desc';
export interface TriPreavis { cle: CleTri; sens: SensTri }
/** Par défaut : la fin de préavis la plus proche d'abord. */
export const TRI_DEFAUT: TriPreavis = { cle: 'fin', sens: 'asc' };

/** Le tri : par fin de préavis ou par état des lieux, dans un sens ; les lignes SANS état des lieux toujours à la fin. PUR. */
export function trierPreavis(lignes: readonly LignePreavisAccueil[], tri: TriPreavis): LignePreavisAccueil[] {
  const val = (l: LignePreavisAccueil): string | null => (tri.cle === 'fin' ? l.dateMax : l.etatDesLieuxLe);
  return [...lignes].sort((a, b) => {
    const x = val(a); const y = val(b);
    if (x === null && y === null) return a.dateMax.localeCompare(b.dateMax) || a.cle.localeCompare(b.cle);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = tri.sens === 'asc' ? x.localeCompare(y) : y.localeCompare(x);
    return c !== 0 ? c : a.cle.localeCompare(b.cle);
  });
}

/** Lit un tri mémorisé (préférence locale) ; tout ce qui n'est pas reconnu rend le tri par défaut. PUR. */
export function lireTri(brut: string | null): TriPreavis {
  if (brut === null) return TRI_DEFAUT;
  const [cle, sens] = brut.split(':');
  return (cle === 'fin' || cle === 'edl') && (sens === 'asc' || sens === 'desc') ? { cle, sens } : TRI_DEFAUT;
}
