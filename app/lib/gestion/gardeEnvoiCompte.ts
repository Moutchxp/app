import { capaciteEnvoiGestion, trouverCompteParId } from '../admin/comptes';

/**
 * MODULE « GESTION » — LE DROIT D'ENVOYER, POUR UN COMPTE DONNÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE MODULE EXISTE, SÉPARÉ DE `gardeEnvoi.ts`. Celui-là porte `import 'server-only'` — légitimement :
 * il lit un cookie de session, ce qui n'a de sens que dans une requête. Mais le travailleur de fond, lui, tourne
 * aussi sous `tsx` (la relève continue, lancée par launchd), et `server-only` LÈVE hors du bundle react-server :
 * la CLI mourrait au chargement, sans rapport apparent avec l'envoi.
 *
 * C'est le motif F1 du dépôt, et le garde `app/lib/garde/serverOnly.guard.test.ts` l'a attrapé pendant ce lot —
 * exactement le cas pour lequel il a été écrit.
 *
 * 🔴 LA RÈGLE, ELLE, NE CHANGE PAS : le droit est RELU EN BASE, jamais lu dans un jeton. Et c'est ici qu'elle
 * compte le plus : entre le clic et l'envoi différé il peut s'écouler des minutes, et un droit retiré dans
 * l'intervalle DOIT couper l'envoi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * CE COMPTE PEUT-IL ENVOYER AU NOM DE gestion@ ?
 *
 * ⚠️ `auteurId === null` = la VOIE DE SECOURS (mot de passe partagé). On rend `true` : c'est la règle d'or du
 * dépôt — un `WHERE id = null` enfermerait Arno dehors. L'envoi a de toute façon été autorisé au clic par
 * `peutEnvoyerAuNomDeGestion`, qui l'a laissé passer pour cette même raison.
 *
 * 🔒 DIRECTION SÛRE DU DOUTE : compte introuvable, compte désactivé, base injoignable — dans tous ces cas, on
 * n'envoie pas. Un droit qui envoie du courrier au nom de l'agence ne s'ouvre jamais par accident.
 */
export async function compteePeutEnvoyer(auteurId: number | null): Promise<boolean> {
  if (auteurId === null) return true;
  try {
    const compte = await trouverCompteParId(auteurId);
    if (!compte || !compte.actif) return false;
    return capaciteEnvoiGestion(compte);
  } catch {
    return false; // base injoignable : on n'envoie pas. Le doute ne doit jamais ouvrir cette porte-là.
  }
}
