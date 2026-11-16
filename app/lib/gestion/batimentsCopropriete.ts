/**
 * ══ 🔴🔴 LES BÂTIMENTS D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 3). MODULE PUR. ══════════════════════════════
 *
 * Une nomenclature COMMUNE à toute la copropriété et à toutes ses adresses : le premier bâtiment créé en LETTRE impose les lettres (A, B, C…),
 * le premier en CHIFFRE impose les chiffres (1, 2, 3…) ; le mélange est refusé avec un message clair. Les intitulés LIBRES (« Côté cour »,
 * « Côté rue »…) sont permis en plus, ne fixent pas la règle, et sont proposés dans le menu. « Bât. B » = « B » = « bâtiment b ».
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { cleBatiment, libelleBatiment } from '../location/digicodeImmeuble';

export type SorteBatiment = 'lettre' | 'chiffre' | 'libre';
export type Nomenclature = 'lettres' | 'chiffres';
export interface BatimentConnu { cle: string; libelle: string; sorte: SorteBatiment }

/** La sorte d'un intitulé : une lettre seule, un nombre seul, ou un intitulé libre. PUR. */
export function sorteBatiment(brut: string | null | undefined): SorteBatiment | null {
  const k = cleBatiment(brut);
  if (k === '') return null;
  if (/^[a-z]$/.test(k)) return 'lettre';
  if (/^\d{1,3}$/.test(k)) return 'chiffre';
  return 'libre';
}

/** Un bâtiment propre (clé, libellé affiché, sorte), ou `null` (vide). PUR. */
export function batimentDe(brut: string | null | undefined): BatimentConnu | null {
  const sorte = sorteBatiment(brut);
  const libelle = libelleBatiment(brut);
  return sorte === null || libelle === null ? null : { cle: cleBatiment(brut), libelle, sorte };
}

/**
 * La règle de la copropriété : celle qui est enregistrée ; à défaut, celle des bâtiments déjà connus s'ils sont tous lettres ou tous chiffres
 * (des bâtiments anciens mélangés ne fixent rien). PUR.
 */
export function nomenclatureDe(enregistree: Nomenclature | null, connus: readonly Pick<BatimentConnu, 'sorte'>[]): Nomenclature | null {
  if (enregistree !== null) return enregistree;
  const l = connus.some((b) => b.sorte === 'lettre');
  const c = connus.some((b) => b.sorte === 'chiffre');
  return l && !c ? 'lettres' : c && !l ? 'chiffres' : null;
}

export const MOTIF_LETTRES = 'Cette copropriété nomme ses bâtiments par des LETTRES (A, B, C…) : utilisez une lettre, ou un intitulé libre (« Côté cour »).';
export const MOTIF_CHIFFRES = 'Cette copropriété numérote ses bâtiments par des CHIFFRES (1, 2, 3…) : utilisez un chiffre, ou un intitulé libre (« Côté cour »).';
/** Le refus d'un bâtiment (`null` : permis) au regard de la règle de la copropriété. Un bâtiment DÉJÀ connu est toujours permis. PUR. */
export function refusBatiment(brut: string, nomenclature: Nomenclature | null, connus: readonly Pick<BatimentConnu, 'cle'>[] = []): string | null {
  const b = batimentDe(brut);
  if (b === null) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
  if (connus.some((x) => x.cle === b.cle)) return null;
  if (b.sorte === 'lettre' && nomenclature === 'chiffres') return MOTIF_CHIFFRES;
  if (b.sorte === 'chiffre' && nomenclature === 'lettres') return MOTIF_LETTRES;
  return null;
}
/** Plusieurs nouveaux bâtiments saisis ensemble : le premier en lettre ou en chiffre fixe la règle pour les suivants. PUR. */
export function refusDesBatiments(bruts: readonly string[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): string | null {
  let regle = nomenclature;
  const vus = [...connus];
  for (const brut of bruts) {
    const r = refusBatiment(brut, regle, vus);
    if (r !== null) return r;
    const b = batimentDe(brut) as BatimentConnu;
    if (regle === null && b.sorte !== 'libre') regle = b.sorte === 'lettre' ? 'lettres' : 'chiffres';
    if (!vus.some((x) => x.cle === b.cle)) vus.push(b);
  }
  return null;
}

/** Le menu sous le champ du bâtiment : lettres et chiffres dans l'ordre, puis les intitulés libres ; sans doublon. PUR. */
export function menuBatiments(connus: readonly BatimentConnu[]): BatimentConnu[] {
  const uniques = [...new Map(connus.map((b) => [b.cle, b])).values()];
  const rang = (b: BatimentConnu): number => (b.sorte === 'libre' ? 1 : 0);
  return uniques.sort((a, b) => rang(a) - rang(b) || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true, sensitivity: 'base' }));
}
