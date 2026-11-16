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
export const MOTIF_TOUS_LIBRES = 'Les autres bâtiments de cette copropriété ont des intitulés personnalisés : confirmez cet intitulé en lettre ou en chiffre dans la fenêtre d’avertissement.';

/**
 * ══ 🔴🔴 Arno (16/11/2026, lot D) — LE MÉLANGE N'EST PLUS REFUSÉ, IL EST AVERTI ════════════════════════════════════════════════════════════════
 * On peut mettre le nom de bâtiment qu'on veut. Un NOUVEAU bâtiment en lettre ou en chiffre qui ne suit pas la numérotation en place (un chiffre
 * parmi des lettres, ou l'inverse), ou qui arrive alors que tous les autres ont des intitulés personnalisés, demande une CONFIRMATION (fenêtre
 * « Confirmer cet intitulé » / « Corriger ») ; un intitulé personnalisé, ou un nom qui suit la numérotation, n'en demande pas. La référence reste
 * celle déjà enregistrée (le premier bâtiment en lettre ou en chiffre) : une exception confirmée ne la change pas.
 */
export type RaisonAvertissement = 'autre_numerotation' | 'tous_libres';
export interface AvertissementBatiment { libelle: string; sorte: 'lettre' | 'chiffre'; raison: RaisonAvertissement; reference: Nomenclature | null; intitules: string[]; motif: string }

/** L'avertissement d'UN nouveau bâtiment (`null` : aucun). `reference` : la règle en place (enregistrée, ou fixée par le premier). PUR. */
export function avertissementBatiment(brut: string, reference: Nomenclature | null, connus: readonly BatimentConnu[]): AvertissementBatiment | null {
  const b = batimentDe(brut);
  if (b === null || b.sorte === 'libre' || connus.some((x) => x.cle === b.cle)) return null;
  const intitules = menuBatiments(connus).map((x) => x.libelle);
  if (reference !== null) {
    const suit = (reference === 'lettres' && b.sorte === 'lettre') || (reference === 'chiffres' && b.sorte === 'chiffre');
    return suit ? null : { libelle: b.libelle, sorte: b.sorte, raison: 'autre_numerotation', reference, intitules, motif: reference === 'lettres' ? MOTIF_LETTRES : MOTIF_CHIFFRES };
  }
  // aucune référence : les autres sont tous des intitulés personnalisés → on le dit ; rien du tout → le premier fixe la règle, sans fenêtre
  return connus.length > 0 && connus.every((x) => x.sorte === 'libre')
    ? { libelle: b.libelle, sorte: b.sorte, raison: 'tous_libres', reference: null, intitules, motif: MOTIF_TOUS_LIBRES } : null;
}

/**
 * Les nouveaux bâtiments d'une saisie, dans l'ordre : chacun avec son avertissement éventuel. Le PREMIER en lettre ou en chiffre fixe la
 * référence s'il n'y en avait pas (et s'il n'est pas lui-même une exception) ; une exception confirmée ne la change pas. PUR.
 */
export function avertissementsDesBatiments(bruts: readonly string[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): { libelle: string; avertissement: AvertissementBatiment | null }[] {
  let reference = nomenclature;
  const vus = [...connus];
  return bruts.map((brut) => {
    const avertissement = avertissementBatiment(brut, reference, vus);
    const b = batimentDe(brut);
    if (b !== null) {
      if (reference === null && avertissement === null && b.sorte !== 'libre') reference = b.sorte === 'lettre' ? 'lettres' : 'chiffres';
      if (!vus.some((x) => x.cle === b.cle)) vus.push(b);
    }
    return { libelle: brut, avertissement };
  });
}

/** Le refus du SERVEUR (`null` : permis) : un nom vide, ou un avertissement que l'écran n'a pas fait confirmer. PUR. */
export function refusDesBatiments(nouveaux: readonly { libelle: string; confirme?: boolean }[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): string | null {
  if (nouveaux.some((x) => batimentDe(x.libelle) === null)) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
  const av = avertissementsDesBatiments(nouveaux.map((x) => x.libelle), nomenclature, connus);
  const manque = av.find((x, i) => x.avertissement !== null && nouveaux[i].confirme !== true);
  return manque?.avertissement?.motif ?? null;
}

/** Le menu sous le champ du bâtiment : lettres et chiffres dans l'ordre, puis les intitulés libres ; sans doublon. PUR. */
export function menuBatiments(connus: readonly BatimentConnu[]): BatimentConnu[] {
  const uniques = [...new Map(connus.map((b) => [b.cle, b])).values()];
  const rang = (b: BatimentConnu): number => (b.sorte === 'libre' ? 1 : 0);
  return uniques.sort((a, b) => rang(a) - rang(b) || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true, sensitivity: 'base' }));
}
