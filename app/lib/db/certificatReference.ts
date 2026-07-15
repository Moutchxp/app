import { randomBytes } from 'node:crypto';

/**
 * Génération de la RÉFÉRENCE PUBLIQUE du certificat (migration 039). PUR (aucune base) : rangé avec la famille
 * `certificat*` de ce dossier (certificatNumero, certificatJeton, certificatEmission) pour la découvrabilité.
 *
 * Trois identifiants DISTINCTS ne pas confondre : `numero` (SAVV-…, interne, séquentiel), `jeton_verification`
 * (secret de vérification, 038) et `reference` (SVAV-…, PUBLIQUE, courte, à recopier dans une annonce).
 */

/** Alphabet Crockford Base32 : 0-9 A-Z PRIVÉ de I, L, O, U (ambigus). 32 symboles → 5 bits chacun. */
const ALPHABET_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Format de la référence — MIROIR EXACT du CHECK SQL de la migration 039 (`^SVAV-[0-9A-HJKMNP-TV-Z]{4}-…{4}$`). Le
 * SQL n'étant pas importable en TS, ceci est l'UNIQUE source TS partagée (générateur + tests). ⚠️ Préfixe `SVAV`
 * (Sans Vis-A-Vis), DÉLIBÉRÉMENT distinct de `SAVV` du numéro interne : deux identifiants, deux préfixes, jamais confondus.
 */
export const REGEXP_REFERENCE = /^SVAV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * Tire une référence publique : 5 octets d'aléa → 8 caractères Crockford (40 bits), présentés `SVAV-XXXX-XXXX`.
 *
 * CSPRNG OBLIGATOIRE (`crypto.randomBytes`, JAMAIS `Math.random`) : la référence est PUBLIQUE mais doit rester
 * NON ÉNUMÉRABLE — sinon on scrape toute la série en incrémentant, comme on le ferait sur le numéro séquentiel. Un
 * PRNG non cryptographique (Math.random) est prévisible et biaisé : il rendrait la série devinable ET dégraderait
 * l'uniformité dont dépend la rareté des collisions. `randomBytes` puise dans le CSPRNG de l'OS → imprévisible et uniforme.
 *
 * Accord avec le CHECK 039 PAR CONSTRUCTION : chaque groupe de 5 bits indexe `ALPHABET_CROCKFORD` (0..31), dont TOUS
 * les symboles sont dans la classe du CHECK — aucune sortie ne peut violer le format (ni I/L/O/U, ni longueur : 40
 * bits / 5 = 8 symboles pile). La longueur totale et le préfixe sont garantis par le gabarit `SVAV-XXXX-XXXX`.
 */
export function genererReference(): string {
  const octets = randomBytes(5); // 40 bits d'aléa cryptographique (OS CSPRNG)
  let accumulateur = 0; // ne retient QUE les `bits` bits non encore consommés (< 5 après chaque extraction)
  let bits = 0;
  let chars = '';
  for (const octet of octets) {
    accumulateur = (accumulateur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      chars += ALPHABET_CROCKFORD[(accumulateur >>> bits) & 31];
    }
    accumulateur &= (1 << bits) - 1;
  }
  return `SVAV-${chars.slice(0, 4)}-${chars.slice(4, 8)}`; // 8 symboles pile → deux groupes de 4
}
