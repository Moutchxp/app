/**
 * Messages user-facing de la route de CONFIRMATION de réinitialisation. Externalisés (purs, testables) pour être
 * réutilisés par l'UI du commit suivant et garantir des libellés stables.
 *
 * Distinction VOULUE (contrairement à la route de DEMANDE, uniforme par anti-énumération) : ici l'internaute DÉTIENT
 * déjà un lien valide → une erreur de VALIDATION peut être EXPLICITE (il doit pouvoir corriger). Seul l'état du JETON
 * reste GÉNÉRIQUE (« invalide ou expiré », sans dire lequel des trois).
 */

/** Corps de requête mal formé (JSON invalide, champs absents). */
export const MSG_REQUETE_INVALIDE = 'Requête invalide.';
/** Les deux mots de passe saisis ne coïncident pas (confirmation vérifiée aussi côté serveur). */
export const MSG_CONFIRMATION_DIVERGE = 'Les deux mots de passe ne correspondent pas.';
/** Jeton invalide / expiré / déjà consommé — GÉNÉRIQUE (ne précise pas lequel). */
export const MSG_LIEN_INVALIDE = 'Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.';
/** Défaillance interne (base indisponible…) — sans détail technique. */
export const MSG_ERREUR = 'Une erreur est survenue. Réessayez dans un instant.';
