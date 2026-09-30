import { suppressionPersonneDisponible } from './schema';
import { personneVivanteAvec } from './personneVivante';

/**
 * ══ 🔴🔴 LOT SUPPRIMER-CARTE — LE FRAGMENT QUI INTERROGE LA SONDE ════════════════════════════════════════════
 *
 * 🔴 IL EST SÉPARÉ DES MOTS ET DES DÉCISIONS (`personneVivante.ts`), ET CE N'EST PAS UN RANGEMENT DE CONFORT :
 * l'écran des cartes est un composant du NAVIGATEUR. Lui faire importer un module qui tire `./schema` — donc
 * `../db/client`, donc `pg` — fait refuser la construction par webpack, et TOUTE l'application tombe, page de
 * connexion comprise (incident du 24/09/2026, 8 800 tests au vert ce jour-là). `clientBoundary.guard.test.ts`
 * attrape ce cas ; il l'a attrapé pendant ce lot, à la première version.
 *
 * 🔴 LA COLONNE N'EST NOMMÉE QUE SI ELLE EXISTE. Sans la migration 287, ce fragment rend `true` : les requêtes
 * sont alors mot pour mot celles d'avant ce lot.
 */
export async function sqlPersonneVivante(alias: string): Promise<string> {
  return personneVivanteAvec(await suppressionPersonneDisponible(), alias);
}
