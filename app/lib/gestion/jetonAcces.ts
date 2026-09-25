import { lireIdentifiants, rafraichirJeton } from './google';
import { lireJeton } from './googleJeton';

/**
 * MODULE « GESTION » — LE JETON D'ACCÈS GOOGLE, EN UN SEUL ENDROIT.
 *
 * Le même enchaînement — lire les identifiants du client OAuth, lire le jeton de rafraîchissement, demander à Google
 * un jeton d'accès — était recopié dans chaque route qui touche Gmail. Ce lot en ajoutait une troisième copie : mieux
 * vaut une fonction. Elle dit aussi POURQUOI ça ne marche pas, ce qu'un `null` ne dit pas.
 *
 * 🔒 LE JETON NE QUITTE JAMAIS LE SERVEUR. Il n'est jamais rendu dans une réponse HTTP, et aucune route de ce lot ne
 * le recopie dans un corps ni un en-tête destiné au navigateur. L'écran ne voit que le RÉSULTAT d'une action, jamais
 * le moyen de la refaire.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, malgré la convention du dépôt — même arbitrage, et pour la même raison, que
 * `app/lib/db/client.ts` : les SCRIPTS en ligne de commande en ont légitimement besoin (l'essai réel du lot l'a
 * montré en échouant dessus), et la marque les tue au chargement. La protection est AILLEURS : ce module n'atteint
 * le disque qu'à travers `googleJeton.ts`, dont un test surveille déjà le graphe d'imports côté navigateur.
 */

export type EtatGoogle =
  /** Tout va bien : voici un jeton d'accès, valable une heure. */
  | { etat: 'ok'; jeton: string }
  /** Le compte n'a jamais été relié, ou le fichier de jeton a disparu. */
  | { etat: 'non_connecte'; motif: string }
  /** Le jeton existe mais Google le refuse (autorisation retirée, mot de passe changé, jeton expiré définitivement). */
  | { etat: 'expire'; motif: string };

/** Ce que l'écran affiche quand Google n'est pas joignable. Écrit une fois, pour ne pas inventer trois formulations. */
export const MENTION_NON_CONNECTE = 'Drive non connecté — voir réglages';

export async function jetonAccesGestion(): Promise<EtatGoogle> {
  const identifiants = lireIdentifiants();
  if (identifiants === null) {
    return { etat: 'non_connecte', motif: 'Aucun identifiant de client OAuth n’est configuré.' };
  }
  const jeton = lireJeton();
  if (jeton === null) {
    return { etat: 'non_connecte', motif: 'Le compte Google de gestion n’a pas encore été autorisé.' };
  }
  try {
    const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
    // Un refus de Google n'est PAS « pas connecté » : le jeton est là, il ne vaut simplement plus rien. Les deux ne se
    //   réparent pas pareil — l'un demande une première autorisation, l'autre de la REFAIRE.
    return acces.ok ? { etat: 'ok', jeton: acces.valeur } : { etat: 'expire', motif: acces.motif };
  } catch {
    return { etat: 'expire', motif: 'Google n’a pas répondu.' };
  }
}
