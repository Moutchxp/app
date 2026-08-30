/**
 * D2 — tri + filtres PURS de la liste des demandes (onglet Demandes). Aucune I/O. La liste est chargée EN ENTIER par
 * listerDemandes ; ces fonctions opèrent sur l'ENSEMBLE filtré (jamais sur une page), et la Vue paginera APRÈS. Le tri et
 * les en-têtes cliquables pilotent le MÊME état `Tri` (une seule vérité).
 */
import { processDeCanal } from './process';

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
  dossiersDus?: number;          // T2-C : dossiers encore dûs (actif ET non satisfaits) — pour le masquage « En cours »
  referencesExternes?: string[]; // P1 — références de la mairie, pour la recherche par référence
  numeros?: string[];            // T6-B / D3 — num_dau des dossiers ACTIFS, pour la recherche par n° de permis
}

/**
 * T2-C — répartit des demandes par présence de dossier DÛ, comme au commit A de « Réponses » mais pour « En cours ». `nbDossiers`
 * = dossiers ATTACHÉS (actif) ; `dossiersDus` = attachés ET non satisfaits. PUR → testable sans I/O.
 *  - vivantes : ≥ 1 dossier dû → restent listées ;
 *  - soldees : des dossiers attachés, tous obtenus (0 dû) → masquées par défaut ;
 *  - sansDossier : plus aucun dossier attaché (tous retirés) → masquées.
 * Repli SÛR : `dossiersDus` absent → on suppose tout dû (jamais masquer par méconnaissance).
 */
export function partitionnerParDus<T extends { nbDossiers: number; dossiersDus?: number }>(demandes: T[]): { vivantes: T[]; soldees: T[]; sansDossier: T[] } {
  const vivantes: T[] = [], soldees: T[] = [], sansDossier: T[] = [];
  for (const d of demandes) {
    const dus = d.dossiersDus ?? d.nbDossiers; // repli sûr : sans info de dus → tout dû → jamais masqué à tort
    if (dus > 0) vivantes.push(d);
    else if (d.nbDossiers > 0) soldees.push(d); // tous marqués reçus (T8 : jamais « obtenu »)
    else sansDossier.push(d);                    // 0 dossier attaché (tous retirés)
  }
  return { vivantes, soldees, sansDossier };
}

/**
 * T8 — demandes VISIBLES dans « En cours ». Les SOLDÉES (tous les dossiers actifs marqués reçus) sont **TOUJOURS** exclues, sous
 * TOUT filtre de statut : leur foyer est Archives, un permis n'est jamais dans deux onglets (règle du fondateur, non révélable —
 * comme le `sansRetour` de T6-A/2). Les `sansDossier` (0 dossier actif) gardent le masquage RÉVÉLABLE de confort (T2-C) : masquées
 * au défaut, montrées quand un statut explicite est choisi. PUR → testable sans I/O.
 */
export function visiblesEnCours<T extends { nbDossiers: number; dossiersDus?: number }>(demandes: T[], choixParDefaut: boolean): T[] {
  const { vivantes, sansDossier } = partitionnerParDus(demandes);
  return choixParDefaut ? vivantes : [...vivantes, ...sansDossier]; // soldées JAMAIS incluses
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
  if ((d.referencesExternes ?? []).some((r) => normaliserReference(r).includes(qn))) return true;
  // D3 — recherche AUSSI par n° de permis (num_dau des dossiers ACTIFS de la demande) : un numéro de permis trouve la demande
  //   qui le porte (et, côté vivier, le permis encore demandable — cf. rechercheVivier).
  return (d.numeros ?? []).some((n) => normaliserReference(n).includes(qn));
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

// ── Q6b : au sein d'un périmètre, STATUTS VIVANTS (à traiter) vs MORTS (trace) ────────────────────────────────────────
/**
 * Q6b — un statut MORT est la trace d'une démarche finie, pas une demande à traiter :
 *   - « annulée » : la demande a été annulée → ses dossiers sont DÉJÀ revenus au stock (demande_dossier.actif=false) et sont
 *     de nouveau proposables. Masquer la ligne ne cache AUCUN permis — la ligne n'est qu'une trace.
 *   - « close »  : demande clôturée, plus rien à suivre.
 * Le défaut d'affichage ne montre QUE les VIVANTS pour ne pas les noyer (ex. « à demander » : 54 vivantes noyées sous 99
 * annulées). Les morts restent accessibles via « Toutes » et le masquage n'est JAMAIS silencieux (mention + décompte).
 * Le PÉRIMÈTRE Q6 est INCHANGÉ : vivants ∪ morts = statutsDuPerimetre — on ne change QUE le défaut d'affichage.
 */
export const STATUTS_VIVANTS: Record<Perimetre, readonly string[]> = {
  a_demander: ['brouillon', 'prete'],
  en_cours: ['envoyee'],
};
/** Statuts VIVANTS (à traiter) d'un onglet — l'état INITIAL du filtre Statut. PURE. */
export function statutsVivants(p: Perimetre): readonly string[] { return STATUTS_VIVANTS[p]; }
/** Statuts MORTS (trace) = périmètre ∖ vivants (a_demander → ['annulee'] ; en_cours → ['close']). PURE. */
export function statutsMorts(p: Perimetre): readonly string[] {
  const vivants = new Set(statutsVivants(p));
  return statutsDuPerimetre(p).filter((s) => !vivants.has(s));
}

/**
 * D1 — PARTITION d'annulation en masse d'une vue de demandes. `brouillons` = cibles du « Tout annuler » (masse) ; `pretes` =
 * EXCLUES du geste de masse par défaut (elles partent au prochain envoi → geste dédié). Tout autre statut (envoyee/close/annulee)
 * n'est NI dans l'un NI dans l'autre — le geste de masse ne les touche jamais. 🔴 Verrou : une `prete` n'entre JAMAIS dans
 * `brouillons`. Opère sur la vue DÉJÀ filtrée que l'opérateur a sous les yeux (jamais plus large). PURE.
 */
export function partitionnerAnnulationMasse<T extends { statut: string }>(demandes: readonly T[]): { brouillons: T[]; pretes: T[] } {
  return {
    brouillons: demandes.filter((d) => d.statut === 'brouillon'),
    pretes: demandes.filter((d) => d.statut === 'prete'),
  };
}

/**
 * FOYER UNIQUE du critère « la demande vit dans l'onglet Réponses, pas En cours ». DÉPLACÉ ici depuis ReponsesRendu (re-exporté
 * là-bas pour compat) afin d'être appelable AUSSI côté serveur (route de comptage du commutateur) — même règle des DEUX côtés,
 * jamais recopiée. Réutilisé par SuiviDemandes (exclusion En cours), partitionnerReponses (inclusion Réponses), comptesActions et
 * le compteur du commutateur.
 *
 * PART-A — un « dossier partiel » (suspension ACTIVE) a pour foyer « En cours » (avec son statut de suspension), MÊME s'il a un
 * retour de mairie : la relance ordinaire est suspendue et l'internaute doit l'y voir (règle du fondateur du 29/08). On l'écarte
 * donc de Réponses AU FOYER (un seul point) → l'exclusion d'affichage En cours, l'inclusion Réponses et le compteur du commutateur
 * restent cohérents sans règle recopiée (invariant : un permis n'est jamais dans deux onglets). `suspension` non nul = marqueur
 * actif (porté par chargerDemandesSuivi ; null / absent = pas suspendu).
 */
export function demandeADuRetour(d: { nbReponsesReelles: number; dossiersSatisfaits: number; dossiers: { triage: string | null }[]; suspension?: unknown }): boolean {
  if (d.suspension != null) return false; // PART-A : dossier partiel → foyer « En cours », jamais Réponses (même avec un retour)
  return d.nbReponsesReelles > 0 || d.dossiersSatisfaits > 0 || d.dossiers.some((x) => x.triage !== null);
}

/** Champs (rich `DemandeSuivi`) nécessaires pour trancher l'appartenance à « En cours ». */
export interface DemandeEnCoursAffichable {
  statut: string;
  canal?: string | null;
  dossiersActifs: number;
  dossiersSatisfaits: number;
  nbReponsesReelles: number;
  dossiers: { triage: string | null }[];
  suspension?: unknown; // PART-A : marqueur « dossier partiel » actif (non nul) → foyer En cours même avec retour (lu par demandeADuRetour)
}

/**
 * D2-fix — PRÉDICAT UNIQUE « la demande est AFFICHÉE dans l'onglet En cours » (par défaut). MÊME règle que la Vue : statut
 * 'envoyee', VIVANTE (dossiers dus > 0 → ni soldée ni sans-dossier, cf. `partitionnerParDus`), et SANS retour (`demandeADuRetour`
 * → sinon elle vit dans Réponses). C'est ce prédicat, et LUI SEUL, que le compteur du commutateur doit appliquer — le décompte
 * d'en-tête doit suivre le MÊME périmètre que le tableau (leçon du 18/08 : `dansVue` ≠ `dansVueAffiche`).
 */
export function estEnCoursAffichee(d: DemandeEnCoursAffichable): boolean {
  const dus = d.dossiersActifs - d.dossiersSatisfaits;
  return d.statut === 'envoyee' && dus > 0 && !demandeADuRetour(d);
}

/** D2-fix — compte les demandes RÉELLEMENT en cours (estEnCoursAffichee) PAR PROCESS. Foyer unique du compteur du commutateur. */
export function compterEnCoursParProcess(demandes: readonly DemandeEnCoursAffichable[]): { email: number; formulaire: number } {
  const r = { email: 0, formulaire: 0 };
  for (const d of demandes) {
    if (!estEnCoursAffichee(d)) continue;
    const p = processDeCanal(d.canal);
    if (p) r[p] += 1;
  }
  return r;
}

/** Q6b — choix du sélecteur Statut : 'vivants' (DÉFAUT, statuts à traiter), 'tous' (tout le périmètre, morts compris), ou un
 *  statut précis du périmètre. Le défaut n'est plus « Tous ». */
export const CHOIX_STATUT_DEFAUT = 'vivants';
/**
 * Statuts effectivement AFFICHÉS pour un choix donné, TOUJOURS bornés au périmètre (garde d'hermeticité Q6 : un statut
 * étranger renvoie [] — jamais l'autre onglet). 'vivants' → statuts vivants ; 'tous' → tout le périmètre ; sinon → ce seul
 * statut s'il appartient au périmètre. PURE.
 */
export function statutsAffiches(p: Perimetre, choix: string): readonly string[] {
  if (choix === 'tous') return statutsDuPerimetre(p);
  if (choix === 'vivants') return statutsVivants(p);
  return statutsDuPerimetre(p).includes(choix) ? [choix] : [];
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
