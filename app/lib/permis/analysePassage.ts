import 'server-only';
import { query } from '../db/client';
import { MARQUEUR_FICHE_SYNTHESE } from './gedConstantes';
import { executerExtractionPermis, type CompteRenduExtraction } from './executerExtraction';
import { lireDeclarationsRecap, reporterDeclarationsCerfa } from './cerfaRecapRepo';
import { autocreerCartes, depsReellesAutocreation } from './autocreationCartesRepo'; // BAT-1 — cartes auto + nombre validé (no-op si 218 absente)

/**
 * LOT 70 — ANALYSE AU PASSAGE EN « Analyse et projection ». Quand un permis entre en analyse, on veut le MAXIMUM de champs remplis
 * SANS geste d'Arno. Deux régimes, comme diagnosticsVague (56-C) :
 *  - l'analyse COMPLÈTE (vision, service payant 20-30 s) ne part QUE si aucune analyse n'a JAMAIS tourné pour ce dossier, OU si la
 *    GED a CHANGÉ depuis la dernière → sinon on ne re-paie pas ;
 *  - dans TOUS les cas, on REPORTE gratuitement les déclarations déjà connues (instantané `permis_cerfa_recap`) dans les champs vides.
 * À exécuter SOUS LE VERROU du dossier (LOT 58) — le route l'enveloppe dans `avecVerrouDossier`.
 */

export interface ResultatPassageAnalyse {
  ok: boolean;
  analyseLancee: boolean;          // true = analyse complète (vision) exécutée
  motifNonLancee: string | null;   // pourquoi elle n'a pas tourné (déjà à jour) — null si lancée
  champsReportes: string[];        // colonnes de caractéristique remplies depuis les déclarations DURANT ce passage (régime gratuit)
  rapport: CompteRenduExtraction | null; // compte rendu de l'analyse complète si lancée
}

/**
 * Règle (b), MÊME logique que diagnosticsVague (56-C) : lance l'analyse complète si le dossier n'a JAMAIS été extrait (aucune ligne
 * de journal d'extraction) OU si sa GED a CHANGÉ depuis le dernier diagnostic mémorisé. « GED » = documents réels (hors fiche de
 * synthèse). RÉSILIENT : tables absentes → on préfère lancer (le pipeline est sûr et « rien trouvé » est légitime).
 */
export async function doitLancerAnalyse(dossierId: number): Promise<boolean> {
  try {
    const { rows } = await query<{ nb_ged: number; nb_journal: number; nb_memorise: number | null }>(
      `SELECT
         (SELECT count(*)::int FROM dossier_document d WHERE d.dossier_id = $1 AND d.note IS DISTINCT FROM $2) AS nb_ged,
         (SELECT count(*)::int FROM permis_extraction_journal j WHERE j.dossier_id = $1)                        AS nb_journal,
         (SELECT nb_pieces FROM permis_completude pc WHERE pc.dossier_id = $1)                                  AS nb_memorise`,
      [dossierId, MARQUEUR_FICHE_SYNTHESE]);
    const r = rows[0];
    if (!r || r.nb_ged === 0) return false; // aucun document réel à analyser → inutile de payer la vision
    if (r.nb_journal === 0) return true;    // jamais extrait → on lance
    if (r.nb_memorise === null) return true; // jamais diagnostiqué → on lance
    return r.nb_ged !== r.nb_memorise;       // GED changée depuis le dernier diagnostic → on relance ; sinon on ne re-paie pas
  } catch {
    return false; // gate indisponible → prudence : on ne déclenche pas un appel payant sur un état incertain (le report gratuit se fait quand même)
  }
}

/**
 * Exécute le passage en analyse pour un dossier. `analyseLancee` → l'analyse complète a tourné (elle reporte déjà les déclarations
 * en interne). Sinon on lit l'instantané des déclarations et on reporte les champs vides GRATUITEMENT.
 */
export async function analyserAuPassageEnAnalyse(dossierId: number, majPar: string): Promise<ResultatPassageAnalyse> {
  if (await doitLancerAnalyse(dossierId)) {
    const rapport = await executerExtractionPermis(dossierId, { avecVision: true, majPar });
    // BAT-1 — auto-création des cartes + pose du nombre validé, APRÈS l'extraction (corps matérialisés, décompte connu). Idempotent,
    //   best-effort (ne compromet jamais l'analyse), et NO-OP tant que la migration 218 n'est pas appliquée (colonne absente).
    await autocreerCartes(dossierId, 'analyse:auto', depsReellesAutocreation(), { appliquer: true }).catch((e) => { console.warn('[analyse] auto-création cartes en échec (best-effort)', { dossierId, motif: e instanceof Error ? e.message : String(e) }); });
    return { ok: rapport.ok, analyseLancee: true, motifNonLancee: null, champsReportes: [], rapport };
  }
  // Analyse déjà à jour : report GRATUIT des déclarations connues (jamais de vision).
  let champsReportes: string[] = [];
  const snap = await lireDeclarationsRecap(dossierId).catch(() => null);
  if (snap?.declarations) champsReportes = await reporterDeclarationsCerfa(dossierId, snap.declarations, snap.pieceSource, majPar).catch(() => []);
  // BAT-1 — même geste sur la branche « déjà à jour » : idempotent (si déjà validé → intouché), best-effort, NO-OP si 218 absente.
  await autocreerCartes(dossierId, 'analyse:auto', depsReellesAutocreation(), { appliquer: true }).catch((e) => { console.warn('[analyse] auto-création cartes en échec (best-effort)', { dossierId, motif: e instanceof Error ? e.message : String(e) }); });
  return { ok: true, analyseLancee: false, motifNonLancee: 'analyse déjà à jour (GED inchangée) — valeurs connues reportées', champsReportes, rapport: null };
}
