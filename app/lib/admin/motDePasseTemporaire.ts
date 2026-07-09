import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * Génération du mot de passe TEMPORAIRE d'un compte créé depuis la tuile Administratif (M3-4 Lot C).
 * SERVER-ONLY : `node:crypto` ne doit jamais entrer dans un bundle client. Ces réglages (longueur, alphabet)
 * sont des CONSTANTES DE SÉCURITÉ, pas des variables du moteur de score → hors `config_scoring`, non éditables
 * au runtime (l'invariant « pilotage sans code » vise le scoring).
 */

/** Alphabet SANS AMBIGUÏTÉ visuelle : ni O/0, ni I/l/1 — un mot de passe transmis à l'oral ou copié doit se lire. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** Longueur (≥ 16). */
export const LONGUEUR_MOT_DE_PASSE_TEMPORAIRE = 16;

/**
 * Renvoie un mot de passe temporaire aléatoire. Utilise `crypto.randomInt` (CSPRNG, rejet-échantillonnage interne
 * → AUCUN biais de modulo) ; jamais `Math.random`, jamais `randomBytes(n) % len`.
 */
export function genererMotDePasseTemporaire(): string {
  let out = '';
  for (let i = 0; i < LONGUEUR_MOT_DE_PASSE_TEMPORAIRE; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
