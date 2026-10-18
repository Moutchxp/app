/**
 * ══ 🔴🔴 LA CARTE COMPLÈTE ET SA FAMILLE (Arno, 18/10/2026 — Location ET fiche commune de la Gestion). MODULE PUR. ═══════
 *
 * « Carte COMPLÈTE = nom + au moins un téléphone + au moins un e-mail (adresse facultative). Famille = les cartes CLIENT
 * d'un même dossier : les propriétaires d'une fiche propriétaire / d'un bien, ou les locataires d'une location. Les
 * cartes “contact du propriétaire / du locataire” ne comptent pas.
 *   1. La PREMIÈRE carte client d'une création : téléphone ET e-mail obligatoires.
 *   2. Les cartes SUIVANTES (clients et contacts) : s'il manque le téléphone et/ou l'e-mail, une fenêtre d'alerte énumère
 *      les manques — « Revenir modifier la carte » / « Enregistrer quand même ».
 *   3. INVARIANT : chaque famille garde toujours au moins UNE carte client complète ; une suppression ou une modification
 *      qui la ferait tomber à zéro est refusée (écran ET serveur), avec une fenêtre qui explique quoi faire.
 *   4. Les fiches existantes SANS carte complète (imports WIPPIMMO) ne sont jamais bloquées : un bandeau rouge le dit. »
 *
 * Ce module ne lit rien : l'écran (cartes de la Gestion, saisie de la Location) et le serveur (`familleCarteRepo`)
 * l'appliquent tous deux — une seule écriture de la règle.
 */

export interface CoordonneeMin { sorte: string; valeur: string }
export interface CarteMin { nom: string | null | undefined; coordonnees: readonly CoordonneeMin[] }

const rempli = (v: string | null | undefined): boolean => (v ?? '').trim() !== '';

export const MANQUE_NOM = 'Nom manquant';
export const MANQUE_TELEPHONE = 'Téléphone manquant';
export const MANQUE_EMAIL = 'E-mail manquant';

/** Ce qui manque à une carte pour être COMPLÈTE (nom, un téléphone, un e-mail). Vide = complète. */
export function manquesDeCompletude(c: CarteMin): string[] {
  const m: string[] = [];
  if (!rempli(c.nom)) m.push(MANQUE_NOM);
  if (!c.coordonnees.some((k) => k.sorte === 'telephone' && rempli(k.valeur))) m.push(MANQUE_TELEPHONE);
  if (!c.coordonnees.some((k) => k.sorte === 'email' && rempli(k.valeur))) m.push(MANQUE_EMAIL);
  return m;
}

export function carteEstComplete(c: CarteMin): boolean {
  return manquesDeCompletude(c).length === 0;
}

/** Les manques qui déclenchent la FENÊTRE D'ALERTE (règle 2) : le téléphone et l'e-mail seulement (le nom est bloquant). */
export function manquesAAvertir(c: CarteMin): string[] {
  return manquesDeCompletude(c).filter((m) => m !== MANQUE_NOM);
}

export const MOTIF_DERNIERE_COMPLETE_SUPPRESSION =
  'Cette carte est la dernière carte complète (nom, téléphone et e-mail) de ce dossier : elle ne peut pas être supprimée ni archivée. '
  + 'Complétez d’abord une autre carte (téléphone et e-mail), ou ajoutez-en une complète, puis recommencez.';
export const MOTIF_DERNIERE_COMPLETE_MODIFICATION =
  'Cette carte est la dernière carte complète (nom, téléphone et e-mail) de ce dossier : son téléphone et son e-mail ne peuvent pas être retirés. '
  + 'Complétez d’abord une autre carte (téléphone et e-mail), ou ajoutez-en une complète, puis recommencez.';
export const MOTIF_PREMIERE_CARTE =
  'La première carte client doit être complète : le nom, un téléphone ET un e-mail.';

export type Geste = 'suppression' | 'modification';

/**
 * LE VERDICT DE LA FAMILLE (règle 3) : `membres` = les cartes client ACTIVES du dossier, avec leur complétude AVANT le
 * geste ; `id` = la carte touchée ; `apres` = sa complétude APRÈS (`null` = elle quitte la famille). Refus seulement si la
 * famille AVAIT une carte complète et n'en aurait plus aucune — une fiche ancienne sans carte complète n'est jamais bloquée.
 */
export function verdictFamille(
  membres: readonly { id: number; complete: boolean }[], id: number, apres: boolean | null, geste: Geste,
): string | null {
  const avant = membres.filter((m) => m.complete).length;
  if (avant === 0) return null;
  const restantes = membres.filter((m) => m.id !== id && m.complete).length + (apres === true ? 1 : 0);
  if (restantes > 0) return null;
  return geste === 'suppression' ? MOTIF_DERNIERE_COMPLETE_SUPPRESSION : MOTIF_DERNIERE_COMPLETE_MODIFICATION;
}

/** Le titre du bandeau rouge (règle 4). */
export function titreSansCarteComplete(role: 'propriétaire' | 'locataire'): string {
  return `Aucune carte complète pour ce ${role}`;
}

/** « M. MARTIN Paul : téléphone manquant, e-mail manquant » — une ligne par carte du bandeau. */
export function ligneDeManques(nom: string, manques: readonly string[]): string {
  return `${nom} : ${manques.map((m, i) => (i === 0 ? m : m.charAt(0).toLowerCase() + m.slice(1))).join(', ')}`;
}
