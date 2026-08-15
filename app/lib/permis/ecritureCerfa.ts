/**
 * N7-D — DÉPÔT D'ÉCRITURE du mapping Cerfa (niveau PERMIS). IMPUR (base) : consomme une `DecisionCerfa` (pure) et l'applique aux
 * colonnes DÉCLARÉES de permis_caracteristique (migration 106), + journalise en `methode='cerfa'` (migration 107).
 *
 * 🔒 ARCHITECTURE :
 * - Ces colonnes vivent au niveau PERMIS : la règle « ≥2 corps → n'attribuer à aucun » NE S'APPLIQUE PAS. On écrit quel que soit
 *   le nombre de corps (on ne lit même pas les corps). La colonne corps.adresse, elle, n'est jamais écrite ici (décision pure).
 * - Invariant « une saisie n'est jamais écrasée » RÉUTILISÉ via `ecrireCaracteristiquesGlobales` (mode 'extraite') — pas réimplémenté.
 * - RECOMPUTE IDEMPOTENT : on purge UNIQUEMENT le journal `methode='cerfa'` du permis (jamais 'motifs' ni la saisie) avant de
 *   réécrire ses lignes → deux runs n'empilent pas de doublons, et le journal des motifs (N5-E) reste intact.
 * - Chaque valeur écrite laisse une ligne 'retenue' avec sa pièce (le Cerfa), le NOM EXACT du champ dans l'extrait, confiance et réserve.
 */
import { query } from '../db/client';
import { ecrireCaracteristiquesGlobales, type ValeursGlobalDeclare } from './caracteristiquesRepo';
import type { DecisionCerfa, DecisionCerfaChamp } from './decisionCerfa';

export const MOTIF_SAISIE_PRIORITAIRE = 'une valeur saisie à la main occupe déjà le champ (non écrasée)';

export interface ResultatEcritureCerfa { champsEcrits: string[]; champsIgnoresSaisie: string[]; champsNonEcrits: string[] }

type Role = 'retenue' | 'ecartee';
interface LigneJournal {
  champ: string; valeur: number | null; role: Role; confiance: 'confirmee' | 'a_verifier' | null;
  reserve: string | null; motif: string | null; piece: string | null; page: number | null; extrait: string | null;
}

function ligneRetenue(d: DecisionCerfaChamp): LigneJournal {
  return {
    champ: d.colonne,
    valeur: typeof d.valeur === 'number' ? d.valeur : null, // le texte (nature/adresse) vit dans l'extrait, pas dans valeur (numeric)
    role: 'retenue', confiance: d.confiance ?? null, reserve: d.reserve ?? null, motif: null,
    piece: d.provenance?.pieceNom ?? null, page: d.provenance?.page ?? null, extrait: d.provenance?.extrait ?? null,
  };
}
const ligneEcartee = (champ: string, motif: string): LigneJournal =>
  ({ champ, valeur: null, role: 'ecartee', confiance: null, reserve: null, motif, piece: null, page: null, extrait: null });

async function journaliser(dossierId: number, lignes: LigneJournal[]): Promise<void> {
  for (const l of lignes) {
    await query(
      `INSERT INTO permis_extraction_journal
         (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
       VALUES ($1, NULL, $2, $3, NULL, $4, 'cerfa', $5, $6, $7, $8, $9, $10, now())`,
      [dossierId, l.champ, l.valeur, l.role, l.confiance, l.reserve, l.motif, l.piece, l.page, l.extrait],
    );
  }
}

/** Applique la décision Cerfa (niveau permis). `majPar` identifie l'auteur automatique. */
export async function ecrireCerfa(dossierId: number, decision: DecisionCerfa, majPar: string): Promise<ResultatEcritureCerfa> {
  // Recompute idempotent : purge CIBLÉE de la méthode qu'on réécrit (jamais 'motifs' ni la saisie).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'cerfa'`, [dossierId]);

  // Écriture des colonnes PERMIS 'ecrit' (mode 'extraite' → invariant saisie réutilisé). corps.adresse n'est jamais écrite.
  const aEcrire = decision.champs.filter((d) => d.portee === 'permis' && d.statut === 'ecrit' && d.cle);
  const valeurs: ValeursGlobalDeclare = {};
  for (const d of aEcrire) (valeurs as Record<string, string | number>)[d.cle!] = d.valeur as string | number;
  const res = aEcrire.length > 0 ? await ecrireCaracteristiquesGlobales(dossierId, valeurs, 'extraite', majPar) : { ecrits: [], ignores: [] };

  const lignes: LigneJournal[] = [];
  const champsEcrits: string[] = [], champsIgnoresSaisie: string[] = [], champsNonEcrits: string[] = [];
  for (const d of decision.champs) {
    if (d.statut === 'non_ecrit') { lignes.push(ligneEcartee(d.colonne, d.motif ?? 'non écrit')); champsNonEcrits.push(d.colonne); continue; }
    if (d.portee === 'permis' && d.cle) {
      if (res.ecrits.includes(d.cle)) { lignes.push(ligneRetenue(d)); champsEcrits.push(d.colonne); }
      else if (res.ignores.includes(d.cle)) { lignes.push(ligneEcartee(d.colonne, MOTIF_SAISIE_PRIORITAIRE)); champsIgnoresSaisie.push(d.colonne); }
    }
  }
  await journaliser(dossierId, lignes);
  return { champsEcrits, champsIgnoresSaisie, champsNonEcrits };
}
