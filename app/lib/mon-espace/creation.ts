import type { DossierSaisie } from '../transaction/saisie';

/**
 * ══ 🔴 MON ESPACE, LOT 5 (Arno, 02/11/2026) — CRÉER UN COMPROMIS DEPUIS « MON ESPACE » : CE QUE LE SERVEUR EXIGE EN PLUS (PUR) ═══════════════════
 *
 * L'enregistrement est celui de la tuile Suivi CA (`enregistrerDossier` : même validation, même répartition, mêmes commissions, même inter-cabinet,
 * même refus d'un n° de mandat déjà pris — lot 2). « Mon espace » n'ajoute que trois conditions, vérifiées AVANT :
 *   · une CRÉATION de compromis, rien d'autre (ni une vente directement actée, ni une modification) ;
 *   · le n° de mandat, obligatoire (et la migration 449 appliquée : sans elle, aucun contrôle de doublon possible, donc aucune création) ;
 *   · un collaborateur figure LUI-MÊME sur au moins un côté (négociateur d'entrée, de sortie, ou une partie) ; un administrateur peut créer pour
 *     n'importe qui (décision d'Arno).
 */
export const MOTIF_CREATION_COMPROMIS = 'Depuis « Mon espace », on crée un compromis (l’acte se signe ensuite). Rien n’a été enregistré.';
export const MOTIF_CREATION_SANS_MANDAT = 'Le n° de mandat est obligatoire pour créer un compromis. Rien n’a été enregistré.';
export const MOTIF_CREATION_SANS_449 = 'La création depuis « Mon espace » est disponible après la mise à jour de la base (migration 449 : n° de mandat). Rien n’a été enregistré.';
export const MOTIF_CREATION_PAS_SUR_UN_COTE = 'Vous devez figurer vous-même sur un côté du compromis (entrée ou sortie du mandat). Rien n’a été enregistré.';

/** Le titulaire est-il sur un côté de la saisie ? PUR. */
export const estSurUnCote = (s: Pick<DossierSaisie, 'entreeId' | 'sortieId' | 'parties'>, compteId: number): boolean =>
  s.entreeId === compteId || s.sortieId === compteId || s.parties.some((p) => p.compteId === compteId);

/** Le refus d'une création depuis « Mon espace » (null : la saisie peut partir vers `enregistrerDossier`). PUR. */
export function refusCreation(s: DossierSaisie, o: { compteId: number; administrateur: boolean; mandatDisponible: boolean }):
  { statut: 403 | 422; motif: string } | null {
  if (s.statut !== 'compromis') return { statut: 422, motif: MOTIF_CREATION_COMPROMIS };
  if (!o.mandatDisponible) return { statut: 422, motif: MOTIF_CREATION_SANS_449 };
  if (s.numeroMandat == null) return { statut: 422, motif: MOTIF_CREATION_SANS_MANDAT };
  if (!o.administrateur && !estSurUnCote(s, o.compteId)) return { statut: 403, motif: MOTIF_CREATION_PAS_SUR_UN_COTE };
  return null;
}

/** La transaction qui porte déjà un n° de mandat, telle que l'étape « vérification » la décrit (sans aucun montant). */
export interface TransactionDuMandat {
  id: number; societe: 'criterimmo' | 'macj'; numero: string; libelle: string; statut: 'compromis' | 'vendue';
  dateCompromis: string | null; dateActe: string | null; adresseBien: string | null;
  vendeurs: string[]; acquereurs: string[];
  /** Les collègues déjà rattachés : le négociateur d'entrée et celui de sortie (« Prénom NOM »), quand ils sont connus. */
  entree: string | null; sortie: string | null;
}
