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
 * pour signaler une troncature). Requête vide → aucun résultat. PURE.
 */
export function rechercherDansVivier(vivier: readonly PermisVivier[], q: string, process: Process, cap: number): ResultatRechercheVivier {
  if (norm(q) === '') return { resultats: [], total: 0, autreProcess: 0 };
  const matches = vivier.filter((p) => correspondVivier(p, q));
  const actif = matches.filter((p) => processDeCanal(p.canal) === process);
  const autre = matches.filter((p) => {
    const pr = processDeCanal(p.canal);
    return pr !== null && pr !== process;
  }).length;
  return { resultats: actif.slice(0, cap), total: actif.length, autreProcess: autre };
}
