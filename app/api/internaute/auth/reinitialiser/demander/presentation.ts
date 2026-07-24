/**
 * Texte user-facing de la route de DEMANDE de réinitialisation. Externalisé ici (pur, testable) pour être RÉUTILISÉ
 * tel quel par l'UI du commit suivant, et pour garantir une réponse STRICTEMENT identique dans tous les cas.
 */

/**
 * RÉPONSE GÉNÉRIQUE UNIFORME — servie à l'IDENTIQUE que l'e-mail ait un compte ou non, que le throttle bloque ou non,
 * que le corps soit valide ou non. Ne confirme JAMAIS l'existence d'un compte (anti-énumération).
 */
export const MESSAGE_REINITIALISATION =
  'Si un compte est associé à cette adresse, un e-mail de réinitialisation vient d’être envoyé.';
