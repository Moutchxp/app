import { CHARGES_COPRO, LIBELLE_CHARGES_COPRO, type ChargesCopro } from './bienComplet';

/**
 * ══ 🔴 Arno (25/10/2026) — « PAIEMENT DES CHARGES » PRÉSÉLECTIONNÉ DEPUIS LE BIEN (PUR) ══════════════════════════════════════════════
 * Une seule donnée : `gestion_annuaire_lot.charges_copro`. « Nouveau locataire » et le Dossier de location PRÉSÉLECTIONNENT le bouton
 * de la fiche du bien (le champ compte alors comme rempli) :
 *   · les lots loués portent la même valeur (un lot sans valeur ne contredit rien) → elle est présélectionnée ;
 *   · aucun lot n'en porte → aucun choix, le champ reste obligatoire ;
 *   · des lots portent des valeurs DIFFÉRENTES → aucune présélection, « valeurs différentes selon les lots ».
 * Un choix fait À LA MAIN est gardé quand le bien (ou sa fiche) change, et signalé s'il diffère de la fiche du bien.
 */
export type ChargesDesLots = { sorte: 'valeur'; valeur: ChargesCopro } | { sorte: 'aucune' } | { sorte: 'divergentes' };

/** Les ordres des boutons, identiques dans « Nouveau locataire », le Dossier de location et la page bien : Agence, puis Propriétaire. */
export const ORDRE_BOUTONS_CHARGES = ['agence', 'proprietaire'] as const satisfies readonly ChargesCopro[];

export const MOTIF_CHARGES_DIVERGENTES = 'Valeurs différentes selon les lots : aucune présélection, choisissez.';

const connue = (v: unknown): v is ChargesCopro => (CHARGES_COPRO as readonly unknown[]).includes(v);

/** La valeur de la fiche du bien, d'après les valeurs de ses lots loués. */
export function chargesDesLots(valeurs: readonly unknown[]): ChargesDesLots {
  const distinctes = [...new Set(valeurs.filter(connue))];
  if (distinctes.length === 0) return { sorte: 'aucune' };
  return distinctes.length === 1 ? { sorte: 'valeur', valeur: distinctes[0] } : { sorte: 'divergentes' };
}

/** Ce que devient le choix quand la fiche du bien est (re)lue : un choix à la main est gardé ; sinon la présélection suit la fiche. */
export function choixSelonFiche(choix: ChargesCopro | null, manuel: boolean, fiche: ChargesDesLots): ChargesCopro | null {
  if (manuel) return choix;
  return fiche.sorte === 'valeur' ? fiche.valeur : null;
}

/** La phrase sous les boutons : les lots divergents, ou un choix différent de la fiche du bien ; `null` : rien à dire. */
export function signalCharges(choix: ChargesCopro | null | undefined, fiche: ChargesDesLots): string | null {
  if (fiche.sorte === 'divergentes') return MOTIF_CHARGES_DIVERGENTES;
  if (fiche.sorte === 'valeur' && connue(choix) && choix !== fiche.valeur) {
    return `Différent de la fiche du bien (${LIBELLE_CHARGES_COPRO[fiche.valeur]}) : la fiche sera mise à jour à l’enregistrement.`;
  }
  return null;
}
