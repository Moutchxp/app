/**
 * Fin du tunnel pour un internaute CONNECTÉ (lot TUNNEL-CONNECTE, décisions d'Arno du 17/10/2026 : 1d, 2 recommandé).
 * Module PUR (aucun accès réseau ni base) → importable par le client.
 *
 *  - Connecté (session de compte valide) : les écrans « Validez vos coordonnées d'envoi » (A) et « Comment souhaitez-vous
 *    continuer ? » (B) sont SAUTÉS. Tout compte vaut « e-mail confirmé » (décision 1d). L'émission part directement, comme
 *    le choix « client / compte » le faisait déjà pour un compte existant : aucun compte créé, aucun mot de passe demandé,
 *    aucun clic fictif dans les statistiques.
 *  - Rien d'écrit ne disparaît : l'écran A n'écrivait rien, l'écran B non plus. Les écritures (rattachement du projet au
 *    compte par l'e-mail, consentements, jeton d'émission) sont faites par l'ingestion, AVANT ces écrans.
 *  - Le saut n'a lieu que si l'ingestion a RÉUSSI pour un dossier EXISTANT (pas de jeton de rectification) avec un jeton
 *    d'émission et un projet : sinon on retombe sur le parcours d'avant (écran A avec son message d'erreur, puis B).
 *  - Non connecté : rien ne change.
 */

/** Ce que rend `POST /api/internaute`, lu défensivement. */
export interface IssueIngestion {
  jetonRectification: string | null;
  jetonEmission: string | null;
  projetId: number | null;
}

export function lireIssueIngestion(data: unknown): IssueIngestion {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    jetonRectification: typeof d.jetonRectification === 'string' ? d.jetonRectification : null,
    jetonEmission: typeof d.jetonEmission === 'string' ? d.jetonEmission : null,
    projetId: typeof d.projetId === 'number' ? d.projetId : null,
  };
}

/**
 * L'émission directe d'un internaute connecté : de quoi émettre (jeton d'émission + projet), ou `null` = parcours d'avant
 * (écrans A puis B). `ingestion` vaut `null` quand l'ingestion a échoué.
 */
export function emissionDirecteConnecte(o: {
  connecte: boolean;
  ingestion: IssueIngestion | null;
}): { jetonEmission: string; projetId: number } | null {
  if (!o.connecte || o.ingestion === null) return null;
  const { jetonRectification, jetonEmission, projetId } = o.ingestion;
  /* Un jeton de rectification = un dossier NEUF vient d'être créé (l'e-mail ne désignait pas le compte) : le parcours
     d'avant, qui sait compléter ce dossier, s'applique. */
  if (jetonRectification !== null || jetonEmission === null || projetId === null) return null;
  return { jetonEmission, projetId };
}
