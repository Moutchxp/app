/**
 * Messages de la GRILLE de tuiles réordonnable (dette « mensonge d'interface » soldée). L'ordre des tuiles est enregistré
 * PAR COMPTE (`admin_utilisateur.ordre_modules`) : la VOIE DE SECOURS (mot de passe partagé, `sub=null`) n'a pas de compte,
 * donc elle affiche l'ordre PAR DÉFAUT (rien n'est perdu) et ne peut pas ranger. On DIT ce motif au lieu de laisser croire à
 * une panne de données. Module PUR (aucun React) → directement testable ; importé par le composant client `GrilleModules`.
 */

// Les deux textes « accès de secours » (contexte au-dessus de la grille, échec 400) sont RETIRÉS : la voie de secours web
// n'existe plus (décision d'Arno du 15/10/2026, audit point A), ces textes étaient devenus inatteignables (accord d'Arno).
/** Échec — session expirée (HTTP 401) : pas une perte de données, une reconnexion à faire. */
export const MSG_REORG_SESSION = 'Session expirée, reconnectez-vous.';
/** Échec générique (autre statut HTTP ou coupure réseau) : l'ordre précédent a été rétabli. */
export const MSG_REORG_ECHEC = 'Réorganisation non enregistrée — l’ordre précédent a été rétabli.';

/**
 * Sélectionne le message d'échec HONNÊTE selon le statut HTTP renvoyé par `POST /api/admin/compte/ordre-modules`.
 * 401 = session expirée ; tout le reste (400, 500, 403, ou `0` = coupure
 * réseau où `fetch` a jeté) = échec générique. On ne présente JAMAIS un refus d'entitlement/session comme une panne de données.
 */
export function messageEchecReorg(status: number): string {
  if (status === 401) return MSG_REORG_SESSION;
  return MSG_REORG_ECHEC;
}
