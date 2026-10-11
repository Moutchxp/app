import type { GroupeSuggestions, TonSuggestion } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — LA FAMILLE D'UNE ADRESSE, POUR COLORER SA PUCE. PUR. ══════════
 *
 * ARNO : une adresse ajoutée dans À, Cc ou Cci (par la liste, par la saisie, ou pré-remplie) prend le fond teinté de sa
 * famille — la MÊME couleur que dans les suggestions (lot d614d843) : propriétaire rouge, locataire vert, ancien
 * locataire violet, immeuble rose (syndic, gardien, conseil syndical, habitants), autres parties connues gris.
 * E-mail PROPRE de la partie : fond teinté plein ; e-mail RATTACHÉ : fond plus pâle et contour de la même couleur.
 * Adresse INCONNUE de notre système : fond neutre, contour gris en pointillé. Seul le FOND est teinté, jamais le texte.
 *
 * La couleur vient de l'ADRESSE, quel que soit le chemin d'ajout. Une adresse connue sous plusieurs familles prend celle
 * qui est la plus proche du bien ouvert (l'ordre des groupes de la fiche bien), sinon la première trouvée.
 */
export interface FamilleAdresse {
  ton: TonSuggestion;
  /** `true` = l'e-mail propre de la partie ; `false` = un e-mail rattaché à sa partie. */
  propre: boolean;
  nom: string | null;
  /** Le rôle en clair, pour l'info-bulle : « Propriétaire », « Gestionnaire · TEST ARNAUD », « Gardien »… */
  role: string;
  /**
   * LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — client lié à PLUSIEURS biens, aucun encore choisi : contour plein
   * de sa couleur sur fond blanc, et l'info-bulle invite à choisir (`nbBiens`). Absent ⇒ l'aspect ordinaire.
   */
  aChoisir?: boolean;
  nbBiens?: number;
}

/** Ce que l'écran sait d'une adresse : sa famille, `null` = inconnue de notre système, absente = pas encore lue. */
export type FamillesConnues = Record<string, FamilleAdresse | null>;

export const cleAdresse = (a: string): string => a.trim().toLowerCase();

/** Les familles que la liste du bien porte déjà : la première ligne d'une adresse l'emporte (ordre des groupes). PUR. */
export function famillesDesSuggestions(groupes: readonly GroupeSuggestions[] | null | undefined): Record<string, FamilleAdresse> {
  const out: Record<string, FamilleAdresse> = {};
  for (const g of groupes ?? []) {
    for (const l of g.lignes) {
      const k = cleAdresse(l.adresse);
      if (k === '' || out[k] !== undefined) continue;
      out[k] = { ton: l.ton, propre: l.propre, nom: l.nom, role: l.role };
    }
  }
  return out;
}

/**
 * Les classes de la puce. Rien tant que l'adresse n'a pas été lue (la puce reste celle d'avant : jamais un faux
 * « inconnue » le temps d'une lecture) ; `--inconnue` quand notre système ne la connaît pas. PUR.
 */
export function classesPuce(f: FamilleAdresse | null | undefined): string {
  if (f === undefined) return '';
  if (f === null) return ' red-pastille--inconnue';
  if (f.aChoisir === true) return ` red-pastille--famille red-pastille--${f.ton} red-pastille--a-choisir`;
  return ` red-pastille--famille red-pastille--${f.ton}${f.propre ? '' : ' red-pastille--rattache'}`;
}

/** L'info-bulle : le nom et le rôle quand on les connaît, puis l'adresse ; « adresse extérieure » sinon. PUR. */
export function infobullePuce(adresse: string, f: FamilleAdresse | null | undefined): string {
  if (f === undefined) return adresse;
  if (f === null) return `${adresse} — adresse extérieure, inconnue de notre système`;
  const qui = [f.nom ?? '', f.role].filter((x) => x.trim() !== '').join(' · ');
  /* LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — « ci-dessous » désignait la ligne « Rattacher ce mail à : »,
     retirée (lot RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE) : le choix se fait par le bouton « Rattacher ». */
  if (f.aChoisir === true) {
    const n = f.nbBiens ?? 2;
    return `${qui} — lié à ${n} bien${n > 1 ? 's' : ''}, aucun rattaché — choisissez avec « Rattacher » — ${adresse}`;
  }
  return `${qui}${f.propre ? '' : ' (e-mail rattaché)'} — ${adresse}`;
}
