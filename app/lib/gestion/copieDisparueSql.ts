import { copieVivanteAvec } from './copieDisparue';
import { copieDisparueDisponible } from './schema';

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
