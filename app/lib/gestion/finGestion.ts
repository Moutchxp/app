import type { StatutBien } from './statutBien';

/**
 * ══ 🔴🔴 LA FIN DE GESTION EN DEUX TEMPS (Arno, 21/10/2026, migration 405). PUR. ═════════════════════════════════════════════
 *
 *   1. « GESTION TERMINÉE » (dès la sortie vers « Ancienne gestion ») : le bien RESTE visible dans la Gestion, avec un bandeau gris
 *      « Gestion terminée le jj/mm/aaaa — plus en gestion active » et une pastille grise ; hors compteurs actifs ; plus d'envoi ADHOC &
 *      MONGA ni de nouvelle tâche ; son dossier Drive ne bouge pas ; plus de dossiers annuels.
 *   2. ARCHIVAGE AUTOMATIQUE à la date de fin + le délai (24 mois par défaut, réglable), s'il y est TOUJOURS : il disparaît de la
 *      Gestion, son N5 part dans « Inactifs », il reste dans la Location ; l'Historique le dit.
 *   3. Reprise en gestion (ou passage en location seule) avant : rien n'est archivé ; le délai ne repart qu'à une NOUVELLE fin.
 *   4. Après archivage : « Reprendre en gestion » et « Remettre en location seule » restent possibles.
 * La date de fin est la date d'effet du statut « Ancienne gestion » (`statut_bien_depuis`).
 */
export const CLE_DELAI = 'archivage_fin_gestion_mois';
export const DELAI_DEFAUT_MOIS = 24;
export const DELAI_MIN_MOIS = 1;
export const DELAI_MAX_MOIS = 240;

export type EtapeFinGestion = 'active' | 'terminee' | 'archivee' | 'hors_gestion';

const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** Date civile + N mois (le 31 → dernier jour du mois d'arrivée). PUR. */
export function ajouterMois(iso: string, mois: number): string {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const total = (m - 1) + mois;
  const annee = a + Math.floor(total / 12);
  const moisArrivee = ((total % 12) + 12) % 12;
  const dernier = new Date(Date.UTC(annee, moisArrivee + 1, 0)).getUTCDate();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${annee}-${z(moisArrivee + 1)}-${z(Math.min(j, dernier))}`;
}

/** L'étape d'un bien. PUR. */
export function etapeFinGestion(b: { statut: StatutBien; archiveLe: string | null }): EtapeFinGestion {
  if (b.statut === 'en_gestion') return 'active';
  if (b.statut === 'location_seule') return 'hors_gestion';
  return b.archiveLe === null ? 'terminee' : 'archivee';
}

/** L'échéance de l'archivage d'un bien en « Gestion terminée » (sinon `null`). PUR. */
export function echeanceArchivage(b: { statut: StatutBien; archiveLe: string | null; fin: string | null }, delaiMois: number): string | null {
  if (etapeFinGestion(b) !== 'terminee' || b.fin === null) return null;
  return ajouterMois(b.fin, delaiMois);
}

/** Est-il à archiver AUJOURD'HUI (statut ACTUEL relu juste avant) ? PUR. */
export function aArchiver(b: { statut: StatutBien; archiveLe: string | null; fin: string | null }, delaiMois: number, aujourdhui: string): boolean {
  const e = echeanceArchivage(b, delaiMois);
  return e !== null && e <= aujourdhui;
}

/** Les dossiers annuels (PNO, taxe foncière, assurance habitation, chaudière…) : plus pour un bien en ancienne gestion. PUR. */
export const dossiersAnnuelsActifs = (statut: StatutBien | null | undefined): boolean => statut !== 'ancienne_gestion';

/** Le bandeau gris de la carte et de la fiche. PUR. */
export const texteBandeauGestionTerminee = (fin: string | null): string =>
  `Gestion terminée${fin ? ` le ${dateFr(fin)}` : ''} — plus en gestion active`;

/** « 2 ans », « 18 mois », « 1 an ». PUR. */
export const dureeMois = (mois: number): string => (mois % 12 === 0 ? `${mois / 12} an${mois / 12 > 1 ? 's' : ''}` : `${mois} mois`);

/** La ligne de l'Historique. PUR. */
export const phraseArchivage = (fin: string, mois: number): string => `Archivage automatique : fin de gestion le ${dateFr(fin)} + ${dureeMois(mois)}`;

/** Le délai saisi : un nombre entier de mois, entre 1 et 240. PUR. */
export function verifierDelai(brut: unknown): { ok: true; mois: number } | { ok: false; motif: string } {
  const n = typeof brut === 'number' ? brut : typeof brut === 'string' && /^\s*\d+\s*$/.test(brut) ? Number(brut) : NaN;
  if (!Number.isInteger(n) || n < DELAI_MIN_MOIS || n > DELAI_MAX_MOIS) {
    return { ok: false, motif: `Le délai d’archivage est un nombre entier de mois, entre ${DELAI_MIN_MOIS} et ${DELAI_MAX_MOIS}.` };
  }
  return { ok: true, mois: n };
}
