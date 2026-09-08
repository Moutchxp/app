/**
 * Messages de la GRILLE de tuiles réordonnable (dette « mensonge d'interface » soldée). L'ordre des tuiles est enregistré
 * PAR COMPTE (`admin_utilisateur.ordre_modules`) : la VOIE DE SECOURS (mot de passe partagé, `sub=null`) n'a pas de compte,
 * donc elle affiche l'ordre PAR DÉFAUT (rien n'est perdu) et ne peut pas ranger. On DIT ce motif au lieu de laisser croire à
 * une panne de données. Module PUR (aucun React) → directement testable ; importé par le composant client `GrilleModules`.
 */

/** Contexte affiché AU-DESSUS de la grille en voie de secours (AVANT toute tentative) : explique l'ordre par défaut + la marche à suivre. */
export const MSG_SECOURS_GRILLE =
  'Vous êtes en accès de secours. L’ordre des tuiles est enregistré compte par compte : ici s’affiche l’ordre par défaut (votre rangement n’est pas perdu). Pour le retrouver et le modifier, reconnectez-vous avec votre compte nommé.';

/** Échec d'enregistrement — motif « voie de secours » (HTTP 400 de la route self-service). Jamais « panne de données ». */
export const MSG_REORG_SECOURS =
  'La réorganisation n’est pas disponible en accès de secours. Reconnectez-vous avec votre compte nommé pour ranger vos tuiles.';
/** Échec — session expirée (HTTP 401) : pas une perte de données, une reconnexion à faire. */
export const MSG_REORG_SESSION = 'Session expirée, reconnectez-vous.';
/** Échec générique (autre statut HTTP ou coupure réseau) : l'ordre précédent a été rétabli. */
export const MSG_REORG_ECHEC = 'Réorganisation non enregistrée — l’ordre précédent a été rétabli.';

/**
 * Sélectionne le message d'échec HONNÊTE selon le statut HTTP renvoyé par `POST /api/admin/compte/ordre-modules`.
 * 400 = voie de secours (pas de compte à personnaliser) ; 401 = session expirée ; tout le reste (500, 403, ou `0` = coupure
 * réseau où `fetch` a jeté) = échec générique. On ne présente JAMAIS un refus d'entitlement/session comme une panne de données.
 */
export function messageEchecReorg(status: number): string {
  if (status === 400) return MSG_REORG_SECOURS;
  if (status === 401) return MSG_REORG_SESSION;
  return MSG_REORG_ECHEC;
}
