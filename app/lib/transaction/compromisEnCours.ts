import { concerne, type Societe, type Vente } from './modele';
import { detailCa } from './detailCommissions';
import type { StatutDuLibelle } from './statutLigne';

/**
 * ══ 🔴 LOT CY (Arno, 31/10/2026) — « COMPROMIS EN COURS » : UNE SEULE RÈGLE, UNE SEULE FONCTION (PUR) ════════════════════════════════════════
 * Tous les compromis non actés et non annulés (statut « compromis ») de la société, quels que soient leur mois ou leur année, dates absentes
 * comprises, avec la règle d'inter-cabinet de l'onglet « Compromis » : ceux qu'elle porte ou où elle a une part, et ses lignes miroir (la part reçue
 * d'une autre société) ; nos deux sociétés (`vue` null) : chaque affaire une fois. Le CA = celui de la tuile « Chiffre d'affaires » de l'onglet
 * (`detailCa` : la somme des cartes, au centime, HT et TTC). L'onglet « Compromis » (sa liste « En cours »), « Le mois », « L'année » et le CA
 * global l'appellent tous : le chiffre est le même partout.
 * (Avant : « Le mois » et « L'année » ne comptaient que les compromis rattachés à l'année choisie — l'année 2027 d'un acte prévu en 2027, ou
 * l'année d'un import ancien sans date de compromis, en sortaient.)
 */
export const pourLaVue = (v: Pick<Vente, 'societe' | 'double' | 'repartition' | 'honorairesTtc' | 'miroir'>, vue: Societe | null): boolean =>
  (vue === null ? concerne(v, 'criterimmo') || concerne(v, 'macj') || v.repartition != null : v.miroir != null || concerne(v, vue));

/** Les compromis en cours de la vue (une société, ou nos deux sociétés). */
export const compromisEnCours = <V extends Vente>(ventes: readonly V[], vue: Societe | null): V[] =>
  ventes.filter((v) => v.statut === 'compromis' && pourLaVue(v, vue));

export interface TotalCompromisEnCours { nb: number; htC: number; ttcC: number; ids: number[] }
/** Le nombre et le CA (centimes, HT et TTC) des compromis en cours de la vue. */
export function totalCompromisEnCours(ventes: readonly Vente[], vue: Societe | null, statutDuLibelle?: StatutDuLibelle): TotalCompromisEnCours {
  const liste = compromisEnCours(ventes, vue);
  const ca = detailCa(liste, vue, statutDuLibelle);
  return { nb: liste.length, htC: ca.totalHtC, ttcC: ca.totalTtcC, ids: liste.map((v) => v.id) };
}
