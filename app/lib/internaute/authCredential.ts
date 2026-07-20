import 'server-only';
import { query } from '../db/client';
// Primitive argon2id NEUTRE (aucun `server-only`, aucune dépendance admin — partagée route+CLI). On la RÉUTILISE
// telle quelle : pas de duplication d'argon2id, pas de modif du module admin.
import { hacher, verifier } from '../admin/motDePasse';

export { verifier }; // ré-export : la route de login vérifie contre le hash lu OU le hash-leurre, dans le domaine internaute.

/** Longueur minimale d'un mot de passe internaute (politique serveur). */
export const LONGUEUR_MIN = 12;

/** Politique mot de passe (validée SERVEUR, jamais seulement front) : ≥ LONGUEUR_MIN caractères. Renvoie les erreurs. */
export function politiqueMotDePasse(clair: unknown): { ok: boolean; erreurs: string[] } {
  const erreurs: string[] = [];
  if (typeof clair !== 'string' || clair.length < LONGUEUR_MIN) {
    erreurs.push(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`);
  }
  return { ok: erreurs.length === 0, erreurs };
}

/**
 * POSE (ou remplace) le credential d'un internaute : valide la politique, hache en argon2id, UPSERT dans
 * `internaute_auth`. Lève si la politique n'est pas respectée (garde de défense ; l'appelant valide en amont). NB : ce
 * lot expose la CAPACITÉ ; le FLUX de création de compte (tunnel) est un lot séparé.
 */
export async function poserMotDePasse(internauteId: string, clair: string): Promise<void> {
  if (!politiqueMotDePasse(clair).ok) throw new Error('mot de passe non conforme à la politique');
  const hash = await hacher(clair);
  await query(
    `INSERT INTO internaute_auth (internaute_id, mot_de_passe)
     VALUES ($1, $2)
     ON CONFLICT (internaute_id) DO UPDATE SET mot_de_passe = EXCLUDED.mot_de_passe, maj_a = now()`,
    [internauteId, hash],
  );
}

/**
 * Résout le credential d'un e-mail pour la connexion : joint `internaute` (NON effacé) à `internaute_auth`. Renvoie
 * `{ internauteId, hash }`, ou `null` (e-mail inconnu, dossier EFFACÉ, OU aucun compte). L'appelant DOIT appliquer un
 * hash-leurre quand c'est `null` (temps constant, anti-énumération). Recherche insensible à la casse (`lower(email)`).
 */
export async function resoudreCredentialParEmail(email: string): Promise<{ internauteId: string; hash: string } | null> {
  const r = await query<{ id: string; mot_de_passe: string }>(
    `SELECT i.id, a.mot_de_passe
       FROM internaute i
       JOIN internaute_auth a ON a.internaute_id = i.id
      WHERE lower(i.email) = lower($1) AND i.efface_a IS NULL
      LIMIT 1`,
    [email],
  );
  const row = r.rows[0];
  return row ? { internauteId: row.id, hash: row.mot_de_passe } : null;
}
