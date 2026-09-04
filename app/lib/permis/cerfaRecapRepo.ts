import { query } from '../db/client';
import type { DeclarationsRecapCerfa } from './recapCerfa';
import type { DecompteDescription } from './decompteDescription';
import { lirePermisCaracteristiques, ecrireCaracteristiquesGlobales, type ChampGlobalDeclare } from './caracteristiquesRepo';
import { proprietairesRetenue } from './journalLecture';
import { decisionReportDeclarations, CHAMPS_REPORTABLES, type ChampReportable, type EtatChampCourant } from './reportDeclarations';

/** LOT 69 — champ (niveau PERMIS, corps_id NULL) du nombre de bâtiments DÉCLARÉ dans le champ libre, corroboré par la somme. */
export const CHAMP_NB_BATIMENTS = 'nb_batiments_declares';

/**
 * LOT 67 — persistance de l'INSTANTANÉ des déclarations du Cerfa (récapitulatif). Informatif : affiché en lecture seule, n'alimente
 * AUCUNE colonne de valeur arbitrée par la précédence, n'écrase AUCUN champ Sitadel. RÉSILIENT : migration 192 absente (42P01/42703)
 * → écriture no-op et lecture null (aucun bloc « déclarations du Cerfa », comportement d'avant) — jamais d'exception propagée.
 */
export interface DeclarationsCerfaStockees { declarations: DeclarationsRecapCerfa; pieceSource: string | null; majLe: string | null }

/** Écrit (remplace) l'instantané d'un dossier. `true` = persisté ; `false` = table absente (no-op). */
export async function ecrireDeclarationsRecap(dossierId: number, declarations: DeclarationsRecapCerfa, pieceSource: string | null, majPar: string): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_cerfa_recap (dossier_id, declarations, piece_source, maj_le, maj_par)
         VALUES ($1, $2::jsonb, $3, now(), $4)
         ON CONFLICT (dossier_id) DO UPDATE
           SET declarations = EXCLUDED.declarations, piece_source = EXCLUDED.piece_source, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
      [dossierId, JSON.stringify(declarations), pieceSource, majPar]);
    return true;
  } catch { return false; } // 192 absente → non persisté
}

/**
 * LOT 69 — JOURNALISE (audit) le décompte lu dans le CHAMP LIBRE, sous la méthode dédiée `recap` (migration 193). Niveau PERMIS
 * (corps_id NULL), champ `nb_batiments_declares`. NE crée AUCUN corps, n'écrit AUCUNE colonne de valeur : c'est une trace d'AUDIT au
 * même titre que les lignes Cerfa/motifs, dont l'UI tire confiance + provenance + motif.
 * - concordant (somme = total structuré) → ligne 'retenue', confiance 'a_verifier' (JAMAIS 'confirmee' : la source est une phrase),
 *   valeur = nombre de bâtiments retenu, extrait = le décompte lu ;
 * - décompte LU mais DISCORDANT → ligne 'ecartee' AVEC le motif chiffré (« somme 40+18+9=67 ≠ total structuré N ») et la valeur lue ;
 * - rien lu (pas de décompte) → AUCUNE ligne (l'absence est déjà portée par `absents` de recapCerfa, N10-R — pas de bruit).
 * RECOMPUTE IDEMPOTENT : purge CIBLÉE de `methode='recap'` du dossier avant réécriture. RÉSILIENT : 193 absente (le CHECK refuse
 * 'recap') → l'INSERT échoue, capturé → no-op (l'instantané `permis_cerfa_recap` reste, lui, la source d'affichage). Renvoie `true`
 * si une ligne a été posée.
 */
export async function ecrireDecompteDescription(dossierId: number, decompte: DecompteDescription | null, pieceSource: string | null): Promise<boolean> {
  if (!decompte || (decompte.batiments.length === 0)) {
    // Rien lu : on purge quand même une éventuelle trace périmée, puis on s'arrête (best-effort).
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap'`, [dossierId]).catch(() => undefined);
    return false;
  }
  try {
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap'`, [dossierId]);
    if (decompte.concordant) {
      const reserve = `déclaré dans la description du projet ; somme des logements par bâtiment (${decompte.batiments.map((b) => b.logements).join('+')}=${decompte.sommeLogements}) vérifiée avec le total structuré (${decompte.logementsTotalStructure})`;
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
         VALUES ($1, NULL, $2, $3, NULL, 'retenue', 'recap', 'a_verifier', $4, NULL, $5, NULL, $6, now())`,
        [dossierId, CHAMP_NB_BATIMENTS, decompte.nbBatimentsRetenu, reserve, pieceSource, decompte.extrait]);
    } else {
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
         VALUES ($1, NULL, $2, $3, NULL, 'ecartee', 'recap', NULL, NULL, $4, $5, NULL, $6, now())`,
        [dossierId, CHAMP_NB_BATIMENTS, decompte.nbBatimentsDeclare, decompte.motifEcart, pieceSource, decompte.extrait]);
    }
    return true;
  } catch { return false; } // 193 absente (CHECK refuse 'recap') → no-op, l'affichage reste porté par l'instantané
}

/**
 * LOT 70 — REPORTE les DÉCLARATIONS du Cerfa (récapitulatif) dans les CHAMPS de caractéristiques (niveau PERMIS). N'écrit QUE des
 * champs VIDES (méthode `recap`, la plus faible : elle ne domine personne) ; un champ `saisie` ou détenu par une méthode supérieure
 * n'est JAMAIS écrasé (décision PURE `decisionReportDeclarations` + garde du dépôt `ecrireCaracteristiquesGlobales`). Chaque valeur
 * écrite laisse une ligne de journal 'retenue' methode='recap' confiance 'a_verifier' (JAMAIS 'confirmee' : source déclarative),
 * avec la pièce source → l'UI montre la valeur AVEC sa provenance. Idempotent : purge CIBLÉE des lignes 'recap' de CES champs avant
 * réécriture (jamais la ligne `nb_batiments_declares` du LOT 69, autre champ). Renvoie les COLONNES effectivement écrites.
 * RÉSILIENT : le report des colonnes ne dépend PAS de la migration 193 (colonnes 106 déjà là) ; seule la ligne de JOURNAL 'recap'
 * exige 193 → si absente, l'INSERT viole le CHECK, capturé → la valeur est quand même reportée (juste sans provenance journalisée).
 */
export async function reporterDeclarationsCerfa(dossierId: number, declarations: DeclarationsRecapCerfa, pieceSource: string | null, majPar: string): Promise<string[]> {
  const colonnes = CHAMPS_REPORTABLES.map((c) => c.colonne);
  const [carac, owners] = await Promise.all([
    lirePermisCaracteristiques(dossierId),
    proprietairesRetenue(dossierId, null, colonnes),
  ]);
  const g = carac.global;
  const etat: Record<ChampReportable, EtatChampCourant> = {
    nbLogements: { valeur: g?.nbLogements ?? null, origine: g?.nbLogementsOrigine ?? null, proprietaire: owners.get('nb_logements') ?? null },
    nbPlacesStationnement: { valeur: g?.nbPlacesStationnement ?? null, origine: g?.nbPlacesStationnementOrigine ?? null, proprietaire: owners.get('nb_places_stationnement') ?? null },
    surfacePlancherM2: { valeur: g?.surfacePlancherM2 ?? null, origine: g?.surfacePlancherM2Origine ?? null, proprietaire: owners.get('surface_plancher_m2') ?? null },
  };

  const aReporter = decisionReportDeclarations(declarations, etat);
  if (aReporter.length === 0) return [];

  // Écriture des colonnes (origine 'extraite' ; la garde 'saisie' du dépôt est un 2e verrou en plus de la décision pure).
  const valeurs: Partial<Record<ChampGlobalDeclare, number>> = {};
  for (const a of aReporter) (valeurs as Record<string, number>)[a.cle] = a.valeur;
  const res = await ecrireCaracteristiquesGlobales(dossierId, valeurs, 'extraite', majPar);
  const ecritsCle = new Set(res.ecrits);
  const ecrits = aReporter.filter((a) => ecritsCle.has(a.cle as ChampGlobalDeclare));
  if (ecrits.length === 0) return [];

  // JOURNAL 'recap' (audit + provenance + confiance). Purge CIBLÉE des champs reportables (jamais nb_batiments_declares du LOT 69).
  try {
    await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'recap' AND champ = ANY($2::text[])`, [dossierId, colonnes]);
    for (const a of ecrits) {
      await query(
        `INSERT INTO permis_extraction_journal
           (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
         VALUES ($1, NULL, $2, $3, NULL, 'retenue', 'recap', 'a_verifier', $4, NULL, $5, NULL, $6, now())`,
        [dossierId, a.colonne, a.valeur, 'reporté depuis la déclaration du récapitulatif du Cerfa (aucun champ n’était renseigné)', pieceSource, `déclaré : ${a.valeur}`]);
    }
  } catch { /* 193 absente (CHECK refuse 'recap') → valeur reportée sans ligne de provenance ; jamais une exception propagée */ }

  return ecrits.map((a) => a.colonne);
}

/** Lit l'instantané d'un dossier, ou null (table absente OU jamais écrit) → l'UI n'affiche pas le bloc. */
export async function lireDeclarationsRecap(dossierId: number): Promise<DeclarationsCerfaStockees | null> {
  try {
    const { rows } = await query<{ declarations: DeclarationsRecapCerfa; piece_source: string | null; maj_le: string }>(
      `SELECT declarations, piece_source, maj_le FROM permis_cerfa_recap WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    return r ? { declarations: r.declarations, pieceSource: r.piece_source, majLe: r.maj_le } : null;
  } catch { return null; } // 192 absente → aucun bloc
}
