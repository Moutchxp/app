/**
 * ══ 🔴 LA DATE D'ARRÊTÉ DES COMPTES DE LA COPROPRIÉTÉ (Arno, 23/11/2026, migration 512). MODULE PUR. ══════════════════════════════════════════════
 * « Date d'arrêté des comptes » : un jour et un mois annuels, propres à chaque copropriété (ex. 31/12 ou 30/06). FACULTATIVE. Saisie dans la fiche
 * Copropriété (à côté des dates d'AGO) et dans la fenêtre de la sortie, par le même composant (`ArreteComptes`).
 * Un arrêté annuel doit exister chaque année : le 29/02 est refusé. ⚠️ AUCUN IMPORT QUI TIRE `pg` (partagé avec l'écran).
 */

export interface ArreteComptes { jour: number; mois: number }

/** La date d'arrêté telle que lue : la valeur (ou `null` : non renseignée), qui l'a saisie, quand (ISO). */
export interface ArreteComptesLu { arrete: ArreteComptes | null; par: string | null; le: string | null }

export const LIBELLE_ARRETE_COMPTES = 'Date d’arrêté des comptes';
export const AIDE_ARRETE_COMPTES = 'Jour et mois de clôture de l’exercice comptable de la copropriété, chaque année (ex. 31/12 ou 30/06). Facultatif.';
export const MOTIF_ARRETE_INCOMPLET = 'Choisissez le jour ET le mois de l’arrêté des comptes.';
export const MOTIF_ARRETE_INVALIDE = 'Ce jour n’existe pas chaque année dans ce mois (le 29/02 n’est pas accepté).';
export const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;

/** Le dernier jour d'un mois QUI EXISTE CHAQUE ANNÉE (février : 28). PUR. */
export const joursDuMois = (mois: number): number => (mois === 2 ? 28 : [4, 6, 9, 11].includes(mois) ? 30 : 31);

/** Le contrôle d'une saisie (le même au serveur) ; `null` / vide des deux côtés = « effacer » (non renseignée). PUR. */
export function verifierArrete(jour: unknown, mois: unknown): { ok: true; arrete: ArreteComptes | null } | { ok: false; motif: string } {
  const vide = (x: unknown): boolean => x === null || x === undefined || x === '';
  if (vide(jour) && vide(mois)) return { ok: true, arrete: null };
  const j = Number(jour); const m = Number(mois);
  if (vide(jour) || vide(mois) || !Number.isInteger(j) || !Number.isInteger(m)) return { ok: false, motif: MOTIF_ARRETE_INCOMPLET };
  if (m < 1 || m > 12 || j < 1 || j > joursDuMois(m)) return { ok: false, motif: MOTIF_ARRETE_INVALIDE };
  return { ok: true, arrete: { jour: j, mois: m } };
}

/** « 31/12 » ; `null` : « non renseignée ». Gardé pour le journal (valeurs avant / après) et le mail aux partenaires de la sortie. PUR. */
export const arreteFr = (a: ArreteComptes | null): string => (a === null ? 'non renseignée' : `${String(a.jour).padStart(2, '0')}/${String(a.mois).padStart(2, '0')}`);

/**
 * 🔴 (Arno, 25/11/2026, 23h13) — « ici il faut afficher la date de clôture des comptes en toutes lettres, par exemple "1er MARS" » : le jour en chiffres
 * (« 1er » pour le premier du mois), puis le mois en lettres MAJUSCULES, accents compris (« 15 JUIN », « 28 FÉVRIER », « 31 AOÛT », « 31 DÉCEMBRE »).
 * Pour l'ÉCRAN seulement (fenêtre de sortie, récapitulatif, fiche Copropriété) ; `null` : « non renseignée ». PUR.
 */
export const arreteEnLettres = (a: ArreteComptes | null): string =>
  (a === null ? 'non renseignée' : `${a.jour === 1 ? '1er' : String(a.jour)} ${(MOIS_FR[a.mois - 1] ?? '').toLocaleUpperCase('fr-FR')}`.trim());
