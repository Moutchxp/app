/**
 * LOT 101 → PL-C5 — le chemin MUTANT de correction (corrigerParcelle, qui réécrivait permis_parcelle en origine='saisie' et GELAIT
 * la ligne pour toujours — la purge ne vise que 'extraite', l'insertion ignore les conflits) est RETIRÉ : la SUPERPOSITION de
 * sélection (permis_parcelle_selection, PL-C) le remplace, sans jamais muter permis_parcelle. Choisir DI 649 au lieu de DK 649 se
 * fait désormais dans la PLANCHE cadastrale (clic + « Valider la sélection »), avec une provenance VRAIE (l'admin authentifié).
 *
 * Ne subsiste ici que `annulerCorrectionParcelle` : indispensable pour NEUTRALISER une ligne déjà gelée par l'ancien chemin (le
 * cas verif-lot101 du 468). Elle restaure la référence d'origine et repose origine='extraite' → la ligne se dégèle et redevient
 * re-dérivable. RÉSILIENTE : colonne `correction` absente (migration 197) → « rien à annuler », sans rien casser.
 */
import { query } from '../db/client';
import { figerEmpreinte, lireParcellesPermis, lireEmpreintePermis, type ParcelleLigne, type EmpreinteLigne } from './parcellesRepo';

/** Une erreur SQL est-elle « colonne `correction` absente » (migration 197 non appliquée) ? */
function estColonneAbsente(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === '42703' || code === '42P01';
}

/**
 * ANNULE une correction manuelle héritée de l'ancien chemin : restaure la référence d'origine (depuis `correction.refOrigine`),
 * repose origine='extraite', vide le snapshot, PUIS recalcule l'empreinte (qui redevient l'état d'AVANT, jamais un vide inventé).
 * `annule:false` = rien à annuler (pas de correction sur cette ligne). C'est le SEUL geste conservé de LOT 101 — il sert à
 * DÉGELER une ligne 'saisie' figée par l'ancien corrigerParcelle (retiré en PL-C5).
 */
export async function annulerCorrectionParcelle(dossierId: number, parcelleId: number, majPar: string): Promise<{ ok: boolean; annule: boolean; parcelles?: ParcelleLigne[]; empreinte?: EmpreinteLigne | null }> {
  type Corr = { refOrigine?: { prefixe: string | null; section: string; numero: string; idu: string | null } } | null;
  let corr: Corr = null;
  try {
    const { rows } = await query<{ correction: Corr }>(`SELECT correction FROM permis_parcelle WHERE id = $1 AND dossier_id = $2`, [parcelleId, dossierId]);
    corr = rows[0]?.correction ?? null;
  } catch (e) { if (estColonneAbsente(e)) return { ok: true, annule: false }; throw e; } // migration absente → rien à annuler
  const ref = corr?.refOrigine;
  if (!ref) return { ok: true, annule: false }; // pas une correction manuelle
  await query(
    `UPDATE permis_parcelle
        SET section = $3, numero = $4, prefixe = $5, idu = $6, origine = 'extraite', geom_snapshot = NULL, snapshot_millesime = NULL,
            correction = NULL, maj_le = now(), maj_par = $7
      WHERE id = $1 AND dossier_id = $2`,
    [parcelleId, dossierId, ref.section, ref.numero, ref.prefixe, ref.idu, majPar]);
  await figerEmpreinte(dossierId, majPar); // recompute → empreinte redevient incomplète (état d'avant), jamais un vide inventé
  return { ok: true, annule: true, parcelles: await lireParcellesPermis(dossierId), empreinte: await lireEmpreintePermis(dossierId) };
}
