/**
 * N3-C — helpers PURS de l'éditeur des caractéristiques physiques d'un permis (motif `contactForm.ts`) : métadonnées des champs,
 * construction du corps de requête et VALIDATION des bornes AVANT l'appel. Aucun React, aucune I/O → testables en Node. On
 * n'importe de `caracteristiquesRepo` (module serveur, pg) que des TYPES (piège du bundle client du 13/08). Les bornes sont
 * LUES des CHECK de la base (`parserBornesCheck`) et passées ici ; JAMAIS recopiées en dur.
 */
import type { ChampCorps, ValeursCorps, ChampGlobalDeclare, ValeursGlobalDeclare } from '../../../../lib/permis/caracteristiquesRepo';
import type { ParcelleLigne } from '../../../../lib/permis/parcellesRepo';

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
  // N10-E — la limite administrative du PLU, à côté du sommet (l'écart doit sauter aux yeux). NGF ABSOLU pour être comparable au sommet.
  { cle: 'hauteurMaxPluNgf', colonne: 'hauteur_max_plu_ngf', libelle: 'Hauteur maximale PLU (NGF)', unite: 'm', entier: false,
    aide: 'Limite fixée par le règlement du PLU, en NGF ABSOLU (comparable au sommet). Si le règlement donne une hauteur RELATIVE, l’additionner à l’altitude du plateau de nivellement (lisible sur la coupe) avant de la saisir. Vaut pour ce bâtiment.' },
  { cle: 'hauteurRelativeM', colonne: 'hauteur_relative_m', libelle: 'Hauteur relative', unite: 'm', entier: false },
  { cle: 'altitudeTerrainNaturelNgf', colonne: 'altitude_terrain_naturel_ngf', libelle: 'Altitude du terrain naturel (NGF)', unite: 'm', entier: false },
];

/** Édition d'un corps : tout en CHAÎNE (les inputs). Une chaîne VIDE = champ vide (→ null explicite), jamais 0. */
export interface EditionCorps {
  repere: string;
  adresse: string; // N7-E — adresse déclarée du corps (saisie manuelle) ; écrite via definirAdresseCorps, pas via construireCorps
  nbEtages: string; nbNiveauxSousSol: string;
  altitudeDernierPlancherNgf: string; altitudeSommetNgf: string;
  hauteurMaxPluNgf: string; // N10-E — limite PLU (NGF)
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

/**
 * N13 — libellé COMPOSÉ des destinations, GÉNÉRÉ à l'affichage (jamais stocké). Style « A, b, et c » : la 1re destination garde
 * sa majuscule, les suivantes prennent une minuscule initiale ; virgules entre elles, « et » avant la dernière. PUR.
 * [] → '' (le caller affiche « non renseignée »). Exemples : 1 → « Bureau » ; 2 → « Bureau et restauration » ;
 * 3 → « Bureau, artisanat et commerce de détail, et restauration ».
 */
/**
 * N3-E — RAISON pour laquelle une parcelle n'a pas de géométrie rattachée. JAMAIS un vide muet ni « 0 » : soit une géométrie, soit
 * une raison explicite. PUR. Ordre : commune indéterminée (idu null) → département non chargé → référence introuvable au cadastre.
 */
export function raisonParcelleNonRattachee(p: Pick<ParcelleLigne, 'idu' | 'aGeometrie' | 'deptCharge' | 'reserve'>): string | null {
  if (p.aGeometrie) return null;
  if (!p.idu) return p.reserve ?? 'commune cadastrale indéterminée';
  if (!p.deptCharge) return `géométrie non chargée pour le département ${p.idu.slice(0, 2)}`;
  return `référence introuvable au cadastre (${p.idu})`;
}

/** N3-E — écart entre la superficie DÉCLARÉE (Cerfa) et la contenance CADASTRALE, au-delà de l'arrondi (> 1 m²). null si concordant/absent. PUR. */
export function ecartSuperficieCadastre(declareeM2: number | null, contenanceM2: number | null): string | null {
  if (declareeM2 === null || contenanceM2 === null) return null;
  return Math.abs(declareeM2 - contenanceM2) > 1 ? `écart : ${declareeM2} m² déclarés vs ${contenanceM2} m² au cadastre` : null;
}

export function composerLibelleDestinations(destinations: readonly string[]): string {
  const bas = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  if (destinations.length === 0) return '';
  if (destinations.length === 1) return destinations[0];
  if (destinations.length === 2) return `${destinations[0]} et ${bas(destinations[1])}`;
  const tete = [destinations[0], ...destinations.slice(1, -1).map(bas)].join(', ');
  return `${tete}, et ${bas(destinations[destinations.length - 1])}`;
}

// ── N7-E — champs DÉCLARÉS au niveau PERMIS (colonnes 106). Éditables comme les mesures, mais niveau permis, pas corps. ──────────
export type ChampPermis = ChampGlobalDeclare;
/** `genre` : 'liste' = sélecteur (valeurs venant du CHECK, jamais recopiées) | 'nombre' (≥ 0, ou bornes de la base si fournies) | 'texte'.
 *  `aide` : ligne d'explication SOUS le champ (ex. sommet permis : dire pourquoi la valeur est ici et pas sur un corps). */
export interface ChampDeclare { cle: ChampPermis; colonne: string; libelle: string; genre: 'liste' | 'nombre' | 'texte'; unite?: string | null; entier?: boolean; aide?: string }
export const CHAMPS_PERMIS: readonly ChampDeclare[] = [
  { cle: 'natureProjet', colonne: 'nature_projet', libelle: 'Nature du projet', genre: 'liste' },
  { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', libelle: 'Surface de plancher', genre: 'nombre', unite: 'm²', entier: false },
  { cle: 'nbLogements', colonne: 'nb_logements', libelle: 'Nombre de logements', genre: 'nombre', entier: true },
  { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', libelle: 'Places de stationnement', genre: 'nombre', entier: true },
  { cle: 'adresseTerrain', colonne: 'adresse_terrain', libelle: 'Adresse du terrain', genre: 'texte' },
  // N10-H — DÉSIGNATION de l'opération (nom du projet), texte libre VERBATIM. Placée EN DERNIER de la grille → juste avant les cases
  //   de destination, pour que la case vide cesse de ressembler à un échec quand le document dit clairement de quoi il s'agit.
  { cle: 'designation', colonne: 'designation', libelle: 'Désignation de l’opération', genre: 'texte',
    aide: 'Reprise telle qu’elle est écrite dans le dossier. Une valeur EXTRAITE peut porter un résidu de mise en page (mots espacés, ex. « M ultisport s ») dû au PDF — corrigez-la à la main, la correction est conservée définitivement.' },
  // N8-C — sommet AU NIVEAU PERMIS (migration 108). Le libellé DIT qu'il n'est pas rattaché à un corps ; l'aide dit POURQUOI.
  { cle: 'altitudeSommetNgf', colonne: 'altitude_sommet_ngf', libelle: 'Altitude du sommet du permis (NGF)', genre: 'nombre', unite: 'm', entier: false,
    aide: 'Point le plus haut relevé sur les planches du permis (acrotère ou faîtage le plus haut). NON rattaché à un bâtiment : l’attribution par lot n’est pas établie — c’est pourquoi il vit ici, au niveau du permis, et non sur un immeuble précis.' },
];
/** Édition des champs permis : tout en CHAÎNE (les inputs). Une chaîne VIDE = champ vide (→ null explicite), jamais 0. */
export type EditionPermis = Record<ChampPermis, string>;
export type ErreursPermis = Partial<Record<ChampPermis, string>>;

/** number|null|bool|string → chaîne pour un input. */
export function permisVersInput(v: number | string | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Construit `ValeursGlobalDeclare` (nature dans la LISTE FERMÉE lue du CHECK, textes, nombres) + erreurs par champ. Un champ VIDE →
 * `null` explicite (tri-état préservé). `naturesPossibles` vient du CHECK de la base (jamais recopié). `bornes` (LUES des CHECK)
 * bornent un champ nombre quand elles existent — ex. l'altitude du sommet permis, qui accepte le négatif ([-50 ; 500]) ; les champs
 * SANS borne (surface, logements, stationnement) gardent la règle « ≥ 0 ». Aucune borne recopiée en dur.
 */
export function construirePermis(ed: EditionPermis, naturesPossibles: readonly string[], bornes: Record<string, Bornes | undefined> = {}): { valeurs: ValeursGlobalDeclare; erreurs: ErreursPermis; valide: boolean } {
  const valeurs: ValeursGlobalDeclare = {};
  const erreurs: ErreursPermis = {};

  const nature = ed.natureProjet.trim();
  if (nature === '') valeurs.natureProjet = null;
  else if (!naturesPossibles.includes(nature)) erreurs.natureProjet = `valeur hors liste (${naturesPossibles.join(', ')})`;
  else valeurs.natureProjet = nature;

  for (const m of CHAMPS_PERMIS.filter((c) => c.genre === 'nombre')) {
    const p = parseNombre(ed[m.cle], !!m.entier);
    if (!p.ok) { erreurs[m.cle] = m.entier ? 'nombre entier attendu' : 'nombre attendu'; continue; }
    if (p.valeur !== null) {
      const b = bornes[m.colonne];
      if (b) { if (p.valeur < b.min || p.valeur > b.max) { erreurs[m.cle] = `valeur attendue entre ${b.min} et ${b.max}${m.unite ? ` ${m.unite}` : ''}`; continue; } }
      else if (p.valeur < 0) { erreurs[m.cle] = 'valeur ≥ 0 attendue'; continue; }
    }
    valeurs[m.cle] = p.valeur; // VIDE → null (tri-état)
  }

  // Champs TEXTE (adresse du terrain, désignation) : trim, VIDE → null explicite. Verbatim, aucune normalisation de contenu.
  for (const c of CHAMPS_PERMIS.filter((c) => c.genre === 'texte')) {
    const t = ed[c.cle].trim();
    valeurs[c.cle] = t === '' ? null : t;
  }

  return { valeurs, erreurs, valide: Object.keys(erreurs).length === 0 };
}
