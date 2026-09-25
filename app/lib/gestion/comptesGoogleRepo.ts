/**
 * MODULE « GESTION » — LES DOMAINES AUTORISÉS, ET LA PURGE DES ANCIENS JETONS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE FICHIER A PERDU L'ESSENTIEL DE SON RÔLE AU LOT 5-PJ-C2, et c'est voulu. Il gérait les comptes Google reliés
 * un par un (lot 5-PJ-C) ; Arno a décidé le 25/09 qu'on n'allait plus rien demander à personne : on agit au nom de
 * l'adresse avec laquelle le collaborateur s'identifie déjà. Il ne reste donc ici que deux choses :
 *   ① les DOMAINES autorisés, qui restent un réglage en base et servent toujours à vérifier le subject ;
 *   ② la PURGE des jetons individuels déjà stockés — des SECRETS, pas des données métier.
 *
 * 🔴 POURQUOI LA PURGE EST UNE EXCEPTION À « RIEN N'EST JAMAIS SUPPRIMÉ ». La règle du module protège des données
 * métier : un message, un classement, une trace. Un jeton de rafraîchissement n'est rien de tout cela — c'est un
 * ACCÈS, sans mot de passe et sans expiration, au Drive d'une personne. Le garder « au cas où » n'est pas de la
 * prudence, c'est un passif. Les lignes de JOURNAL, elles, restent intactes : c'est la trace qui compte.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { comptesGoogleDisponibles } from './schema';

/** Les domaines acceptés, lus en CONFIGURATION. Jamais en dur : ajouter un domaine ne doit demander aucun code. */
export async function lireDomainesAutorises(): Promise<string> {
  if (!await comptesGoogleDisponibles()) return '';
  const { rows } = await query<{ d: string }>(
    `SELECT domaines_google_autorises AS d FROM gestion_config WHERE id = 1`);
  return rows[0]?.d ?? '';
}

/** Un jeton encore en base, à révoquer puis à effacer. Le contenu chiffré n'est rendu QU'À la révocation. */
export interface JetonAPurger { utilisateurId: number; email: string; refreshTokenChiffre: string }

/** Ce qui reste à purger. Liste vide = rien à faire, et c'est le cas nominal. */
export async function lireJetonsAPurger(): Promise<JetonAPurger[]> {
  if (!await comptesGoogleDisponibles()) return [];
  const { rows } = await query<{ utilisateur_id: number; email: string; refresh_token_chiffre: string }>(
    `SELECT utilisateur_id::int AS utilisateur_id, email, refresh_token_chiffre FROM gestion_google_compte`);
  return rows.map((r) => ({
    utilisateurId: r.utilisateur_id, email: r.email, refreshTokenChiffre: r.refresh_token_chiffre,
  }));
}

/**
 * EFFACE un jeton, APRÈS sa révocation chez Google.
 *
 * L'ordre importe : révoquer d'abord, effacer ensuite. Effacer d'abord rendrait la révocation impossible — on aurait
 * jeté la seule chose qui permettait de fermer la porte.
 */
export async function effacerJeton(utilisateurId: number): Promise<void> {
  if (!await comptesGoogleDisponibles()) return;
  await query(`DELETE FROM gestion_google_compte WHERE utilisateur_id = $1`, [utilisateurId]);
}
