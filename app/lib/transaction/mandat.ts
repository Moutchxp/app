import { LIBELLE_SOCIETE, type Societe } from './modele';

/**
 * ══ 🔴 MON ESPACE, LOT 2 (Arno, 02/11/2026) — LE NUMÉRO DE MANDAT D'UNE VENTE : LA SEULE RÈGLE DE COMPARAISON ══════════════════════════════
 *
 * Décisions d'Arno (docs/PLAN_MON_ESPACE.md, « Décisions métier ») : le n° de mandat est OBLIGATOIRE à la création d'un compromis (tuile
 * Suivi CA comme « Mon espace ») et facultatif pour les fiches existantes ; AUCUN doublon de vente : un n° n'existe qu'une fois par structure
 * (CRITERIMMO / MACJ), hors fiches annulées et retirées (migration 449, index unique sur la forme NORMALISÉE).
 *
 * La normalisation est faite ICI et nulle part ailleurs (ni en SQL, ni dans un écran) : la base garde la saisie telle quelle
 * (`numero_mandat`) et sa forme normalisée (`numero_mandat_normalise`), écrite par le serveur avec CETTE fonction. Les lots 5 et 6 (créer,
 * rejoindre) la réutilisent. PUR.
 */

/** La longueur maximale d'un n° saisi (au-delà : refusé, pas tronqué). */
export const LONGUEUR_MAX_MANDAT = 40;

/**
 * La forme de comparaison d'un n° de mandat : sans accents, en majuscules, réduite aux lettres et chiffres (espaces, tirets, points, barres
 * obliques ignorés), chaque suite de chiffres sans ses zéros de tête (« 0042 » = « 42 » ; « 0 » reste « 0 »). Rien de lisible : null.
 * Exemples : « 2024 - 015 » → « 202415 » ; « m-0042 » → « M42 » ; « 00123 » → « 123 ».
 */
export function normaliserMandat(brut: string | null | undefined): string | null {
  if (typeof brut !== 'string') return null;
  // Les zéros de tête d'abord, suite par suite (« 2024-015 » = « 2024-15 ») ; les séparateurs ensuite (sinon les suites se colleraient).
  const sansZeros = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\d+/g, (chiffres) => chiffres.replace(/^0+(?=\d)/, ''));
  const forme = sansZeros.replace(/[^A-Z0-9]/g, '');
  return forme === '' ? null : forme;
}

/** Un n° saisi : tel qu'écrit (espaces de bord retirés) et sa forme de comparaison. */
export interface NumeroMandat { saisi: string; normalise: string }

/**
 * La lecture d'un champ « N° de mandat » : vide → null (rien de saisi) ; illisible ou trop long → un motif ; sinon le n°. PUR.
 */
export function lireNumeroMandat(brut: unknown): { ok: true; valeur: NumeroMandat | null } | { ok: false; motif: string } {
  if (brut === undefined || brut === null) return { ok: true, valeur: null };
  if (typeof brut !== 'string') return { ok: false, motif: 'N° de mandat illisible.' };
  const saisi = brut.trim().replace(/\s+/g, ' ');
  if (saisi === '') return { ok: true, valeur: null };
  if (saisi.length > LONGUEUR_MAX_MANDAT) return { ok: false, motif: `Le n° de mandat est trop long (${LONGUEUR_MAX_MANDAT} caractères au plus).` };
  const normalise = normaliserMandat(saisi);
  if (normalise === null) return { ok: false, motif: 'Le n° de mandat doit contenir au moins une lettre ou un chiffre.' };
  return { ok: true, valeur: { saisi, normalise } };
}

export const MOTIF_MANDAT_OBLIGATOIRE = 'Le n° de mandat est obligatoire pour créer un compromis. Rien n’a été enregistré.';
export const MOTIF_MANDAT_INEFFACABLE = 'Le n° de mandat ne s’efface pas : corrigez-le s’il est faux. Rien n’a été enregistré.';
export const MOTIF_SANS_449 = 'Le n° de mandat est disponible après la mise à jour de la base (migration 449) : rien n’a été enregistré.';
/** Le refus quand la base elle-même bloque un doublon (deux saisies simultanées, rétablissement, annulation d'un geste). */
export const MOTIF_DOUBLON_MANDAT = 'Ce n° de mandat existe déjà dans cette structure, sur une autre vente en cours ou vendue. Rien n’a été enregistré.';

/** La vente qui porte déjà un n° (ce que l'écran dit d'elle). */
export interface VenteDuMandat {
  id: number; societe: Societe; numero: string; libelle: string; statut: 'compromis' | 'vendue';
  dateCompromis: string | null; dateActe: string | null; adresseBien: string | null;
}

const jourFr = (d: string): string => d.split('-').reverse().join('/');

/** « Ce mandat existe déjà : … » — le résumé de la vente qui porte déjà le n° dans la structure. PUR. */
export function motifMandatPris(v: VenteDuMandat): string {
  const etat = v.statut === 'vendue'
    ? `vendue${v.dateActe !== null ? ` (acte du ${jourFr(v.dateActe)})` : ''}`
    : `compromis en cours${v.dateCompromis !== null ? ` (signé le ${jourFr(v.dateCompromis)})` : ''}`;
  const bien = v.adresseBien !== null ? `, ${v.adresseBien}` : '';
  return `Ce mandat existe déjà : n° ${v.numero} chez ${LIBELLE_SOCIETE[v.societe]} — « ${v.libelle} »${bien}, ${etat}. Rien n’a été enregistré.`;
}
