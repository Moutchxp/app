import type { VenteMonEspace } from './mesAffaires';
export { peutBattre } from '../gestion/rafraichir';

/**
 * ══ 🔴 MON ESPACE, LOT 7 (Arno, 02/11/2026) — LE RAFRAÎCHISSEMENT AUTOMATIQUE DE « MON ESPACE » (PUR) ═══════════════════════════════════════════
 * Le mécanisme éprouvé de la Gestion (`app/lib/gestion/rafraichir.ts`) : une petite empreinte relue à intervalle et au retour sur l'onglet ;
 * les listes ne se rechargent que si elle a changé, et JAMAIS pendant un geste (saisie, confirmation ouverte : `peutBattre`, repris tel quel).
 * L'empreinte de « Mon espace » = les affaires visibles et leur version (le dernier n° de leur journal). Un changement fait par un AUTRE
 * collaborateur se dit (« Léa a mis à jour « DUPONT / MARTIN » ») et sa ligne s'éclaire brièvement.
 */
export const PERIODE_MON_ESPACE_MS = 15_000;
/** La durée de l'éclairage d'une ligne mise à jour par un collègue. */
export const DUREE_SURBRILLANCE_MS = 4_000;

/** Faut-il relire les listes ? Première mesure : non (rien à comparer). PUR. */
export const doitRelire = (avant: string | null, apres: string): boolean => avant !== null && avant !== apres;

export interface MiseAJour { id: number; libelle: string; qui: string }

/** Les affaires mises à jour (ou apparues) depuis la lecture d'avant, par un AUTRE que moi. PUR. */
export function misesAJourDesAutres(avant: readonly VenteMonEspace[], apres: readonly VenteMonEspace[], moiId: number): MiseAJour[] {
  const anciennes = new Map(avant.map((v) => [v.id, v.version ?? 0]));
  return apres.filter((v) => (v.version ?? 0) > (anciennes.get(v.id) ?? -1) && v.derniereModification != null && v.derniereModification.auteurId !== moiId)
    .map((v) => ({ id: v.id, libelle: v.libelle, qui: v.derniereModification!.prenom ?? v.derniereModification!.libelle }));
}

/** Le message discret : « Léa a mis à jour « X » » ; plusieurs : « Léa a mis à jour « X » et 2 autres affaires ». PUR. */
export function messageMiseAJour(m: readonly MiseAJour[]): string | null {
  if (m.length === 0) return null;
  const premier = `${m[0].qui} a mis à jour « ${m[0].libelle} »`;
  return m.length === 1 ? premier : `${premier} et ${m.length - 1} autre${m.length > 2 ? 's' : ''} affaire${m.length > 2 ? 's' : ''}`;
}
