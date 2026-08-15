/**
 * N3-C — helpers PURS de l'éditeur des caractéristiques physiques d'un permis (motif `contactForm.ts`) : métadonnées des champs,
 * construction du corps de requête et VALIDATION des bornes AVANT l'appel. Aucun React, aucune I/O → testables en Node. On
 * n'importe de `caracteristiquesRepo` (module serveur, pg) que des TYPES (piège du bundle client du 13/08). Les bornes sont
 * LUES des CHECK de la base (`parserBornesCheck`) et passées ici ; JAMAIS recopiées en dur.
 */
import type { ChampCorps, ValeursCorps } from '../../../../lib/permis/caracteristiquesRepo';

export type ChampMesure = Exclude<ChampCorps, 'emprise'>;
export interface Bornes { min: number; max: number }

/** Faits du permis affichés en LECTURE SEULE (motif FicheCommune) — jamais recopiés dans un champ éditable ni redoublés en base. */
export interface FaitsPermis {
  numDau: string; type: string;
  communeNom: string | null; codeInsee: string; adresse: string | null;
  natureTravaux: string | null;   // libellé EN CLAIR (traduit) ; null = non renseigné
  dateAutorisation: string | null;
  surfaceCreee: string | null;    // surf_creee si elle existe (N3-A) ; null = non fournie par Sitadel
}

/** Un champ MESURE : nom logique (cle), colonne SQL (pour lire `bornes[colonne]`), libellé, unité, entier ?, et le SOMMET signalé. */
export interface Mesure {
  cle: ChampMesure;
  colonne: string;      // = clé de `bornes` (parserBornesCheck indexe par colonne SQL)
  libelle: string;
  unite: string | null;
  entier: boolean;
  estSommet?: boolean;
  aide?: string;
}

/** Ordre d'affichage = ordre de l'énoncé N3-C. L'altitude du SOMMET est signalée (estSommet) : c'est LA valeur qui compte. */
export const MESURES: readonly Mesure[] = [
  { cle: 'nbEtages', colonne: 'nb_etages', libelle: 'Nombre d’étages', unite: null, entier: true },
  { cle: 'nbNiveauxSousSol', colonne: 'nb_niveaux_sous_sol', libelle: 'Niveaux de sous-sol', unite: null, entier: true },
  { cle: 'altitudeDernierPlancherNgf', colonne: 'altitude_dernier_plancher_ngf', libelle: 'Altitude du dernier plancher (NGF)', unite: 'm', entier: false },
  { cle: 'altitudeSommetNgf', colonne: 'altitude_sommet_ngf', libelle: 'Altitude du sommet (NGF)', unite: 'm', entier: false, estSommet: true,
    aide: 'Le HAUT de la construction (acrotère ou faîtage), pas le dernier plancher. C’est la valeur qui compte.' },
  { cle: 'hauteurRelativeM', colonne: 'hauteur_relative_m', libelle: 'Hauteur relative', unite: 'm', entier: false },
  { cle: 'altitudeTerrainNaturelNgf', colonne: 'altitude_terrain_naturel_ngf', libelle: 'Altitude du terrain naturel (NGF)', unite: 'm', entier: false },
];

/** Édition d'un corps : tout en CHAÎNE (les inputs). Une chaîne VIDE = champ vide (→ null explicite), jamais 0. */
export interface EditionCorps {
  repere: string;
  nbEtages: string; nbNiveauxSousSol: string;
  altitudeDernierPlancherNgf: string; altitudeSommetNgf: string;
  hauteurRelativeM: string; altitudeTerrainNaturelNgf: string;
}
/** Parking en TROIS états distincts : '' = non renseigné (NULL), 'oui' = true, 'non' = false. Jamais une case à cocher binaire. */
export interface EditionGlobal { parking: '' | 'oui' | 'non'; commentaire: string }

/** '' → null ; sinon le libellé de la borne « X à Y [unité] », pour le message de champ. Bornes LUES de la base. */
export function libelleBornes(m: Mesure, bornes?: Bornes): string {
  if (!bornes) return 'plage indisponible (contrainte introuvable en base)';
  return `valeur attendue entre ${bornes.min} et ${bornes.max}${m.unite ? ` ${m.unite}` : ''}`;
}

/** Chaîne → nombre : vide → null ; virgule tolérée ; entier exigé si `entier`. `{ ok:false }` = non numérique / non entier. */
function parseNombre(s: string, entier: boolean): { ok: true; valeur: number | null } | { ok: false } {
  const t = s.trim();
  if (t === '') return { ok: true, valeur: null }; // VIDE = null explicite (jamais 0)
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false };
  if (entier && !Number.isInteger(n)) return { ok: false };
  return { ok: true, valeur: n };
}

export type ErreursCorps = Partial<Record<ChampMesure, string>>;

/**
 * Construit le corps `ValeursCorps` (nombres ou null) depuis l'édition d'un corps, et les erreurs par champ. Un champ VIDE →
 * `null` explicite (posé). Un champ INVALIDE (non numérique ou HORS BORNES) → EXCLU du corps (non touché) + message citant les
 * bornes RÉELLES lues de la base. `mode 'saisie'` est décidé par la route, pas ici.
 */
export function construireCorps(ed: EditionCorps, bornes: Record<string, Bornes | undefined>): { valeurs: ValeursCorps; erreurs: ErreursCorps; valide: boolean } {
  const valeurs: ValeursCorps = {};
  const erreurs: ErreursCorps = {};
  for (const m of MESURES) {
    const p = parseNombre(ed[m.cle], m.entier);
    if (!p.ok) { erreurs[m.cle] = m.entier ? 'nombre entier attendu' : 'nombre attendu'; continue; }
    if (p.valeur !== null) {
      const b = bornes[m.colonne];
      if (b && (p.valeur < b.min || p.valeur > b.max)) { erreurs[m.cle] = libelleBornes(m, b); continue; }
    }
    valeurs[m.cle] = p.valeur; // présent (vidé → null explicite)
  }
  return { valeurs, erreurs, valide: Object.keys(erreurs).length === 0 };
}

/** repère : chaîne vide → null (anonyme). */
export function repereDepuisEdition(repere: string): string | null {
  const t = repere.trim();
  return t === '' ? null : t;
}

/** Corps de requête du GLOBAL. Une clé n'est incluse QUE si présente (sémantique `ecrireContact` : champ absent → non touché). */
export function construireGlobal(ed: Partial<EditionGlobal>): { parking?: boolean | null; commentaire?: string | null } {
  const body: { parking?: boolean | null; commentaire?: string | null } = {};
  if (ed.parking !== undefined) body.parking = ed.parking === '' ? null : ed.parking === 'oui'; // '' → null, 'oui' → true, 'non' → false
  if (ed.commentaire !== undefined) { const c = ed.commentaire.trim(); body.commentaire = c === '' ? null : c; }
  return body;
}

/** number|null → chaîne pour un input : null → '' (VIDE), 0 → '0' (distinct). Jamais « 0 » à la place d'un vide. */
export function valeurVersInput(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}
