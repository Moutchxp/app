/**
 * Module INTERNAUTE — LOT 3 (exploitation interne) : construction PURE des filtres + sérialisation CSV.
 *
 * Pur, sans accès base, AUCUN import `app/lib/analytics/*` ni moteur → cloisonnement M2 trivial. L'EXÉCUTION SQL
 * (le `query`) reste dans `extractionRepo.ts` (serveur only). Ici, uniquement de la CONSTRUCTION de chaînes SQL,
 * testable sans base : le fragment FROM/JOIN de l'invariant de consentement (paramétré par finalité-axe), le builder
 * de clauses WHERE paramétrées (extensible) et le sérialiseur CSV.
 */
import type { CleFinalite } from './textesConsentement';
import { FINALITES_SEED } from './consentement';

/**
 * Finalité-axe par DÉFAUT de l'extraction commerciale interne : F1 (recontact interne), historiquement la SEULE.
 * Source unique — le refactor « paramétrable par axe » (LOT 1) conserve ce défaut → ISO-COMPORTEMENT total.
 */
export const AXE_DEFAUT: CleFinalite = 'recontact_interne';

/**
 * Axes d'extraction sélectionnables par l'admin (LOT 2) = les finalités connues (clés dérivées de `FINALITES_SEED`,
 * jamais re-hardcodées). Chaque axe BORNE la population exportée à ses consentants actifs (INNER JOIN dans
 * `clauseFromInvariant`) → étanchéité stricte, jamais un OR entre finalités. `code`/`libelle` = affichage admin.
 */
export const AXES_EXPORT: ReadonlyArray<{ axe: CleFinalite; code: string; libelle: string }> = [
  { axe: FINALITES_SEED.recontactInterne, code: 'F1', libelle: 'Recontact (F1)' },
  { axe: FINALITES_SEED.emailMarketing, code: 'F2', libelle: 'Email (F2)' },
  { axe: FINALITES_SEED.retargetingTiers, code: 'F3', libelle: 'Retargeting (F3)' },
];

/** Ensemble des clés d'axe VALIDES — garde de `lireAxe` (tout axe hors de cet ensemble retombe sur le défaut F1). */
const AXES_VALIDES: ReadonlySet<string> = new Set(AXES_EXPORT.map((a) => a.axe));

/**
 * Fragment FROM/JOIN portant l'INVARIANT DE CONSENTEMENT, PARAMÉTRÉ par la finalité-`axe` (défaut `AXE_DEFAUT` = F1).
 * PUR : ne fait que CONSTRUIRE la chaîne SQL — l'exécution reste dans `extractionRepo.ts`. Le dernier projet de chaque
 * personne est joint par LATERAL. AUCUN paramètre lié ici : la finalité est un LITTÉRAL de type fermé `CleFinalite`
 * (jamais une entrée utilisateur) → les filtres de `construireFiltres` commencent toujours à `$1`.
 *
 * ÉTANCHÉITÉ (LOT 2) : le JOIN est un INNER JOIN sur `ca.finalite = '${axe}' AND ca.actif = true` → SEULS les
 * consentants ACTIFS de l'axe survivent. Une personne sans consentement actif à cet axe (p. ex. un F1-only face à un
 * axe F2) est écartée par la jointure. Aucune disjonction (OR) n'est jamais produite : la population est bornée par
 * l'axe, et les filtres additionnels de `construireFiltres` sont TOUS ajoutés en AND. Défaut F1 → ISO avec le LOT 1.
 *
 * L'opt-out `opposition_recontact` est PROPRE à F1 (recontact) : appliqué UNIQUEMENT sur l'axe F1 ; les axes F2/F3
 * n'ont pas d'opt-out dédié à ce stade → on ne les filtre pas dessus (sinon on écarterait à tort un consentant
 * email/retargeting ayant refusé le recontact). `efface_a IS NULL` reste commun à TOUS les axes.
 *
 * Défense en profondeur : `axe` étant INTERPOLÉ (jamais lié), on VALIDE qu'il n'est qu'un identifiant `[a-z0-9_]+`
 * (toutes les clés de finalité le sont) → toute injection SQL est structurellement impossible même si un appelant
 * futur contournait le typage.
 */
export function clauseFromInvariant(axe: CleFinalite = AXE_DEFAUT): string {
  if (!/^[a-z0-9_]+$/.test(axe)) throw new Error(`finalité-axe invalide (attendu [a-z0-9_]+) : ${axe}`);
  // opposition_recontact = opt-out F1-spécifique → présent SEULEMENT sur l'axe F1 (défaut). F2/F3 : aucun opt-out dédié.
  const opposition = axe === AXE_DEFAUT ? 'i.opposition_recontact = false\n    AND ' : '';
  return `
  FROM internaute i
  JOIN internaute_consentement_actif ca
    ON ca.internaute_id = i.id AND ca.finalite = '${axe}' AND ca.actif = true
  LEFT JOIN LATERAL (
    SELECT verdict, score, dernier_etage, residence_principale, commune_insee
    FROM internaute_projet pr WHERE pr.internaute_id = i.id ORDER BY pr.cree_a DESC LIMIT 1
  ) p ON true
  WHERE ${opposition}i.efface_a IS NULL            -- LOT 4 : un profil effacé (PII anonymisées) ne réapparaît JAMAIS en extraction
`;
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
  // Restriction de consentement PARMI les F1 (jamais un élargissement) : true → exiger AUSSI F2 (email) / F3 (tiers).
  aF2?: boolean | null;
  aF3?: boolean | null;
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
  // Restriction de consentement PARMI les F1 : AND EXISTS (finalité F2/F3 active pour CETTE personne). C'est un
  // FILTRE qui RÉDUIT l'ensemble déjà borné à l'axe (défaut F1) par `clauseFromInvariant` — JAMAIS un OR, jamais un ajout hors-axe.
  // La finalité est un LITTÉRAL constant piloté par un booléen (aucune entrée texte utilisateur → aucune injection).
  if (f.aF2 === true) clauses.push(`EXISTS (SELECT 1 FROM internaute_consentement_actif ca_f2 WHERE ca_f2.internaute_id = i.id AND ca_f2.finalite = 'email_marketing' AND ca_f2.actif = true)`);
  if (f.aF3 === true) clauses.push(`EXISTS (SELECT 1 FROM internaute_consentement_actif ca_f3 WHERE ca_f3.internaute_id = i.id AND ca_f3.finalite = 'retargeting_tiers' AND ca_f3.actif = true)`);

  return { clauses, params };
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
    aF2: bool('f2'),
    aF3: bool('f3'),
  };
}

/**
 * Axe d'extraction demandé (query param `axe`), VALIDÉ contre les finalités connues (`AXES_VALIDES`). Absent, vide
 * ou inconnu → défaut `AXE_DEFAUT` (F1) — jamais un axe arbitraire (défense en profondeur, complète la garde
 * `[a-z0-9_]+` de `clauseFromInvariant`). Le param `axe` détermine SEUL la population bornée ; il n'entre pas dans
 * les clauses WHERE de `construireFiltres`.
 */
export function lireAxe(params: URLSearchParams): CleFinalite {
  const v = params.get('axe');
  return v !== null && AXES_VALIDES.has(v) ? (v as CleFinalite) : AXE_DEFAUT;
}

/** Une ligne de résultat exploitable (identité + dernier projet + date de consentement de l'axe). */
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
