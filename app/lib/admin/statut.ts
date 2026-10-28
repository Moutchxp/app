/**
 * ══ 🔴 LOT P (Arno, 28/10/2026) — LE STATUT DE CHAQUE PERSONNE (PUR) ═══════════════════════════════════════════════════════════
 * « Associé », « Salarié », « Indépendant », « Observateur » — distinct de la société (Transaction, 434 / 438) et des droits de tuiles.
 *   · OBSERVATEUR = lecture seule absolue : il voit les tuiles qu'on lui a ouvertes, il ne modifie rien (proxy : 403 sur toute écriture
 *     de l'admin) et il n'est jamais négociateur ;
 *   · le cumul « Commissions versées » de la Transaction ne déduit que les INDÉPENDANTS (et les apporteurs) ; les commissions des
 *     ASSOCIÉS et des SALARIÉS sont des « internes », visibles, non déduites ; un statut inconnu (« à renseigner ») n'est pas déduit.
 * Aucun nom en dur : la règle suit le statut.
 */
export type Statut = 'associe' | 'salarie' | 'independant' | 'observateur';
export const STATUTS_PERSONNE: readonly Statut[] = ['associe', 'salarie', 'independant', 'observateur'];
export const LIBELLE_STATUT_PERSONNE: Record<Statut, string> = { associe: 'Associé', salarie: 'Salarié', independant: 'Indépendant', observateur: 'Observateur' };
export const estStatut = (x: unknown): x is Statut => x === 'associe' || x === 'salarie' || x === 'independant' || x === 'observateur';
export const A_RENSEIGNER_STATUT = 'à renseigner';
export const MENTION_LECTURE_SEULE = 'lecture seule (observateur)';
export const MOTIF_LECTURE_SEULE = 'Lecture seule (observateur) : aucune modification n’est possible avec ce compte. Rien n’a été enregistré.';

/** Le libellé d'un statut, ou « à renseigner ». PUR. */
export const libelleStatut = (s: Statut | null | undefined): string => (s == null ? A_RENSEIGNER_STATUT : LIBELLE_STATUT_PERSONNE[s]);

/** Où va une commission de négociateur, selon son statut : déduite (indépendant), interne (associé, salarié), à renseigner. PUR. */
export type ClasseCommission = 'independant' | 'interne' | 'a_renseigner';
export function classeCommission(s: Statut | null | undefined): ClasseCommission {
  if (s === 'independant') return 'independant';
  if (s === 'associe' || s === 'salarie') return 'interne';
  return 'a_renseigner';
}

/** Lu en base (texte libre ou NULL) → un statut connu, ou null. PUR. */
export const statutLu = (x: unknown): Statut | null => (estStatut(x) ? x : null);
