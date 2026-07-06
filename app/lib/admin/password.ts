import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Empreinte SHA-256 (32 octets) d'une chaîne. */
function sha256(valeur: string): Buffer {
  return createHash('sha256').update(valeur, 'utf8').digest();
}

/**
 * Vérifie le mot de passe admin en temps constant (EX-19).
 * On compare les empreintes SHA-256 des deux valeurs : longueur toujours égale (32 o),
 * ce qui autorise `timingSafeEqual` et ne révèle ni longueur ni préfixe du secret.
 * Throw si `ADMIN_PASSWORD` est absent (EX-16).
 */
export function motDePasseValide(saisi: string): boolean {
  const attendu = process.env.ADMIN_PASSWORD;
  if (!attendu) {
    throw new Error('ADMIN_PASSWORD manquant : impossible de vérifier le mot de passe admin.');
  }
  return timingSafeEqual(sha256(saisi), sha256(attendu));
}
