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
  referencesExternes?: string[]; // P1 — références de la mairie, pour la recherche par référence
}

export interface FiltreDemandes {
  statut: string;   // '' = tous
  profil: string;   // '' = tous
  commune: string;  // recherche libre (nom/code) ; '' = tous
  types: number[];  // rangs de catégorie cochés ; [] = AUCUN filtre de type (= tous)
  reference?: string; // P1 — recherche par référence (SVAV ou mairie) ; absent/'' = aucun filtre (OPT-IN, défaut off)
}

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * P1 — forme NORMALISÉE d'une référence pour la recherche : MAJUSCULES, espaces et tirets SUPPRIMÉS. Une référence dictée au
 * téléphone est rarement tapée à l'identique. DOIT rester alignée sur l'index SQL de la migration 085
 * (`upper(regexp_replace(reference, '[[:space:]-]', '', 'g'))`). PURE.
 */
export function normaliserReference(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * P1 — la demande correspond-elle à la recherche par référence `q` ? Comparaison sur la forme NORMALISÉE des DEUX côtés
 * (sous-chaîne) : matche la référence SVAV (`SVAV-DEM-2026-000119` ET sa forme courte `2026-000119`, incluse dans la
 * normalisée) AUSSI BIEN que n'importe quelle référence mairie rattachée. `q` vide → true (aucun filtre). PURE.
 */
export function correspondReference(d: LigneDemande, q: string): boolean {
  const qn = normaliserReference(q.trim());
  if (qn === '') return true;
  if (normaliserReference(d.reference).includes(qn)) return true;
  return (d.referencesExternes ?? []).some((r) => normaliserReference(r).includes(qn));
}

/**
 * Filtre l'ENSEMBLE des demandes. Le filtre TYPE = « la demande contient AU MOINS UN dossier de l'un des types cochés »
 * (OU entre types) : `types` vide → aucune clause (équivaut à « tous ») ; sinon on retient la demande dès qu'un de ses
 * rangs de catégorie figure parmi les cochés. Le filtre RÉFÉRENCE (P1) matche SVAV ou mairie sur forme normalisée.
 */
export function filtrerDemandes<T extends LigneDemande>(demandes: T[], f: FiltreDemandes): T[] {
  const qc = norm(f.commune.trim());
  const types = new Set(f.types);
  const qRef = f.reference ?? '';
  return demandes.filter((d) =>
    (f.statut === '' || d.statut === f.statut) &&
    (f.profil === '' || d.profil === f.profil) &&
    (qc === '' || norm(d.communeNom ?? d.codeInsee).includes(qc) || d.codeInsee.startsWith(qc)) &&
    (types.size === 0 || (d.rangs ?? []).some((r) => types.has(r))) &&
    correspondReference(d, qRef));
}

// ── Q6 : PÉRIMÈTRES des deux onglets (« À demander » / « En cours ») ──────────────────────────────────────────────────
/**
 * Q6 — un onglet ne PEUT PAS afficher les demandes de l'autre. Le périmètre est un pré-filtre par STATUT appliqué EN AMONT
 * (avant le filtre Statut de l'utilisateur), et le sélecteur Statut de chaque onglet ne propose QUE ces statuts. Les CINQ
 * statuts sont couverts et DISJOINTS — donc « Tous » dans un onglet ne ramène jamais l'autre, et aucun statut n'est orphelin :
 *   - « à demander » = brouillon · prête · annulée (jamais parties auprès d'une mairie ; annuler = remettre les permis au stock) ;
 *   - « en cours »   = envoyée · close (demande INITIÉE auprès de la mairie).
 * ⚠️ Un brouillon n'a jamais atteint une mairie : il appartient à « à demander », pas à « en cours » (règle Q6).
 */
export type Perimetre = 'a_demander' | 'en_cours';
export const STATUTS_A_DEMANDER: readonly string[] = ['brouillon', 'prete', 'annulee'];
export const STATUTS_EN_COURS: readonly string[] = ['envoyee', 'close'];

/** Statuts affichables (et donc filtrables) dans un onglet — options du sélecteur Statut. PURE. */
export function statutsDuPerimetre(p: Perimetre): readonly string[] {
  return p === 'a_demander' ? STATUTS_A_DEMANDER : STATUTS_EN_COURS;
}

/**
 * Pré-filtre DUR : ne garde que les demandes du périmètre. Appliqué AVANT `filtrerDemandes` → même avec le filtre Statut sur
 * « Tous », l'onglet ne voit JAMAIS les statuts de l'autre périmètre. PURE (générique sur tout objet à `statut`).
 */
export function dansPerimetre<T extends { statut: string }>(demandes: T[], p: Perimetre): T[] {
  const permis = new Set<string>(statutsDuPerimetre(p));
  return demandes.filter((d) => permis.has(d.statut));
}

// ── D3 : dérivation du TYPE de permis affiché (colonne « Type ») ──────────────
const RANG_AUTRE = 9999; // rang de la catégorie « autre » (cf. priorite.ts : classer → { cle:'autre', rang:9999 })

/** Ce qu'il faut pour afficher la cellule « Type » : libellé du type le plus prioritaire, nombre d'AUTRES types, title complet. */
export interface TypeAffiche {
  vide: boolean;     // aucun rang connu → afficher « — » (jamais une cellule vide ambiguë)
  libelle: string;   // libellé du type le PLUS prioritaire (rang le plus petit) ; '' si vide
  nAutres: number;   // nombre d'AUTRES types distincts (0 → pas de « +N »)
  attenue: boolean;  // true si le libellé principal est « Autre » (rang 9999) → à afficher atténué
  titre: string;     // TOUS les types en clair, séparés par ', ' (ordre de priorité) — pour l'attribut `title`
}

/**
 * D3 — dérive le TYPE affiché depuis les rangs DISTINCTS des dossiers d'une demande (cf. listerDemandes.rangs) et le
 * référentiel de catégories (`categoriesConnues(cfg)` : { libelle, rang }). PURE. Règle : le type le plus PRIORITAIRE (rang
 * le plus petit) donne le badge ; les autres types distincts alimentent « +N » et le `title`. Le rang 9999 → « Autre »
 * (atténué). Aucun rang connu (liste vide ou rangs hors référentiel) → `vide` (la cellule affichera « — »).
 */
export function typeDemande(rangs: number[] | undefined, categories: { libelle: string; rang: number }[]): TypeAffiche {
  const parRang = new Map(categories.map((c) => [c.rang, c.libelle]));
  const libelleDe = (r: number): string | null => parRang.get(r) ?? (r === RANG_AUTRE ? 'Autre' : null);
  const distincts = [...new Set(rangs ?? [])].sort((a, b) => a - b); // rang croissant = du plus prioritaire au moins
  const items = distincts
    .map((r) => ({ rang: r, libelle: libelleDe(r) }))
    .filter((x): x is { rang: number; libelle: string } => x.libelle !== null);
  if (items.length === 0) return { vide: true, libelle: '', nAutres: 0, attenue: false, titre: '' };
  const principal = items[0];
  return {
    vide: false,
    libelle: principal.libelle,
    nAutres: items.length - 1,
    attenue: principal.rang === RANG_AUTRE,
    titre: items.map((x) => x.libelle).join(', '),
  };
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
