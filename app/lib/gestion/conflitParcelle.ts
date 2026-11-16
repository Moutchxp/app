import { adresseImmeuble, cleImmeuble, nomAvecVille } from './syndics';

/**
 * 🔴🔴 LE CONFLIT DE PARCELLE — la partie PURE de la règle commune aux deux fiches (Arno, 16/11/2026) : ce qu'est un conflit, ce qui est
 * confirmé, la question posée à l'écran et le motif du refus. Le calcul en base et la note sont dans `conflitParcelleRepo.ts`.
 */

/** Une adresse de la même parcelle : libre (« Rattacher »), déjà de cette copropriété, ou prise par une autre (avec son syndic). */
export interface PropositionParcelle { libelle: string; codePostal: string; commune: string; parcelle: string; etat: 'libre' | 'prise';
  copropriete: string | null; syndic: { id: number; nom: string; ville: string | null } | null }

/** Un conflit à confirmer : la copropriété qui reçoit le syndic (`immeuble`, son libellé) et l'adresse de la parcelle prise par un autre syndic. */
export interface ConflitAConfirmer extends PropositionParcelle { immeuble: string }

/** Une confirmation reçue de l'écran : la copropriété (facultative côté fiche copropriété : c'est elle) et l'autre adresse. */
export interface ConflitConfirme { immeuble?: string; autre: string }

/** Ceux qui n'ont PAS été confirmés à l'écran. PUR. */
export function conflitsNonConfirmes(conflits: readonly ConflitAConfirmer[], confirmes: readonly ConflitConfirme[]): ConflitAConfirmer[] {
  return conflits.filter((k) => !confirmes.some((c) => cleImmeuble(c.autre) === cleImmeuble(k.libelle)
    && (c.immeuble === undefined || cleImmeuble(c.immeuble) === cleImmeuble(k.immeuble))));
}

/** La question posée à l'écran (la même dans les deux fiches). PUR. */
export function questionConflitParcelle(conflits: readonly PropositionParcelle[]): string {
  return `Sur la même parcelle, ${conflits.map((k) => `${adresseImmeuble(k.libelle, k.codePostal, k.commune)} (${k.copropriete}) est gérée par ${nomAvecVille(k.syndic!.nom, k.syndic!.ville)}`).join(' ; ')}.`
    + ' Confirmez-vous un autre syndic pour cette copropriété ?';
}

/** Le motif du refus du serveur, sans la confirmation. PUR. */
export function motifConflitParcelle(conflits: readonly ConflitAConfirmer[]): string {
  const copros = [...new Set(conflits.map((k) => k.immeuble))];
  return `Conflit de parcelle non confirmé pour ${copros.map((c) => `« ${c} »`).join(', ')} : sur la même parcelle, `
    + `${conflits.map((k) => `${adresseImmeuble(k.libelle, k.codePostal, k.commune)} (${k.copropriete}) est gérée par ${nomAvecVille(k.syndic!.nom, k.syndic!.ville)}`).join(' ; ')}. `
    + 'Confirmez un autre syndic pour cette copropriété : rien n’est enregistré sans cette confirmation.';
}

