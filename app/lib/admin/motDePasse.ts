// NB : PAS de `import 'server-only'` — ce module est partagé par la route de connexion (serveur) ET par le script
// CLI `app/scripts/admin.ts` (exécuté par `tsx`, Node pur, où `server-only` lèverait). Sécurité réelle : argon2 est
// natif (jamais bundlable côté client) et aucun composant client n'importe ce module.
import { hash, verify, argon2id } from 'argon2';

/**
 * Hachage des mots de passe des comptes administrateurs (M3). Algorithme : **argon2id** (résistant GPU/ASIC,
 * salage automatique, paramètres par défaut de la lib). Le mot de passe en CLAIR n'est jamais stocké ni loggé.
 * argon2 fournit naturellement un coût de calcul (délai) qui freine la force brute côté connexion.
 */
export async function hacher(clair: string): Promise<string> {
  return hash(clair, { type: argon2id });
}

/**
 * Vérifie un mot de passe clair contre un hash argon2id encodé. Renvoie `false` (jamais d'exception) si le hash
 * est absent/malformé — utilisé aussi pour un « verify de leurre » à temps constant sur un identifiant inconnu.
 */
export async function verifier(clair: string, hachage: string): Promise<boolean> {
  try {
    return await verify(hachage, clair);
  } catch {
    return false;
  }
}
