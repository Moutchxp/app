/**
 * D3 — RECHERCHE PURE dans le VIVIER (permis encore demandables), scopée par process. Aucune I/O. Le vivier lui-même (liste des
 * permis éligibles) est construit côté repo (`chargerVivier`) à partir de la MÊME définition d'éligibilité que le stock et la
 * proposition (`estCandidatEligible`) — jamais redéfinie ici. Ce module ne fait que FILTRER + SCOPER + compter l'autre process.
 *
 * 🔑 SCOPING NON SILENCIEUX : une correspondance dans l'AUTRE vivier n'est jamais « aucun résultat » — elle est comptée et
 * annoncée (« N résultat(s) dans le process X — basculer »), même principe que la mention hors-process de D2.
 */
import { processDeCanal, type Process } from './process';
import type { CleCategorie } from './priorite';

export interface PermisVivier {
  dossierId: number;
  numDau: string;
  type: 'PC' | 'PD' | null;
  codeInsee: string;
  communeNom: string | null;
  canal: string | null;
  categorie: CleCategorie;
  dateAutorisation: string | null;
  adresse: string | null; // rue seule (n° + libellé de voie), sans la localité ; null si absente (jamais un placeholder)
}

export interface ResultatRechercheVivier {
  resultats: PermisVivier[]; // du process actif, capés à `cap`
  total: number;             // nombre TOTAL de correspondances du process actif (avant cap) — pour signaler une troncature
  autreProcess: number;      // nombre de correspondances dans l'AUTRE process (mention non silencieuse)
}

/**
 * MOTEUR COMPLET (rail téléservice) — colonnes de TRI, bornées aux champs RÉELLEMENT présents dans `PermisVivier` (:12-22).
 * `date` = `dateAutorisation` ; `commune` = `communeNom` (repli `codeInsee`). ⚠️ PAS de `surface` : ce champ n'existe pas dans le
 * vivier (aucune jointure ajoutée pour l'obtenir — décision : livrer sans, cf. rapport). Additif : le rail e-mail n'envoie jamais
 * ces options → comportement historique intact.
 */
export type ColonneTriVivier = 'date' | 'commune';
export const COLONNES_TRI_VIVIER: readonly ColonneTriVivier[] = ['date', 'commune'];
export interface TriVivier { colonne: ColonneTriVivier; sens: 'asc' | 'desc' }
/** Options OPTIONNELLES de la recherche (moteur complet). Absentes → recherche historique à l'identique. */
export interface OptionsRechercheVivier {
  typesCategories?: string[]; // clés de catégorie retenues (cf. PermisVivier.categorie) ; vide/absent → tous les types
  tri?: TriVivier;            // tri appliqué AVANT le cap ; absent → ordre naturel du vivier (historique)
}

/**
 * Décode un paramètre de tri « colonne:sens » en `TriVivier`, ou `undefined` si absent/invalide (colonne hors
 * `COLONNES_TRI_VIVIER` — dont `surface`, inexistant — ou sens ≠ asc/desc). PURE. Un tri invalide n'est jamais une erreur : il est
 * simplement ignoré (retour à l'ordre naturel), pour que le passe-plat serveur reste tolérant.
 */
export function parseTriVivier(v: string | null | undefined): TriVivier | undefined {
  if (typeof v !== 'string') return undefined;
  const parts = v.split(':');
  if (parts.length !== 2) return undefined; // « colonne:sens » EXACTEMENT (rejette 'date', 'date:asc:desc', etc.)
  const [colonne, sens] = parts;
  if (!COLONNES_TRI_VIVIER.includes(colonne as ColonneTriVivier)) return undefined;
  if (sens !== 'asc' && sens !== 'desc') return undefined;
  return { colonne: colonne as ColonneTriVivier, sens };
}

/** Ordre de base (croissant) d'une colonne de tri du vivier. Départage FINAL par `dossierId` → ordre TOTAL (asc/desc inverses exacts). */
function ordreBaseVivier(colonne: ColonneTriVivier, a: PermisVivier, b: PermisVivier): number {
  let c = 0;
  if (colonne === 'date') c = (a.dateAutorisation ?? '').localeCompare(b.dateAutorisation ?? '');
  else c = (a.communeNom ?? a.codeInsee).localeCompare(b.communeNom ?? b.codeInsee, 'fr'); // 'commune'
  return c !== 0 ? c : a.dossierId - b.dossierId;
}

/** Trie une liste de permis du vivier (copie, jamais en place). `desc` = négation exacte de `asc`. PURE. */
export function trierVivier(resultats: readonly PermisVivier[], tri: TriVivier): PermisVivier[] {
  const sign = tri.sens === 'asc' ? 1 : -1;
  return [...resultats].sort((a, b) => sign * ordreBaseVivier(tri.colonne, a, b));
}

/**
 * Normalise pour la comparaison — SANS accents, MAJUSCULES, et sans les caractères qui ne portent pas de sens de recherche : espaces
 * (y compris multiples), virgules, points, apostrophes (droite ' ET typographiques ’ ‘), accent grave, tirets/traits (- – —). Appliquée
 * SYMÉTRIQUEMENT à la saisie ET à la donnée stockée (num_dau, ville, adresse) → la tolérance marche dans les DEUX sens. Même esprit que
 * `normaliserReference`. Ainsi « 25, rue de l'Hôtel » ≡ « 25 rue de l hotel » ≡ « 25   RUE DE L’HOTEL ». PURE.
 */
function norm(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // ① retire les accents/diacritiques (é→e, ô→o, ÿ→y, ç→c…)
    .toUpperCase()
    .replace(/[\s,.'’‘`–—-]/g, '');          // ② espaces, virgules, points, apostrophes ' ’ ‘ `, tirets/traits - – —
}

/**
 * Types de voie GÉNÉRIQUES. Une saisie d'adresse les contient souvent (« 82 rue denfert ») alors que la donnée porte un AUTRE type
 * (« 82 AVENUE Denfert ») — l'internaute ne retient pas toujours rue/avenue/boulevard. On ne les EXIGE donc pas comme mot… SAUF si la
 * saisie ne contient QUE des types de voie (« rue » seul) : là on les GARDE (recherche large ASSUMÉE, cf. `tokeniser`). Ce n'est PAS
 * une correspondance devinée : on n'impose simplement pas un qualificatif générique. Normalisés (MAJUSCULES, sans accents/ponctuation).
 */
const STOP_VOIE: ReadonlySet<string> = new Set([
  'RUE', 'AVENUE', 'AV', 'AVE', 'BOULEVARD', 'BD', 'BLVD', 'IMPASSE', 'ALLEE', 'ALLEES', 'PLACE', 'PL', 'CHEMIN', 'CHE', 'QUAI', 'COURS',
  'PASSAGE', 'PSG', 'ROUTE', 'RTE', 'VOIE', 'SENTE', 'SENTIER', 'VILLA', 'SQUARE', 'SQ', 'FAUBOURG', 'FBG', 'RESIDENCE', 'RES', 'HAMEAU',
  'RUELLE', 'VENELLE', 'ESPLANADE', 'PROMENADE', 'MAIL', 'CARREFOUR', 'CITE', 'CLOS', 'DOMAINE', 'MONTEE', 'TRAVERSE', 'ROND', 'GALERIE',
  'PARVIS', 'PLACETTE', 'GRANDERUE',
]);

/**
 * Découpe la saisie en MOTS normalisés (séparateurs = espaces ET virgules ; le reste de la ponctuation est absorbé par `norm` À
 * L'INTÉRIEUR d'un mot : « l'hôtel »→« LHOTEL », « saint-martin »→« SAINTMARTIN »). Retire les types de voie génériques, SAUF si la
 * saisie n'en contient QUE (on les garde alors). PURE. Un n° de permis (mot unique) et une ville en plusieurs mots restent intacts.
 */
function tokeniser(q: string): string[] {
  const bruts = q.split(/[\s,]+/).map(norm).filter((t) => t !== '');
  const utiles = bruts.filter((t) => !STOP_VOIE.has(t));
  return utiles.length > 0 ? utiles : bruts;
}

/**
 * Un permis du vivier correspond-il à la requête ? Recherche PAR MOTS INDÉPENDANTS : CHAQUE mot de la saisie (normalisé) doit se
 * retrouver — dans n'importe quel ORDRE, sans être contigu — comme SOUS-CHAÎNE d'AU MOINS UN champ (n° de permis, ville, code INSEE,
 * adresse). ET logique entre les mots (TOUS présents), position libre. Ainsi « 82 denfert » ≡ « denfert 82 » ≡ « 82 rue denfert »
 * trouve le « 82 AVENUE Denfert Rochereau ». Un mot peut matcher un DÉBUT de mot du champ (« denf » → « DENFERT ») : sous-chaîne/préfixe,
 * jamais deviné (aucune distance d'édition). `codeInsee` comparé brut (chiffres). Tolérance de `norm` conservée (accents, virgule,
 * apostrophes, tirets, points, casse). PURE.
 */
export function correspondVivier(p: { numDau: string; communeNom: string | null; codeInsee: string; adresse?: string | null }, q: string): boolean {
  const mots = tokeniser(q);
  if (mots.length === 0) return false; // requête vide / que des séparateurs → AUCUN résultat (jamais « tout le vivier »)
  const champs = [norm(p.numDau), norm(p.communeNom ?? ''), p.codeInsee, norm(p.adresse ?? '')];
  return mots.every((m) => champs.some((c) => c.includes(m))); // chaque mot dans au moins un champ (position/ordre libres)
}

/**
 * Recherche dans le vivier, scopée au `process` actif. `cap` borne les résultats renvoyés (le total réel est renvoyé à part
 * pour signaler une troncature). `opts` (moteur complet, téléservice) est OPTIONNEL : sans lui, comportement STRICTEMENT historique
 * (filtre par mots → scope process → cap, ordre naturel du vivier). PURE.
 * - TERME `q` FACULTATIF dès qu'un CRITÈRE est fourni : q renseigné → filtre par mots ; q vide MAIS ≥ 1 type coché OU un TRI explicite
 *   → AUCUNE contrainte de terme (tout le vivier passe, puis on filtre par type éventuel et on ordonne). q vide ET sans AUCUN critère
 *   → aucun résultat (jamais « tout le vivier » par défaut). Un TRI explicite est donc un critère suffisant à lui seul (téléservice).
 *   `correspondVivier` garde sa sémantique STRICTE (q vide = aucun match, contrat inchangé) : on ne l'appelle QUE si q est renseigné.
 * - `typesCategories` (vide/absent → aucun filtre) : appliqué AVANT le split process, donc `total` ET `autreProcess` reflètent le
 *   filtre (la mention « N dans l'autre process » ne promet jamais des résultats qui, une fois basculé, seraient filtrés).
 * - `tri` (absent → ordre naturel) : appliqué AVANT le cap, pour que les `cap` premiers soient bien les `cap` premiers du tri.
 */
export function rechercherDansVivier(vivier: readonly PermisVivier[], q: string, process: Process, cap: number, opts?: OptionsRechercheVivier): ResultatRechercheVivier {
  const qVide = norm(q) === '';
  const types = opts?.typesCategories;
  const aFiltre = !!(types && types.length > 0);
  // CRITÈRE = un FILTRE (type) OU un TRI explicite. q vide + AUCUN critère → rien (jamais « tout le vivier » par défaut).
  const aCritere = aFiltre || !!opts?.tri;
  if (qVide && !aCritere) return { resultats: [], total: 0, autreProcess: 0 };
  // q vide + filtre → aucune contrainte de terme (tout le vivier) ; q renseigné → filtre par mots (correspondVivier, sémantique stricte).
  let matches = qVide ? [...vivier] : vivier.filter((p) => correspondVivier(p, q));
  if (aFiltre) {
    const retenus = new Set(types);
    matches = matches.filter((p) => retenus.has(p.categorie));
  }
  let actif = matches.filter((p) => processDeCanal(p.canal) === process);
  const autre = matches.filter((p) => {
    const pr = processDeCanal(p.canal);
    return pr !== null && pr !== process;
  }).length;
  if (opts?.tri) actif = trierVivier(actif, opts.tri);
  return { resultats: actif.slice(0, cap), total: actif.length, autreProcess: autre };
}
