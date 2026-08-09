/**
 * D2 — tri + filtres PURS de la liste des demandes (onglet Demandes). Aucune I/O. La liste est chargée EN ENTIER par
 * listerDemandes ; ces fonctions opèrent sur l'ENSEMBLE filtré (jamais sur une page), et la Vue paginera APRÈS. Le tri et
 * les en-têtes cliquables pilotent le MÊME état `Tri` (une seule vérité).
 */

/** Colonnes triables. `date` = date de création (Plus récentes / Plus ancien). */
export type TriColonne = 'date' | 'reference' | 'commune' | 'dossiers' | 'statut';
export type SensTri = 'asc' | 'desc';
export interface Tri { colonne: TriColonne; sens: SensTri }

/** Sens par défaut au PREMIER clic d'un en-tête : croissant partout, DÉCROISSANT pour dossiers (grosses demandes d'abord). */
export const SENS_DEFAUT: Record<TriColonne, SensTri> = { date: 'desc', reference: 'asc', commune: 'asc', dossiers: 'desc', statut: 'asc' };

/** Clic sur un en-tête : même colonne → on INVERSE le sens ; autre colonne → sens par défaut de cette colonne. */
export function basculerTri(courant: Tri, colonne: TriColonne): Tri {
  if (courant.colonne === colonne) return { colonne, sens: courant.sens === 'asc' ? 'desc' : 'asc' };
  return { colonne, sens: SENS_DEFAUT[colonne] };
}

/** Sélecteur « Tri » ↔ état : chaque preset EST un (colonne, sens). Les variantes de sens existent car les en-têtes sont
 *  réversibles → le sélecteur doit pouvoir représenter TOUT état atteignable (une seule vérité). */
export const OPTIONS_TRI: { valeur: string; libelle: string; tri: Tri }[] = [
  { valeur: 'date:desc', libelle: 'Plus récentes', tri: { colonne: 'date', sens: 'desc' } },
  { valeur: 'date:asc', libelle: 'Plus ancien', tri: { colonne: 'date', sens: 'asc' } },
  { valeur: 'reference:asc', libelle: 'Référence (A→Z)', tri: { colonne: 'reference', sens: 'asc' } },
  { valeur: 'commune:asc', libelle: 'Commune (A→Z)', tri: { colonne: 'commune', sens: 'asc' } },
  { valeur: 'commune:desc', libelle: 'Commune (Z→A)', tri: { colonne: 'commune', sens: 'desc' } },
  { valeur: 'dossiers:desc', libelle: 'Dossiers (décroissant)', tri: { colonne: 'dossiers', sens: 'desc' } },
  { valeur: 'dossiers:asc', libelle: 'Dossiers (croissant)', tri: { colonne: 'dossiers', sens: 'asc' } },
  { valeur: 'statut:asc', libelle: 'Statut (A→Z)', tri: { colonne: 'statut', sens: 'asc' } },
  { valeur: 'statut:desc', libelle: 'Statut (Z→A)', tri: { colonne: 'statut', sens: 'desc' } },
];
/** Clé composite d'un état de tri (valeur du <select>). */
export function cleTri(tri: Tri): string { return `${tri.colonne}:${tri.sens}`; }
/** Décode une clé de <select> en Tri (repli « Plus récentes » si inconnue). */
export function triDepuisCle(valeur: string): Tri {
  return OPTIONS_TRI.find((o) => o.valeur === valeur)?.tri ?? { colonne: 'date', sens: 'desc' };
}

/** Champs d'une ligne de demande nécessaires au tri/filtre (DemandeListe est assignable). */
export interface LigneDemande {
  id: number; reference: string; communeNom: string | null; codeInsee: string;
  nbDossiers: number; statut: string; profil: string; creeLe: string; rangs?: number[];
}

export interface FiltreDemandes {
  statut: string;   // '' = tous
  profil: string;   // '' = tous
  commune: string;  // recherche libre (nom/code) ; '' = tous
  types: number[];  // rangs de catégorie cochés ; [] = AUCUN filtre de type (= tous)
}

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * Filtre l'ENSEMBLE des demandes. Le filtre TYPE = « la demande contient AU MOINS UN dossier de l'un des types cochés »
 * (OU entre types) : `types` vide → aucune clause (équivaut à « tous ») ; sinon on retient la demande dès qu'un de ses
 * rangs de catégorie figure parmi les cochés.
 */
export function filtrerDemandes<T extends LigneDemande>(demandes: T[], f: FiltreDemandes): T[] {
  const qc = norm(f.commune.trim());
  const types = new Set(f.types);
  return demandes.filter((d) =>
    (f.statut === '' || d.statut === f.statut) &&
    (f.profil === '' || d.profil === f.profil) &&
    (qc === '' || norm(d.communeNom ?? d.codeInsee).includes(qc) || d.codeInsee.startsWith(qc)) &&
    (types.size === 0 || (d.rangs ?? []).some((r) => types.has(r))));
}

/** Ordre de base (croissant) d'une colonne. Départage FINAL par id → ordre TOTAL, donc « asc » et « desc » sont des
 *  inverses EXACTS l'un de l'autre (Plus ancien = l'exact inverse de Plus récentes). */
function ordreBase<T extends LigneDemande>(colonne: TriColonne, a: T, b: T): number {
  let c = 0;
  if (colonne === 'date') c = a.creeLe.localeCompare(b.creeLe);
  else if (colonne === 'reference') c = a.reference.localeCompare(b.reference);
  else if (colonne === 'commune') c = (a.communeNom ?? a.codeInsee).localeCompare(b.communeNom ?? b.codeInsee, 'fr');
  else if (colonne === 'dossiers') c = a.nbDossiers - b.nbDossiers;
  else if (colonne === 'statut') c = a.statut.localeCompare(b.statut);
  return c !== 0 ? c : a.id - b.id; // départage stable → ordre total
}

/** Trie l'ENSEMBLE filtré (copie, jamais en place). `desc` = négation point-à-point de `asc` → inverses exacts. */
export function trierDemandes<T extends LigneDemande>(demandes: T[], tri: Tri): T[] {
  const sign = tri.sens === 'asc' ? 1 : -1;
  return [...demandes].sort((a, b) => sign * ordreBase(tri.colonne, a, b));
}
