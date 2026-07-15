import { randomBytes } from 'node:crypto';

/**
 * Génération du JETON DE VÉRIFICATION du certificat (migration 038). PUR (aucune base) : rangé avec la famille
 * `certificat*` de ce dossier (certificatNumero, certificatEmission) plutôt qu'ailleurs, pour la découvrabilité.
 */

/** Alphabet Crockford Base32 : 0-9 A-Z PRIVÉ de I, L, O, U (ambigus). 32 symboles → 5 bits chacun. */
const ALPHABET_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Format du jeton — MIROIR EXACT du CHECK SQL de la migration 038 (`^[0-9A-HJKMNP-TV-Z]{16}$`). Le SQL n'étant pas
 * importable en TS, ceci est l'UNIQUE source TS partagée (générateur + tests) : on la centralise ici plutôt que de
 * la retaper de mémoire ailleurs. Le générateur la satisfait PAR CONSTRUCTION (voir plus bas), pas par chance.
 */
export const REGEXP_JETON_VERIFICATION = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * Tire un jeton de vérification : 10 octets d'aléa → 16 caractères Crockford Base32 (80 bits, sans padding).
 *
 * CSPRNG OBLIGATOIRE (`crypto.randomBytes`, JAMAIS `Math.random`) : ce jeton est le SEUL rempart entre « je tiens le
 * document » et « j'ai deviné un numéro séquentiel » (le numéro SAVV est énumérable). `Math.random` est un PRNG
 * NON cryptographique : son état interne est reconstructible à partir de quelques sorties → un attaquant pourrait
 * RECALCULER les jetons et vérifier des certificats qu'il ne détient pas. La vérification deviendrait décorative,
 * et le document avec. `randomBytes` puise dans le CSPRNG de l'OS : imprévisible même en connaissant les sorties passées.
 *
 * Accord avec le CHECK 038 PAR CONSTRUCTION : chaque groupe de 5 bits indexe `ALPHABET_CROCKFORD` (0..31) dont TOUS
 * les symboles appartiennent à la classe du CHECK — aucune sortie ne peut donc violer le format (ni I/L/O/U, ni
 * longueur ≠ 16 : 80 bits / 5 = 16 pile, aucun reste, aucun padding).
 */
export function genererJetonVerification(): string {
  const octets = randomBytes(10); // 80 bits d'aléa cryptographique (OS CSPRNG)
  let accumulateur = 0; // ne retient QUE les `bits` bits non encore consommés (reste < 5 après chaque extraction)
  let bits = 0;
  let jeton = '';
  for (const octet of octets) {
    accumulateur = (accumulateur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      jeton += ALPHABET_CROCKFORD[(accumulateur >>> bits) & 31];
    }
    accumulateur &= (1 << bits) - 1; // purge les bits déjà émis → accumulateur reste < 2^5 (jamais d'overflow 32 bits)
  }
  return jeton; // 16 caractères pile
}
