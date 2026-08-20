/**
 * N10-H — DÉPÔT de la DÉSIGNATION (niveau PERMIS). IMPUR (base) : consomme une `DecisionDesignation` (pure) et l'applique à la
 * colonne `designation` de permis_caracteristique (migration 132), + journalise en `methode='enonce'` (extraite d'un ÉNONCÉ texte).
 *
 * 🔒 ARCHITECTURE (identique à ecritureCerfa) :
 * - Colonne au niveau PERMIS : la règle « ≥2 corps → n'attribuer à aucun » NE S'APPLIQUE PAS.
 * - Invariant « une saisie n'est jamais écrasée » RÉUTILISÉ via `ecrireCaracteristiquesGlobales` (mode 'extraite') — pas réimplémenté.
 * - RECOMPUTE IDEMPOTENT : purge CIBLÉE du seul journal (methode='enonce', champ='designation') avant de réécrire → pas de doublon,
 *   et les autres lignes 'enonce' (lots, superstructures) restent intactes.
 * - Valeur retenue → ligne 'retenue' avec pièce + page ; le TEXTE vit dans `extrait` (la colonne `valeur` du journal est numeric).
 *   Abstention → ligne 'ecartee' avec le motif (« pourquoi la désignation est vide »).
 */
import { query } from '../db/client';
import { ecrireCaracteristiquesGlobales } from './caracteristiquesRepo';
import { MOTIF_SAISIE_PRIORITAIRE } from './ecritureCerfa';
import type { DecisionDesignation } from './decisionDesignation';

export interface ResultatEcritureDesignation { ecrit: boolean; ignoreSaisie: boolean; abstenue: boolean }

async function journaliser(dossierId: number, role: 'retenue' | 'ecartee', motif: string | null, piece: string | null, page: number | null, extrait: string | null): Promise<void> {
  await query(
    `INSERT INTO permis_extraction_journal
       (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
     VALUES ($1, NULL, 'designation', NULL, NULL, $2, 'enonce', NULL, NULL, $3, $4, $5, $6, now())`,
    [dossierId, role, motif, piece, page, extrait],
  );
}

/** Applique la décision de désignation (niveau permis). `majPar` identifie l'auteur automatique. */
export async function ecrireDesignation(dossierId: number, decision: DecisionDesignation, majPar: string): Promise<ResultatEcritureDesignation> {
  // Recompute idempotent : purge CIBLÉE (jamais 'motifs'/'cerfa', jamais les autres 'enonce', jamais la saisie).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'enonce' AND champ = 'designation'`, [dossierId]);

  if (decision.statut === 'abstenue') {
    await journaliser(dossierId, 'ecartee', decision.motif, null, null, null);
    return { ecrit: false, ignoreSaisie: false, abstenue: true };
  }

  const res = await ecrireCaracteristiquesGlobales(dossierId, { designation: decision.valeur }, 'extraite', majPar);
  if (res.ecrits.includes('designation')) {
    await journaliser(dossierId, 'retenue', null, decision.piece, decision.page, decision.valeur);
    return { ecrit: true, ignoreSaisie: false, abstenue: false };
  }
  // Non écrite : une valeur 'saisie' occupe déjà le champ (la main l'emporte).
  await journaliser(dossierId, 'ecartee', MOTIF_SAISIE_PRIORITAIRE, null, null, null);
  return { ecrit: false, ignoreSaisie: true, abstenue: false };
}
