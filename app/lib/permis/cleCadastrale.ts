/**
 * PARC-1 — MODULE PUR de rapprochement parcelle ↔ dossier Sitadel. Aucune I/O. Construit la clé cadastrale normalisée,
 * tranche l'appariement (refus si ambigu) et porte la règle de PRÉSÉANCE entre un lien de première main ('instruit') et un
 * lien déduit ('cadastral').
 *
 * ⚠️ La normalisation SQL de la CLI `permis:rapprocher-parcelles` DOIT rester le MIROIR EXACT de `normaliserCleCadastrale`
 * (upper + btrim de la section, btrim du numéro) — même patron que `classer`/`expressionRangSql` (JS ↔ SQL synchrones).
 *
 * RÈGLES DE NORMALISATION — JUSTIFIÉES PAR MESURE (docs/RECON_PARCELLE_PERMIS.md + PARC-1). Sur les 8 031 réfs « introuvables »
 * (commune couverte, pas de match exact) :
 *  · MAJUSCULE + trim de la SECTION : récupère le SEUL cas mesuré (ex. section 'f' → 'F', commune 92026). Retenu.
 *  · trim du NUMÉRO : sûr (espaces parasites), ne change rien aux cas mesurés mais ne peut pas nuire.
 *  · ZÉROS DE TÊTE du numéro : NON supprimés — mesuré : récupère 0 cas, et risquerait de créer de FAUX appariements
 *    ('01' ↔ '1' ↔ '10' selon les communes). Une règle qui ne récupère rien n'existe pas.
 * Gain net de la normalisation vs match exact : **1 dossier** sur 30 035 (les « introuvables » sont des LACUNES du cadastre,
 * pas des écarts de format).
 */

export type OrigineLien = 'instruit' | 'cadastral';

export interface CleCadastrale { commune: string; section: string; numero: string }

/**
 * Clé de rapprochement normalisée, ou `null` si une composante est vide (aucun rapprochement possible). Section en MAJUSCULE
 * trimée ; numéro trimé ; commune (code INSEE) trimé. PURE.
 */
export function normaliserCleCadastrale(
  codeInsee: string | null | undefined,
  section: string | null | undefined,
  numero: string | null | undefined,
): CleCadastrale | null {
  const commune = (codeInsee ?? '').trim();
  const sec = (section ?? '').trim().toUpperCase();
  const num = (numero ?? '').trim();
  if (commune === '' || sec === '' || num === '') return null;
  return { commune, section: sec, numero: num };
}

export type ResultatAppariement<T> =
  | { statut: 'apparie'; parcelle: T }
  | { statut: 'ambigu'; nb: number }   // ≥ 2 parcelles pour la même clé → REFUSÉ (compté comme échec, jamais un succès)
  | { statut: 'aucun' };

/**
 * Tranche l'appariement d'une clé normalisée aux parcelles trouvées : EXACTEMENT une → appariée ; plusieurs → AMBIGU (refusé) ;
 * aucune → aucun. Une normalisation ne doit JAMAIS créer un appariement ambigu qui passerait pour un succès. PURE.
 */
export function choisirAppariement<T>(parcelles: readonly T[]): ResultatAppariement<T> {
  if (parcelles.length === 1) return { statut: 'apparie', parcelle: parcelles[0] };
  if (parcelles.length >= 2) return { statut: 'ambigu', nb: parcelles.length };
  return { statut: 'aucun' };
}

/**
 * PRÉSÉANCE — un lien EXISTANT sur la paire dossier/parcelle est CONSERVÉ ; on n'insère un lien 'cadastral' que s'il n'existe
 * encore RIEN. Autrement dit : un lien 'instruit' (lecture Cerfa, première main) n'est JAMAIS remplacé par un 'cadastral'
 * (déduit, fiabilité moindre) — et un 'cadastral' déjà posé n'est pas dupliqué (idempotence). PURE.
 *
 * 🔴 SENS À NE PAS INVERSER : `origineExistante` non nulle ⇒ 'garder'. Le test `cleCadastrale.test.ts` casse si on inverse.
 */
export function resoudrePreseance(origineExistante: OrigineLien | null): 'inserer' | 'garder' {
  return origineExistante === null ? 'inserer' : 'garder';
}
