import type { LigneVente, Partie, Vente } from './modele';
import { classeCommission, type ClasseCommission, type Statut } from '../admin/statut';

/**
 * ══ 🔴 LOTS P ET Q (Arno, 28/10/2026) — LA SEULE RÈGLE : À QUI VA UNE COMMISSION DE NÉGOCIATEUR (PUR) ════════════════════════════
 * Partagée par le cumul « Commissions versées » de l'onglet Compromis (lot P) et par le « Reste à l'agence » des onglets « Le mois » et
 * « L'année », de l'espace par négociateur et des comparaisons N-1 (lot Q) : aucune autre copie.
 *   · le STATUT du négociateur : celui FIGÉ sur sa partie à l'enregistrement de la vente ; à défaut, celui de son compte aujourd'hui ;
 *     pour une ligne IMPORTÉE (paye d'un fichier, sans partie), celui du compte RAPPROCHÉ de son libellé (`statutDuLibelle`, fourni par
 *     le serveur : rattachement manuel, nom complet, ou prénom d'un seul compte) ; sinon null (« à renseigner ») ;
 *   · la CLASSE : indépendant → DÉDUIT ; associé, salarié → INTERNE (affiché, non déduit) ; inconnu → À RENSEIGNER (affiché, non déduit).
 */
export type StatutDuLibelle = (libelle: string) => Statut | null;

/** Le statut qui compte pour une partie : celui FIGÉ à l'enregistrement ; à défaut, l'actuel de son compte ; sinon null (à renseigner). PUR. */
export const statutDePartie = (p: Pick<Partie, 'statut' | 'statutCompte'>): Statut | null => p.statut ?? p.statutCompte ?? null;

/** Le statut du négociateur d'une ligne d'après SA partie sur cette vente (le côté d'abord) ; sans répartition ou sans partie : null. PUR. */
export function statutDeLigne(v: Pick<Vente, 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote'>): Statut | null {
  if (v.repartition == null) return null;
  const sortes = l.cote === 'entree' ? ['entree', 'entree_sortie'] : l.cote === 'sortie' ? ['sortie', 'entree_sortie'] : ['entree', 'sortie', 'entree_sortie'];
  const p = v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.compteId !== null && sortes.includes(x.sorte))
    ?? v.repartition.parties.find((x) => x.negociateur === l.negociateur && x.compteId !== null);
  return p === undefined ? null : statutDePartie(p);
}

/**
 * 🔴 Le statut d'une commission de négociateur : celui recopié sur la ligne (LOT R : commission d'une ligne miroir, figé sur la vente
 * d'origine) ; sinon sa partie (figé, puis compte) ; sinon le compte rapproché de son libellé. PUR.
 */
export const statutDeCommission = (v: Pick<Vente, 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote' | 'statut'>, statutDuLibelle?: StatutDuLibelle): Statut | null =>
  l.statut ?? statutDeLigne(v, l) ?? statutDuLibelle?.(l.negociateur) ?? null;

/** 🔴 La classe d'une commission de négociateur (déduite, interne, à renseigner). PUR. */
export const classeDeCommission = (v: Pick<Vente, 'repartition'>, l: Pick<LigneVente, 'negociateur' | 'cote' | 'statut'>, statutDuLibelle?: StatutDuLibelle): ClasseCommission =>
  classeCommission(statutDeCommission(v, l, statutDuLibelle));

/** Le résolveur d'une table « libellé → statut » envoyée par le serveur (absente : aucun libellé importé n'est rapproché). PUR. */
export const resolveurDe = (table: Readonly<Record<string, Statut | null>> | null | undefined): StatutDuLibelle | undefined =>
  (table == null ? undefined : (libelle) => table[libelle] ?? null);
