import { copieVivanteAvec } from './copieDisparue';
import { copieDisparueDisponible, uniciteCopiesVivantesDisponible } from './schema';

/**
 * 🔴 LE FRAGMENT « CETTE COPIE EXISTE-T-ELLE ENCORE ? », CÂBLÉ SUR LA SONDE.
 *
 * ⚠️ SÉPARÉ DU MODULE PUR, et pour la même raison qu'au lot SUPPRIMER-CARTE : `copieDisparue.ts` est lisible par
 * un composant du navigateur, et il ne doit donc tirer NI `./schema`, NI `../db/client`, NI `pg`. La version qui
 * les mêlait a été attrapée par `clientBoundary.guard.test.ts` en une seconde — c'est l'incident du 24/09/2026.
 */
export async function sqlCopieVivante(alias: string): Promise<string> {
  return copieVivanteAvec(await copieDisparueDisponible(), alias);
}

/**
 * ══ 🔴🔴 LE PRÉDICAT D'UN `ON CONFLICT` SUR LE REGISTRE DES COPIES — LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 5 ═
 *
 * `ON CONFLICT (piece_id, drive_dossier_id)${await sqlConflitCopieVivante()} DO …`
 *
 * 🔴 POURQUOI CE FRAGMENT EXISTE. Depuis la migration 301, l'index unique du registre est PARTIEL
 * (`WHERE disparu_le IS NULL`) : PostgreSQL exige alors que le `ON CONFLICT` répète ce prédicat, sinon il ne
 * désigne AUCUN index et la requête échoue — « there is no unique or exclusion constraint matching the ON CONFLICT
 * specification », mesuré à l'écran le 04/10/2026 après un dépôt réel, FICHIER DÉJÀ CRÉÉ chez Google.
 *
 * 🔴 ET POURQUOI IL EST CALCULÉ, JAMAIS ÉCRIT EN DUR. Sans la 301, le prédicat est INTERDIT : il ne
 * correspondrait pas à l'ancien index total, et l'on aurait la même erreur en miroir. Deux bases, deux SQL, une
 * seule règle — exactement la discipline des sondes de schéma de ce module.
 *
 * ⚠️ ÉCRIT UNE SEULE FOIS, pour les DEUX écrivains du registre (le dépôt manuel et la copie automatique). Deux
 * copies de ce fragment auraient divergé à la prochaine migration d'index, et l'une des deux routes serait restée
 * cassée sans que rien ne le dise.
 */
export async function sqlConflitCopieVivante(): Promise<string> {
  return await uniciteCopiesVivantesDisponible() ? ' WHERE disparu_le IS NULL' : '';
}
