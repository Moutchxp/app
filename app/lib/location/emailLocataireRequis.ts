/**
 * ══ 🔴🔴 RÈGLE BLOQUANTE — UN RENDEZ-VOUS DEMANDE L'E-MAIL D'AU MOINS UN LOCATAIRE (Arno, 11/11/2026). MODULE PUR. ══════════════════════════
 *
 * Il est IMPOSSIBLE de valider un rendez-vous de PRÉ-VISITE ou d'ÉTAT DES LIEUX DE SORTIE — création, déplacement, réaffectation — si aucun
 * locataire du préavis n'a d'adresse e-mail. À l'écran (saisie et récapitulatif) : le message rouge, un lien « compléter la fiche de … » par
 * locataire sans e-mail, les boutons inactifs ; au serveur : le même refus, AVANT toute écriture (ni rendez-vous, ni tâche, ni mail).
 * Au moins un locataire avec un e-mail : la validation est possible, les autres restent signalés (« ne recevra pas ce mail »).
 * Ne s'applique PAS au mail « Refus / absence de pré-visite », ni au compte rendu de sortie.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export const MOTIF_AUCUN_EMAIL_LOCATAIRE =
  'Impossible de valider : aucun locataire n’a d’adresse e-mail. Ajoutez l’e-mail d’au moins un locataire avant de fixer le rendez-vous.';

const FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Une adresse e-mail utilisable parmi celles-ci ? PUR. */
export const aUnEmail = (emails: readonly (string | null | undefined)[]): boolean => emails.some((e) => FORMAT.test((e ?? '').trim()));

/** Aucun des locataires n'a d'e-mail (aucun locataire du tout compte comme « aucun ») : le rendez-vous est bloqué. PUR. */
export function rendezVousBloque(locataires: readonly { emails: readonly (string | null | undefined)[] }[]): boolean {
  return !locataires.some((l) => aUnEmail(l.emails));
}
