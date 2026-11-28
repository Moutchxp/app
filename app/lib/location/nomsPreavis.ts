/**
 * ══ 🔴🔴 Arno (28/11/2026, 09h56) — LA LIGNE DES LOCATAIRES D'UN PRÉAVIS (ligne repliée de « Locataires en préavis ») ══════════════════════════════
 * « une ligne qui contient tous les locataires avec NOM et Prénom séparés par un "/", ex. "DURANT Stéphane / BERCIER Caroline / JOREL Arnaud" ».
 * Seulement les cartes de LOCATAIRES du préavis (une occupation = un locataire ; jamais un garant ni un contact du locataire), dans l'ordre des
 * cartes ; chacune au format « NOM Prénom » de `nomContactAffiche` (e7334caf) : une fiche sans prénom séparé (société, nom non séparé) s'écrit
 * TELLE QU'ELLE EST ENREGISTRÉE. PUR, sans `pg`.
 */
import { nomContactAffiche } from './vingtPourcent';

export const SEPARATEUR_LOCATAIRES = ' / ';

/** « NOM Prénom » d'une carte de locataire (`nom` = le nom de famille quand la fiche a un prénom séparé). PUR. */
export function nomLocataireAffiche(x: { nom: string; prenom?: string | null }): string {
  return nomContactAffiche({ nom: x.nom, prenom: x.prenom ?? null, nomSepare: x.nom });
}

/** Tous les locataires du préavis, dans l'ordre des cartes, séparés par « / ». PUR. */
export function ligneDesLocataires(locataires: readonly { nom: string; prenom?: string | null }[]): string {
  return locataires.map(nomLocataireAffiche).join(SEPARATEUR_LOCATAIRES);
}
