import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db/client';

/**
 * Module INTERNAUTE — JETON de RÉINITIALISATION de mot de passe (« mot de passe oublié »). Couche données STATEFUL
 * (table `internaute_reset_mot_de_passe`, migration 046) : un lien de reset est à USAGE UNIQUE et INVALIDÉ dès qu'un
 * nouveau est demandé — ces propriétés vivent en base.
 *
 * EMPREINTE = SHA-256 (node:crypto), PAS argon2id. POURQUOI : (1) le secret est ALÉATOIRE 256 bits → un KDF lent
 * (argon2) n'apporte rien face à une recherche par force brute d'un espace astronomique ; (2) argon2 est AUTO-SALÉ donc
 * NON DÉTERMINISTE → impossible de retrouver un jeton par égalité indexée (il faudrait un `verify` par ligne). SHA-256
 * donne une empreinte DÉTERMINISTE et INDEXABLE, et c'est déjà le pattern d'empreinte de secret du dépôt (cf.
 * `authThrottle.cleThrottle`, `certificatVerification.sha256`). Le SECRET EN CLAIR n'est JAMAIS stocké ni loggé.
 */

/** Durée de validité d'un jeton de reset (secondes) — ~1 h : le geste suit de peu la réception de l'e-mail. */
const DUREE_VALIDITE_S = 3600;
/** Taille du secret aléatoire (octets) : 32 = 256 bits d'entropie. */
const OCTETS_SECRET = 32;

/** Empreinte DÉTERMINISTE (SHA-256 hex) du secret — clé de lookup indexée. Jamais le secret en clair. */
function empreinte(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Crée un jeton de reset pour un internaute et renvoie le SECRET EN CLAIR (une seule fois — pour construire le lien).
 *
 * ATOMIQUE (`withTransaction`) : INVALIDE d'abord tout jeton ACTIF précédent du même internaute (DELETE des lignes non
 * consommées — expirées OU non : « un seul jeton actif », le nouveau remplace l'ancien), PUIS insère l'EMPREINTE du
 * nouveau secret avec `expire_a = now() + ~1 h`. Seul le secret clair sort de la fonction ; en base ne vit que son
 * empreinte. Le secret n'est jamais loggé.
 */
export async function creerJetonReset(internauteId: string): Promise<string> {
  const secret = randomBytes(OCTETS_SECRET).toString('base64url'); // 256 bits, URL-safe (va dans un lien)
  const hache = empreinte(secret);
  await withTransaction(async (q) => {
    // Invalidation des précédents non consommés → garantit « un seul jeton actif par internaute ».
    await q(`DELETE FROM internaute_reset_mot_de_passe WHERE internaute_id = $1 AND consomme_a IS NULL`, [internauteId]);
    await q(
      `INSERT INTO internaute_reset_mot_de_passe (jeton_hache, internaute_id, expire_a)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [hache, internauteId, DUREE_VALIDITE_S],
    );
  });
  return secret;
}

/**
 * Vérifie ET CONSOMME un jeton en UN SEUL UPDATE atomique : ne matche QUE non consommé ET non expiré, pose
 * `consomme_a = now()`, et renvoie l'`internaute_id` scellé — ou `null` si inconnu / expiré / déjà consommé
 * (INDISTINCTEMENT : un seul chemin, aucune fuite de la cause).
 *
 * TEMPS CONSTANT / ANTI-TOCTOU : le lookup se fait par l'EMPREINTE SHA-256 indexée — AUCUNE comparaison du secret côté
 * application, donc aucune branche dépendant du secret. L'UPDATE conditionnel est atomique : deux requêtes concurrentes
 * ne peuvent pas consommer le même jeton (la seconde voit `consomme_a IS NULL` déjà faux → 0 ligne). Rien n'est loggé.
 */
export async function consommerJetonReset(secret: string): Promise<string | null> {
  if (typeof secret !== 'string' || secret.length === 0) return null; // entrée non conforme → rejet (aucune info divulguée)
  const hache = empreinte(secret);
  const r = await query<{ internaute_id: string }>(
    `UPDATE internaute_reset_mot_de_passe
        SET consomme_a = now()
      WHERE jeton_hache = $1 AND consomme_a IS NULL AND expire_a > now()
      RETURNING internaute_id`,
    [hache],
  );
  return r.rows[0]?.internaute_id ?? null;
}
