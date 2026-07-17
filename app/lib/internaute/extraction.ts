/**
 * Module INTERNAUTE — LOT 3 (exploitation interne) : construction PURE des filtres + sérialisation CSV.
 *
 * Pur, sans accès base, AUCUN import `app/lib/analytics/*` ni moteur → cloisonnement M2 trivial. L'EXÉCUTION SQL
 * (le `query`) reste dans `extractionRepo.ts` (serveur only). Ici, uniquement de la CONSTRUCTION de chaînes SQL,
 * testable sans base : le fragment FROM/WHERE de l'invariant de consentement (INTERSECTION d'un ENSEMBLE de statuts),
 * l'expression `consenti_le`, le builder de clauses WHERE paramétrées (extensible) et le sérialiseur CSV.
 */
import type { CleFinalite } from './textesConsentement';
import { FINALITES_SEED } from './consentement';

/** F1 (recontact interne) : le SEUL statut portant un opt-out dédié (`opposition_recontact`) + défaut du picker géo. */
export const FINALITE_F1: CleFinalite = FINALITES_SEED.recontactInterne;

/**
 * Statuts de consentement SÉLECTIONNABLES (multi-sélection en ET). Clés dérivées de `FINALITES_SEED` (jamais
 * re-hardcodées). L'admin en coche un ENSEMBLE ; l'extraction renvoie l'INTERSECTION (tous les cochés actifs).
 * `code`/`libelle` = affichage admin.
 */
export const STATUTS_EXPORT: ReadonlyArray<{ statut: CleFinalite; code: string; libelle: string }> = [
  { statut: FINALITES_SEED.recontactInterne, code: 'F1', libelle: 'Recontact (F1)' },
  { statut: FINALITES_SEED.emailMarketing, code: 'F2', libelle: 'Email (F2)' },
  { statut: FINALITES_SEED.retargetingTiers, code: 'F3', libelle: 'Retargeting (F3)' },
];

/** Ordre canonique des statuts → génération SQL DÉTERMINISTE, indépendante de l'ordre d'arrivée des query params.
 *  Sert aussi de LISTE BLANCHE : `normaliserStatuts` n'y garde que les clés connues (tout jeton forgé est écarté). */
const ORDRE_STATUTS: readonly CleFinalite[] = STATUTS_EXPORT.map((s) => s.statut);

/**
 * Normalise un ensemble de statuts reçus : ne conserve QUE les clés connues, dans l'ORDRE CANONIQUE, SANS doublon.
 * (Un jeton inconnu/forgé est simplement écarté.) Pur — socle de toute la mécanique multi-statuts.
 */
export function normaliserStatuts(bruts: readonly string[]): CleFinalite[] {
  return ORDRE_STATUTS.filter((s) => bruts.includes(s));
}

/** Défense en profondeur : une finalité INTERPOLÉE dans du SQL DOIT être un simple identifiant `[a-z0-9_]+`. */
function assertFinalite(f: string): void {
  if (!/^[a-z0-9_]+$/.test(f)) throw new Error(`finalité invalide (attendu [a-z0-9_]+) : ${f}`);
}

/** FROM commun (internaute + dernier projet par LATERAL) — la contrainte de consentement est ajoutée en WHERE. */
const FROM_BASE = `
  FROM internaute i
  LEFT JOIN LATERAL (
    SELECT verdict, score, dernier_etage, residence_principale, commune_insee
    FROM internaute_projet pr WHERE pr.internaute_id = i.id ORDER BY pr.cree_a DESC LIMIT 1
  ) p ON true
`;

/**
 * Fragment FROM/WHERE de l'INVARIANT DE CONSENTEMENT pour un ENSEMBLE de statuts (INTERSECTION = AND). PUR : ne fait
 * que CONSTRUIRE la chaîne SQL — l'exécution reste dans `extractionRepo.ts`. AUCUN paramètre lié ici : les finalités
 * sont des LITTÉRAUX de type fermé → les filtres de `construireFiltres` commencent toujours à `$1`.
 *
 * - Ensemble NON VIDE → un `EXISTS(finalité active)` PAR statut, TOUS joints en AND → un profil ne remonte que s'il
 *   possède un consentement ACTIF pour CHAQUE statut coché. ZÉRO OR (intersection stricte) : un F2-only n'apparaît
 *   jamais dans `{F1}`, ni l'inverse. `opposition_recontact = false` ajouté SSI F1 ∈ statuts (opt-out propre à F1) ;
 *   `efface_a IS NULL` commun (un profil effacé ne réapparaît jamais).
 * - Ensemble VIDE → `WHERE false` : GARDE FAIL-CLOSED (RGPD). On n'émet JAMAIS une requête sans contrainte de
 *   finalité — sinon toute la base nominative fuirait. (En pratique le repo court-circuite AVANT d'appeler ceci ;
 *   ce `WHERE false` est la défense en profondeur si un appelant construisait la requête directement.)
 *
 * Défense en profondeur : chaque finalité est re-validée `[a-z0-9_]+` (`assertFinalite`) avant interpolation → toute
 * injection SQL est structurellement impossible même si un appelant contournait le typage/`normaliserStatuts`.
 */
export function clauseStatuts(statutsBruts: readonly CleFinalite[]): string {
  const statuts = normaliserStatuts(statutsBruts);
  if (statuts.length === 0) return `${FROM_BASE}  WHERE false\n`; // fail-closed : sélection vide → matche RIEN
  const opposition = statuts.includes(FINALITE_F1) ? 'i.opposition_recontact = false\n    AND ' : '';
  const exists = statuts
    .map((s) => {
      assertFinalite(s);
      const a = `ca_${s}`;
      return `EXISTS (SELECT 1 FROM internaute_consentement_actif ${a} WHERE ${a}.internaute_id = i.id AND ${a}.finalite = '${s}' AND ${a}.actif = true)`;
    })
    .join('\n    AND ');
  return `${FROM_BASE}  WHERE ${opposition}i.efface_a IS NULL
    AND ${exists}
`;
}

/**
 * Expression SQL (sous-requête corrélée) de la date de consentement de RÉFÉRENCE (`consenti_le`) affichée/exportée.
 * Décision d'AFFICHAGE (jamais d'étanchéité) : si F1 ∈ statuts → horodatage du consentement F1 ; sinon → le PLUS
 * RÉCENT des horodatages des statuts cochés. Unifié en `max(horodatage)` sur les finalités de référence (pour `{F1}`
 * c'est l'unique ligne F1). Ensemble vide → `NULL` (cohérent avec le fail-closed). Finalités validées avant interpolation.
 */
export function exprConsentiLe(statutsBruts: readonly CleFinalite[]): string {
  const statuts = normaliserStatuts(statutsBruts);
  if (statuts.length === 0) return 'NULL::timestamptz';
  const ref = statuts.includes(FINALITE_F1) ? [FINALITE_F1] : statuts;
  ref.forEach(assertFinalite);
  const liste = ref.map((s) => `'${s}'`).join(', ');
  return `(SELECT max(cax.horodatage) FROM internaute_consentement_actif cax WHERE cax.internaute_id = i.id AND cax.actif = true AND cax.finalite IN (${liste}))`;
}

/** Critères d'extraction. Tous optionnels ; extensible (ajouter un champ + une entrée dans `construireFiltres`). */
export interface FiltresExtraction {
  communesInsee?: string[] | null; // ensemble de communes (INSEE) — filtre géo AND `IN (...)` sur le set F1
  scoreMin?: number | null;
  scoreMax?: number | null;
  dernierEtage?: boolean | null;
  residencePrincipale?: boolean | null;
  verdict?: string | null;
  creeApres?: string | null; // ISO (date de création du PROFIL)
  creeAvant?: string | null;
  q?: string | null; // recherche texte nom/prénom (tokenisée, insensible aux accents) — LOT A-2
  // NB : la sélection des STATUTS de consentement (F1/F2/F3, intersection) n'est PAS un filtre WHERE ici — elle est
  // portée séparément par `clauseStatuts(statuts)` (FROM/WHERE), en amont de ces clauses. Voir `lireStatuts`.
}

const INSEE = /^(2[AB]|[0-9]{2})[0-9]{3}$/;
const VERDICTS = new Set(['SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/; // yyyy-mm-dd (préfixe accepté : date ou datetime ISO)

function estNombre(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
/** Date ISO RÉELLE (format yyyy-mm-dd… ET calendrier valide) : une date forgée (`2026-13-45`) est ignorée, pas
 *  liée en paramètre (évite un 503 au cast Postgres). */
function dateValide(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * Construit les clauses SQL paramétrées à partir des filtres. Renvoie `{ clauses, params }` ; les placeholders
 * sont `$1..$n` (le SQL de base n'a AUCUN paramètre avant — cf. `extractionRepo.ts`). Les valeurs invalides sont
 * IGNORÉES (jamais interpolées) : seules des valeurs typées deviennent des paramètres liés.
 *
 * EXTENSIBILITÉ : un nouveau critère = une nouvelle entrée `ajouter(...)` ci-dessous, rien d'autre.
 */
export function construireFiltres(f: FiltresExtraction): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const lier = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  // Filtre géographique : ensemble de communes (INSEE) → `p.commune_insee IN (...)`, AND sur le set F1 (RESTREINT,
  // jamais un non-F1). Chaque code est VALIDÉ (regex INSEE) et LIÉ en paramètre (anti-injection) ; les codes
  // invalides sont écartés. Ensemble vide/inexistant → aucune clause (pas de filtre géo).
  if (Array.isArray(f.communesInsee)) {
    const valides = f.communesInsee.filter((c): c is string => typeof c === 'string' && INSEE.test(c));
    if (valides.length > 0) clauses.push(`p.commune_insee IN (${valides.map((c) => lier(c)).join(', ')})`);
  }
  if (estNombre(f.scoreMin)) clauses.push(`p.score >= ${lier(f.scoreMin)}`);
  if (estNombre(f.scoreMax)) clauses.push(`p.score <= ${lier(f.scoreMax)}`);
  if (typeof f.dernierEtage === 'boolean') clauses.push(`p.dernier_etage = ${lier(f.dernierEtage)}`);
  if (typeof f.residencePrincipale === 'boolean') clauses.push(`p.residence_principale = ${lier(f.residencePrincipale)}`);
  if (typeof f.verdict === 'string' && VERDICTS.has(f.verdict)) clauses.push(`p.verdict = ${lier(f.verdict)}`);
  if (dateValide(f.creeApres)) clauses.push(`i.cree_a >= ${lier(f.creeApres)}`);
  if (dateValide(f.creeAvant)) clauses.push(`i.cree_a <= ${lier(f.creeAvant)}`);
  // RECHERCHE TEXTE (LOT A-2) — nom/prénom, INSENSIBLE aux accents (`unaccent`, migration 027) et à la casse (ILIKE).
  // ORDRE LIBRE : `q` est tokenisé ; CHAQUE mot doit matcher (prénom OU nom) → une clause par mot, toutes ANDées
  // (« thevenin pierre » = « pierre thevenin »). Le `OR` est INTERNE au filtre nom (JAMAIS un OR entre statuts, qui
  // restent des EXISTS en AND dans `clauseStatuts`). Chaque mot est LIÉ en paramètre (`%mot%` ; wildcards ajoutés côté
  // JS, JAMAIS interpolés → aucune injection SQL) ; les métacaractères LIKE du mot (`%`, `_`, `\`) sont ÉCHAPPÉS pour
  // rester littéraux (pas de « joker » involontaire). `unaccent()` des DEUX côtés → comparaison sans accents.
  if (typeof f.q === 'string') {
    const echapperLike = (mot: string) => mot.replace(/[\\%_]/g, '\\$&');
    for (const mot of f.q.trim().split(/\s+/).filter(Boolean)) {
      const k = lier(`%${echapperLike(mot)}%`);
      clauses.push(`(unaccent(i.prenom) ILIKE unaccent(${k}) OR unaccent(i.nom) ILIKE unaccent(${k}))`);
    }
  }

  return { clauses, params };
}

/**
 * Tri de la liste (LOT A-2) — chaîne SQL CONSTANTE (aucune donnée utilisateur interpolée) :
 *  - recherche `q` active → ALPHABÉTIQUE `nom, prénom`, avec départage STABLE `i.id` (nom/prénom NULLABLE & non
 *    uniques → sans tiebreaker, des lignes migreraient entre pages) ;
 *  - sinon → tri historique « récent d'abord » (`i.cree_a DESC`), INCHANGÉ.
 */
export function ordreListe(f: FiltresExtraction): string {
  const recherche = typeof f.q === 'string' && f.q.trim() !== '';
  return recherche ? 'ORDER BY i.nom NULLS LAST, i.prenom NULLS LAST, i.id' : 'ORDER BY i.cree_a DESC';
}

/** Parse les filtres depuis les query params d'une route. Absent/vide → non filtré ; la VALIDATION (typage, format)
 *  est faite par `construireFiltres` (seules des valeurs valides deviennent des paramètres liés). */
export function lireFiltres(params: URLSearchParams): FiltresExtraction {
  const num = (k: string): number | null => {
    const v = params.get(k);
    if (v === null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (k: string): boolean | null => {
    const v = params.get(k);
    return v === 'true' ? true : v === 'false' ? false : null;
  };
  const str = (k: string): string | null => {
    const v = params.get(k);
    return v && v.trim() !== '' ? v.trim() : null;
  };
  const communes = params.get('communes');
  return {
    // `communes` = liste d'INSEE séparés par des virgules (remplace le paramètre `commune` unique). Validation dans
    // `construireFiltres` (seuls les codes INSEE valides deviennent des paramètres liés).
    communesInsee: communes && communes.trim() !== '' ? communes.split(',').map((c) => c.trim()).filter(Boolean) : null,
    scoreMin: num('scoreMin'),
    scoreMax: num('scoreMax'),
    dernierEtage: bool('dernierEtage'),
    residencePrincipale: bool('residencePrincipale'),
    verdict: str('verdict'),
    creeApres: str('creeApres'),
    creeAvant: str('creeAvant'),
    q: str('q'), // recherche texte nom/prénom (LOT A-2) ; tokenisée & validée dans construireFiltres
  };
}

/**
 * Statuts de consentement cochés (query param `statuts`, clés séparées par des virgules, p. ex.
 * `statuts=recontact_interne,email_marketing`), VALIDÉS & NORMALISÉS par `normaliserStatuts` (liste blanche = les
 * clés connues, ordre canonique, sans doublon). L'ensemble PEUT être VIDE (absent, vide, ou uniquement des jetons
 * inconnus) → le serveur bloque en aval (fail-closed dans le repo / `clauseStatuts`). Aucun repli « défaut F1 » : une
 * sélection vide n'exporte JAMAIS toute la base. Ces statuts déterminent la population (intersection) ; ils n'entrent
 * pas dans `construireFiltres`.
 */
export function lireStatuts(params: URLSearchParams): CleFinalite[] {
  const brut = params.get('statuts');
  return brut ? normaliserStatuts(brut.split(',').map((s) => s.trim())) : [];
}

/** Une ligne de résultat exploitable (identité + dernier projet + date de consentement de référence des statuts). */
export interface LigneProfil {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  cree_a: string;
  verdict: string | null;
  score: number | null;
  commune_insee: string | null;
  dernier_etage: boolean | null;
  residence_principale: boolean | null;
  consenti_le: string | null; // horodatage du consentement F1 actif
}

/** Colonnes exportées (MINIMISATION : strictement l'utile au recontact). En-tête + accès à la valeur. */
export const COLONNES_EXPORT: ReadonlyArray<{ entete: string; cle: keyof LigneProfil }> = [
  { entete: 'prenom', cle: 'prenom' },
  { entete: 'nom', cle: 'nom' },
  { entete: 'email', cle: 'email' },
  { entete: 'telephone', cle: 'telephone' },
  { entete: 'commune_insee', cle: 'commune_insee' },
  { entete: 'verdict', cle: 'verdict' },
  { entete: 'score', cle: 'score' },
  { entete: 'dernier_etage', cle: 'dernier_etage' },
  { entete: 'residence_principale', cle: 'residence_principale' },
  { entete: 'profil_cree_le', cle: 'cree_a' },
  { entete: 'consenti_le', cle: 'consenti_le' },
];

/** Échappe une valeur CSV (RFC 4180) : entoure de guillemets si nécessaire, double les guillemets internes. */
function champCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sérialise les lignes filtrées en CSV (séparateur `,`, CRLF, en-tête). Colonnes minimisées (`COLONNES_EXPORT`). */
export function versCsv(lignes: LigneProfil[]): string {
  const entete = COLONNES_EXPORT.map((c) => c.entete).join(',');
  const corps = lignes.map((l) => COLONNES_EXPORT.map((c) => champCsv(l[c.cle])).join(','));
  return [entete, ...corps].join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DOSSIER DE PREUVE DES DÉSABONNEMENTS — sérialisation PARALLÈLE. N'emprunte NI `versCsv` NI `COLONNES_EXPORT` (voie
// COMMERCIALE, intouchée) ; réutilise seulement `champCsv` (échappement RFC 4180). La REQUÊTE vit dans extractionRepo.ts.
// RÈGLE PRODUIT : une ligne = UNE décision de consentement (accord | retrait | ré-accord). Le dossier montre la LIGNE
// DE VIE complète des personnes ayant ≥1 retrait — JAMAIS un état figé, jamais lisible comme une liste noire.
// ─────────────────────────────────────────────────────────────────────────────

/** Une ligne du dossier de preuve = une décision BRUTE de `internaute_consentement` + identité + texte + journal. */
export interface LignePreuveDesabo {
  internaute_id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  efface_a: string | null; //     non-NULL = profil anonymisé → identité VIDE, colonne `efface` = 'oui'
  finalite: string;
  etat: string; //                'accorde' | 'retire' | 'refuse'
  horodatage: string; //          timestamptz rendu en texte (`::text`) — précis, sans arrondi
  canal: string | null; //        'tunnel' | 'admin' | 'email' | …
  texte_version: number | null;
  texte_contenu: string | null; // contenu VERBATIM de la mention vue (LEFT JOIN → NULL si texte_id absent)
  a_la_demande_de: string | null; // ── colonnes JOURNAL : VIDES si la ligne n'a pas d'entrée de journal (fait, pas erreur)
  admin_auteur_id: number | null;
  motif: string | null;
}

/** Colonnes du dossier de preuve, DANS L'ORDRE. `valeur` = accès dérivé (`efface` se déduit d'`efface_a`). */
export const COLONNES_PREUVE_DESABO: ReadonlyArray<{ entete: string; valeur: (l: LignePreuveDesabo) => unknown }> = [
  { entete: 'internaute_id', valeur: (l) => l.internaute_id },
  { entete: 'prenom', valeur: (l) => l.prenom },
  { entete: 'nom', valeur: (l) => l.nom },
  { entete: 'email', valeur: (l) => l.email },
  { entete: 'efface', valeur: (l) => (l.efface_a ? 'oui' : 'non') },
  { entete: 'finalite', valeur: (l) => l.finalite },
  { entete: 'etat', valeur: (l) => l.etat },
  { entete: 'horodatage', valeur: (l) => l.horodatage },
  { entete: 'canal', valeur: (l) => l.canal },
  { entete: 'texte_version', valeur: (l) => l.texte_version },
  { entete: 'texte_contenu', valeur: (l) => l.texte_contenu },
  { entete: 'a_la_demande_de', valeur: (l) => l.a_la_demande_de },
  { entete: 'admin_auteur_id', valeur: (l) => l.admin_auteur_id },
  { entete: 'motif', valeur: (l) => l.motif }, // texte LIBRE → passé à champCsv (quoting), JAMAIS tronqué
];

/** Sérialise le dossier de preuve en CSV (séparateur `,`, CRLF, en-tête). Même échappement que la voie commerciale
 *  (`champCsv`), colonnes et type DISTINCTS → `versCsv`/`COLONNES_EXPORT` restent intouchés. */
export function versCsvPreuveDesabo(lignes: LignePreuveDesabo[]): string {
  const entete = COLONNES_PREUVE_DESABO.map((c) => c.entete).join(',');
  const corps = lignes.map((l) => COLONNES_PREUVE_DESABO.map((c) => champCsv(c.valeur(l))).join(','));
  return [entete, ...corps].join('\r\n');
}
