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

/** Fabrique le fragment FROM (vue + LEFT JOIN LATERAL du dernier projet) pour une VUE donnée. La vue n'apporte que le
 *  PLANCHER de population ; la contrainte de statut SPÉCIFIQUE (intersection F1/F2/F3) reste ajoutée en WHERE par les
 *  builders ci-dessous. Les deux vues (`internaute_commercial`, `internaute_gerable`) exposent les mêmes colonnes
 *  (`SELECT i.*`) → le LATERAL et les alias `i`/`p` sont identiques quelle que soit la vue. */
function fromBase(vue: string): string {
  return `
  FROM ${vue} i
  LEFT JOIN LATERAL (
    SELECT verdict, score, dernier_etage, residence_principale, commune_insee
    FROM internaute_projet pr WHERE pr.internaute_id = i.id ORDER BY pr.cree_a DESC LIMIT 1
  ) p ON true
`;
}

/** FROM COMMERCIAL — lit la VUE `internaute_commercial` (migration 044), JAMAIS la table `internaute` brute : un
 *  internaute sans consentement actif (destinataire d'un PDF) en est ABSENT PAR CONSTRUCTION. Base de l'EXTRACTION
 *  (export/comptage/communes) ET du chemin de gestion consent-filtré. Le plancher « ≥1 consentement actif » est
 *  infranchissable même si un appelant oubliait la clause. */
const FROM_BASE = fromBase('internaute_commercial');

/** FROM GESTION — lit la table `internaute` BRUTE (non effacés), RÉSERVÉ à la LISTE DE GESTION admin
 *  (`clauseStatutsGestion`), JAMAIS aux extractions commerciales. La gestion doit pouvoir SURFACER tout internaute non
 *  effacé — y compris les « one-shots sans consentement » (ni compte, ni consentement actif), que la vue
 *  `internaute_gerable` (consentement OU compte) exclurait. L'étanchéité RGPD reste portée par les prédicats EXPLICITES
 *  de `clauseStatutsGestion` (axe consentement) + `clauseCompte` (axe compte), et par le fait que les 4 EXTRACTIONS
 *  commerciales restent, elles, sur `internaute_commercial`. (La vue `internaute_gerable` / migration 046 n'est donc plus
 *  référencée par le code — vestigiale.) */
const FROM_GESTION = fromBase('internaute');

/** WHERE de l'INTERSECTION de consentement (statuts NON vides, déjà normalisés) : un `EXISTS(finalité active)` par
 *  statut joint en AND (jamais un OR), `opposition_recontact=false` ssi F1 ∈ statuts, `efface_a IS NULL` commun. Partagé
 *  MOT POUR MOT par le chemin commercial (`clauseStatuts`) et le chemin gestion filtré (`clauseStatutsGestion`) → le
 *  filtre « a tel consentement » a EXACTEMENT le même sens des deux côtés. Finalités re-validées `[a-z0-9_]+` avant interpolation. */
function whereIntersection(statuts: readonly CleFinalite[]): string {
  const opposition = statuts.includes(FINALITE_F1) ? 'i.opposition_recontact = false\n    AND ' : '';
  const exists = statuts
    .map((s) => {
      assertFinalite(s);
      const a = `ca_${s}`;
      return `EXISTS (SELECT 1 FROM internaute_consentement_actif ${a} WHERE ${a}.internaute_id = i.id AND ${a}.finalite = '${s}' AND ${a}.actif = true)`;
    })
    .join('\n    AND ');
  return `WHERE ${opposition}i.efface_a IS NULL
    AND ${exists}
`;
}

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
/** WHERE « a AU MOINS UNE des finalités cochées » (mode OU de l'extraction commerciale) — un seul EXISTS `finalite IN (...)`.
 *  RÉUTILISE le MÊME prédicat « actif » (`ca.actif = true`) et le MÊME opt-out F1 (`opposition_recontact = false` ssi
 *  F1 ∈ statuts) que `whereIntersection` : seule la COMBINAISON change (OR au lieu du AND-par-finalité). Suppose `statuts`
 *  non vide, déjà normalisé (l'appelant valide). Toujours ⊆ base des consentants (`FROM internaute_commercial`). */
function whereAuMoinsUne(statuts: readonly CleFinalite[]): string {
  const opposition = statuts.includes(FINALITE_F1) ? 'i.opposition_recontact = false\n    AND ' : '';
  statuts.forEach(assertFinalite);
  const exists = `EXISTS (SELECT 1 FROM internaute_consentement_actif ca WHERE ca.internaute_id = i.id AND ca.finalite IN (${statuts.map((s) => `'${s}'`).join(', ')}) AND ca.actif = true)`;
  return `WHERE ${opposition}i.efface_a IS NULL
    AND ${exists}
`;
}

export function clauseStatuts(statutsBruts: readonly CleFinalite[], mode: ModeConsentement = 'et'): string {
  const statuts = normaliserStatuts(statutsBruts);
  if (statuts.length === 0) return `${FROM_BASE}  WHERE false\n`; // fail-closed RGPD : sélection vide → matche RIEN (JAMAIS toute la base)
  // 'et' (DÉFAUT) = intersection existante (BYTE-IDENTIQUE). 'ou' à ≥2 = au moins une. À 0/1 pastille, `whereIntersection`
  // dans les DEUX modes → défaut inchangé ET « 1 pastille : et == ou » garantis (le mode n'agit qu'à ≥2 pastilles).
  const w = mode === 'ou' && statuts.length >= 2 ? whereAuMoinsUne(statuts) : whereIntersection(statuts);
  return `${FROM_BASE}  ${w}`;
}

/**
 * Mode de combinaison des pastilles de consentement COCHÉES (n'a d'effet qu'à ≥2 pastilles) :
 *  - `'ou'` : « a AU MOINS UNE des finalités cochées » (un seul EXISTS, `finalite IN (...)`) ;
 *  - `'et'` (DÉFAUT) : « a TOUTES les finalités cochées » (un EXISTS par finalité, tous ANDés).
 * Ne s'applique QU'AUX pastilles cochées : 0 pastille (« sans consentement ») et 1 pastille sont IDENTIQUES dans les 2 modes.
 */
export type ModeConsentement = 'et' | 'ou';

/**
 * Fragment FROM/WHERE de la LISTE DE GESTION admin (`lireProfilsFiltres`). Lit la table `internaute` (non effacés) et
 * porte l'AXE CONSENTEMENT, à croiser (ET) avec l'axe compte (`clauseCompte`) et les filtres secondaires côté repo.
 *
 * SÉMANTIQUE (spec figée — le consentement est un critère POSITIF, jamais « indifférent ») :
 *  - AUCUNE pastille (`statuts` vide) → `NOT EXISTS(consentement actif)` : « n'a AUCUN consentement actif ». C'est le
 *    prédicat de `internaute_commercial` (migration 044) EXACTEMENT, mais NIÉ. Surface aussi les « one-shots sans
 *    consentement » (ni compte, ni consentement) — d'où le FROM `internaute` brut (la vue `internaute_gerable` les excluait).
 *  - ≥1 pastille, `mode` :
 *      • `'ou'`         → `EXISTS(consentement actif ET finalite IN (:statuts))` : au moins une des finalités cochées ;
 *      • `'et'` (défaut, effet à ≥2) → un `EXISTS(finalité active)` PAR finalité, tous ANDés : TOUTES les cochées, chacune
 *        active (même prédicat « actif » = `ca.actif = true`). À 1 seule pastille, `'et'` retombe sur la forme `IN`
 *        (identique à `'ou'`) : le mode n'a d'effet qu'à partir de 2 pastilles.
 *
 * ⚠️ RÉSERVÉ à la gestion (admin, `lireProfilsFiltres`). NE JAMAIS brancher sur un export/comptage/ciblage : ceux-là
 * restent sur `clauseStatuts` (`internaute_commercial`, consentants-only, fail-closed). Finalités re-validées `[a-z0-9_]+`
 * (`assertFinalite`) avant interpolation → aucune injection possible (les finalités sont des littéraux de type fermé).
 */
export function clauseStatutsGestion(statutsBruts: readonly CleFinalite[], mode: ModeConsentement = 'et'): string {
  const statuts = normaliserStatuts(statutsBruts);
  statuts.forEach(assertFinalite); // défense en profondeur avant interpolation (no-op si vide)
  let predicatConsentement: string;
  if (statuts.length === 0) {
    predicatConsentement = `NOT EXISTS (SELECT 1 FROM internaute_consentement_actif ca WHERE ca.internaute_id = i.id AND ca.actif = true)`;
  } else if (mode === 'et' && statuts.length >= 2) {
    // ET : une finalité par EXISTS (alias distinct `ca_<finalité>`), TOUS ANDés → l'internaute a TOUTES les cochées, actives.
    predicatConsentement = statuts
      .map((s) => {
        const a = `ca_${s}`;
        return `EXISTS (SELECT 1 FROM internaute_consentement_actif ${a} WHERE ${a}.internaute_id = i.id AND ${a}.actif = true AND ${a}.finalite = '${s}')`;
      })
      .join('\n    AND ');
  } else {
    // OU (défaut à 1 pastille, ou 'ou' explicite) : un seul EXISTS `finalite IN (...)` → au moins une des cochées.
    predicatConsentement = `EXISTS (SELECT 1 FROM internaute_consentement_actif ca WHERE ca.internaute_id = i.id AND ca.actif = true AND ca.finalite IN (${statuts.map((s) => `'${s}'`).join(', ')}))`;
  }
  return `${FROM_GESTION}  WHERE i.efface_a IS NULL
    AND ${predicatConsentement}
`;
}

/**
 * Axe « STATUT DE COMPTE » de la liste de gestion — INDÉPENDANT des consentements F1/F2/F3 (qui filtrent le CONSENTEMENT ;
 * celui-ci filtre la POSSESSION D'UN COMPTE). `'avec'` = titulaire (EXISTS `internaute_auth`), `'sans'` = one-shot
 * (NOT EXISTS), `null` = indifférent. Combinable avec les statuts de consentement (ex. `'avec'` + F2 = les comptes ayant
 * aussi F2 actif). ⚠️ RÉSERVÉ à la LISTE DE GESTION (`lireProfilsFiltres`) : JAMAIS branché sur les extractions
 * commerciales (elles restent consentants-only sur `internaute_commercial`).
 */
export type FiltreCompte = 'avec' | 'sans' | null;

/** Prédicat SQL de l'axe compte, à ANDer aux clauses de la liste. AUCUN paramètre lié (littéral corrélé sur `i.id`) → ne
 *  décale JAMAIS la numérotation `$1..$n` des filtres. `''` si indifférent. Alias `iac` distinct de la colonne `a_un_compte` (`ia`). */
export function clauseCompte(fc: FiltreCompte): string {
  if (fc === 'avec') return 'EXISTS (SELECT 1 FROM internaute_auth iac WHERE iac.internaute_id = i.id)';
  if (fc === 'sans') return 'NOT EXISTS (SELECT 1 FROM internaute_auth iac WHERE iac.internaute_id = i.id)';
  return '';
}

/** Parse l'axe compte depuis les query params (`compte=avec|sans`) ; toute autre valeur (absente, vide, forgée) → `null`
 *  (indifférent). Liste blanche stricte → aucune interpolation d'entrée utilisateur (le prédicat est un littéral fermé). */
export function lireFiltreCompte(params: URLSearchParams): FiltreCompte {
  const v = params.get('compte');
  return v === 'avec' || v === 'sans' ? v : null;
}

/** Parse le mode de combinaison des pastilles (`modeConsentement=et|ou`) ; DÉFAUT `'et'`. Liste blanche stricte :
 *  seule la valeur `'ou'` bascule ; toute autre (absente, vide, forgée) → `'et'`. */
export function lireModeConsentement(params: URLSearchParams): ModeConsentement {
  return params.get('modeConsentement') === 'ou' ? 'ou' : 'et';
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
  // Titulaire d'un compte ? `EXISTS(internaute_auth)` (peaufinage : capsule « Compte / One-shot » de la vue admin).
  // OPTIONNEL : renseigné par la liste admin (`lireProfilsFiltres`) ; ABSENT de l'export CSV (COLONNES_EXPORT figées).
  a_un_compte?: boolean;
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
