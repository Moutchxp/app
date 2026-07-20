import 'server-only';
import { query } from '../db/client';
import { poserMotDePasse, politiqueMotDePasse } from './authCredential';

/**
 * Module INTERNAUTE — CRÉATION DE COMPTE depuis le TUNNEL (serveur only, Commit B).
 *
 * Ce module expose le FLUX métier (la CAPACITÉ « poser un credential » vit déjà dans `authCredential`). L'OWNERSHIP du
 * dossier est prouvée EN AMONT par la route (jeton-capacité `rectify-contact` vérifié) : `creerCompteInternaute` reçoit
 * un `internauteId` = `sub` du jeton, JAMAIS un id venu du corps de requête (parade IDOR déléguée à l'appelant).
 *
 * ZÉRO CONSENTEMENT : créer un compte n'écrit AUCUNE ligne `internaute_consentement` et ne coche AUCUNE finalité. La
 * base légale d'un compte est le SERVICE (relation contractuelle), jamais le marketing — les deux sont disjoints.
 * AUCUN import moteur / analytics → cloisonnement M2, golden intact.
 */

/** Résultat discriminé de la création de compte (l'appelant traduit chaque `raison` en statut HTTP). */
export type ResultatCreationCompte =
  | { ok: true }
  | { ok: false; raison: 'mot_de_passe_invalide'; erreurs: string[] }
  | { ok: false; raison: 'dossier_introuvable' } // id inconnu OU dossier déjà effacé (efface_a non NULL)
  | { ok: false; raison: 'coordonnees_incompletes' }; // pas d'e-mail sur le dossier → login impossible

/**
 * CRÉE le compte (credential) d'un internaute déjà créé dans le tunnel.
 *
 * 1. Valide la POLITIQUE de mot de passe (≥ `LONGUEUR_MIN`) AVANT tout accès base (échec rapide, aucune écriture).
 * 2. Valide les COORDONNÉES PRÉ-REMPLIES côté serveur : le dossier doit EXISTER, être NON effacé, et porter un e-mail
 *    (seul identifiant de connexion — sans lui le compte serait inutilisable). C'est la contrepartie serveur de l'écran
 *    de confirmation des coordonnées ; le calcul reste défensif même si le front les a déjà affichées.
 * 3. POSE le credential via `poserMotDePasse` (UPSERT argon2id dans `internaute_auth`) — SEULE écriture du flux.
 *
 * N'OUVRE PAS la session (la route le fait via `next/headers`, hors module testable) et N'ÉCRIT AUCUN CONSENTEMENT.
 * Ne throw pas pour les cas métier (retour discriminé) ; laisse remonter une éventuelle panne base à l'appelant.
 */
export async function creerCompteInternaute(
  internauteId: string,
  motDePasseClair: string,
): Promise<ResultatCreationCompte> {
  const politique = politiqueMotDePasse(motDePasseClair);
  if (!politique.ok) return { ok: false, raison: 'mot_de_passe_invalide', erreurs: politique.erreurs };

  // Validation SERVEUR des coordonnées pré-remplies : dossier vivant (efface_a IS NULL) + e-mail présent.
  const r = await query<{ email: string | null }>(
    `SELECT email FROM internaute WHERE id = $1 AND efface_a IS NULL`,
    [internauteId],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, raison: 'dossier_introuvable' };
  if (!row.email) return { ok: false, raison: 'coordonnees_incompletes' };

  await poserMotDePasse(internauteId, motDePasseClair); // INSERT internaute_auth (UPSERT argon2id). Aucun consentement.
  return { ok: true };
}
