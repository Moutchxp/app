/**
 * ADMINISTRATION — CE QUE LA BASE SAIT DÉJÀ FAIRE EN MATIÈRE DE DROITS. IMPUR (base), en LECTURE SEULE.
 *
 * Les migrations sont LIVRÉES NON APPLIQUÉES : Arno les passe à la main, parfois plusieurs jours après la livraison du
 * code. Entre les deux, le code tourne sur un schéma plus ancien que lui. Une requête qui nommerait une colonne pas
 * encore créée ferait échouer la CONNEXION ELLE-MÊME — `trouverCompte` est sur le chemin d'authentification. C'est la
 * requête la plus critique de l'application : elle ne doit jamais dépendre d'une migration en attente.
 *
 * ⚠️ LA SONDE SE FAIT HORS TRANSACTION, et ce n'est pas un détail de style. PostgreSQL ABANDONNE toute la transaction à
 * la première erreur : un repli placé après une requête qui vient d'échouer ne peut JAMAIS s'exécuter. Même règle, même
 * raison et même précédent que `app/lib/gestion/schema.ts` (incident du lot 4a).
 *
 * 🔒 DIRECTION SÛRE DU REPLI : « je ne sais pas » ⇒ « la colonne n'existe pas » ⇒ le droit n'est accordé À PERSONNE, sauf
 * aux administrateurs (dont les droits sont implicites et ne passent par aucune colonne). Un doute ne doit jamais ouvrir
 * une porte.
 */
import { query } from '../db/client';
import { creerMemoireSonde } from '../db/sondeSchema';

/**
 * 🔴 CORRECTIF DU 24/09/2026 — LA MÉMOIRE NE RETIENT QUE LE « OUI ». Elle retenait AUSSI le « non », pour la vie du
 * processus : Arno a appliqué ses migrations, rechargé la page, et l'écran a continué d'annoncer « mise à jour à
 * appliquer » — parce que la première sonde, posée deux jours plus tôt, avait répondu « absent » une fois pour
 * toutes. Voir `app/lib/db/sondeSchema.ts` pour la mesure et la règle.
 */

async function colonneExiste(table: string, colonne: string): Promise<boolean> {
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2`, [table, colonne]);
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false; // base injoignable : on répond « non », donc on émet le SQL le plus ancien — celui qui marche partout
  }
}

/**
 * La migration 236 est-elle appliquée ? Elle seule porte le droit complémentaire « envoyer au nom de gestion@ ».
 * Tant qu'elle ne l'est pas : la colonne est lue comme `NULL` partout (« à décider »), donc PERSONNE ne peut envoyer —
 * sauf les administrateurs. Aucun écran ne casse, aucune connexion n'échoue, aucun droit existant ne change.
 */
export function droitEnvoiGestionDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.perm_gestion_envoi', () => colonneExiste('admin_utilisateur', 'perm_gestion_envoi'));
}

/**
 * La migration 371 est-elle appliquée ? Elle porte le droit de module « Location » (`perm_location`). Tant qu'elle ne
 * l'est pas : la colonne est lue comme `false` partout, la tuile n'apparaît qu'aux administrateurs, et la case de l'écran
 * des comptes n'écrit rien. Aucune connexion n'échoue.
 */
export function droitLocationDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.perm_location', () => colonneExiste('admin_utilisateur', 'perm_location'));
}

/**
 * La migration 433 est-elle appliquée ? Elle porte le droit de module « Transaction » (`perm_transaction`) et les tables de la
 * tuile. Tant qu'elle ne l'est pas : la colonne est lue comme `false` partout, la tuile n'apparaît qu'aux administrateurs, et
 * la case de l'écran des comptes n'écrit rien. Aucune connexion n'échoue.
 */
export function droitTransactionDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.perm_transaction', () => colonneExiste('admin_utilisateur', 'perm_transaction'));
}

/**
 * TRANSACTION, LOT D (Arno, 27/10/2026) — la migration 434 est-elle appliquée ? Elle porte l'onglet « Compromis » (personnes, dates,
 * négociateurs d'entrée et de sortie), la société datée de chaque collaborateur et la répartition de la commission. Tant qu'elle ne
 * l'est pas : la tuile lit comme avant, la page Comptes montre la société sans l'exiger ni l'écrire. Aucune connexion n'en dépend.
 */
export function repartitionDisponible(): Promise<boolean> {
  return memoiser('transaction_partie.vente_id', async () => (await colonneExiste('transaction_partie', 'vente_id')) && colonneExiste('transaction_societe_compte', 'societe'));
}

/** TRANSACTION, LOT E — la migration 435 (le prix de vente) est-elle appliquée ? Sans elle : le champ est grisé, rien ne lit ni n'écrit la colonne. */
export function prixVenteDisponible(): Promise<boolean> {
  return memoiser('transaction_vente.prix_vente', () => colonneExiste('transaction_vente', 'prix_vente'));
}

/** TRANSACTION, LOT G — la migration 436 (annulation d'un compromis) est-elle appliquée ? Sans elle : bouton visible mais inactif. */
export function annulationDisponible(): Promise<boolean> {
  return memoiser('transaction_vente.annulation_motif', () => colonneExiste('transaction_vente', 'annulation_motif'));
}

/**
 * TRANSACTION, LOT I — la migration 437 (commissions versées et rétrocession de l'apporteur saisies en HT ou en TTC) est-elle appliquée ?
 * Sans elle : tout se saisit en TTC comme avant (« HT » grisé).
 */
export function uniteCommissionDisponible(): Promise<boolean> {
  return memoiser('transaction_vente_ligne.montant_ht', () => colonneExiste('transaction_vente_ligne', 'montant_ht'));
}

const memoire = creerMemoireSonde();
const memoiser = memoire.memoiser;

/** Pour les tests : oublie ce qu'on croyait savoir du schéma. N'a aucun effet en production, où rien ne l'appelle. */
export function oublierSchemaDroits(): void {
  memoire.oublier();
}

/**
 * LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE — la migration 341 est-elle appliquée ? Elle porte la case « Appartient au
 * service gestion ». Tant qu'elle ne l'est pas : la case est lue FAUSSE partout (le cartouche s'affiche, comme avant),
 * et l'écran des comptes ne propose pas de la cocher. Aucun droit n'en dépend.
 */
export function serviceGestionDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.service_gestion', () => colonneExiste('admin_utilisateur', 'service_gestion'));
}

/**
 * LOCATION « OUTILS DE SUIVI » (Arno, 22/10/2026) — la migration 406 est-elle appliquée ? Elle porte le droit « Voir les
 * commissions » (`perm_commissions`). Tant qu'elle ne l'est pas : seuls les administrateurs voient les commissions, et
 * l'écran des comptes ne propose pas la case.
 */
export function droitCommissionsDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.perm_commissions', () => colonneExiste('admin_utilisateur', 'perm_commissions'));
}

/**
 * 🔴 Arno (26/10/2026) — la migration 428 est-elle appliquée ? Elle porte le droit « Accès au Résultat net de l'agence »
 * (`perm_resultat_net`). Tant qu'elle ne l'est pas : seuls les administrateurs voient le bloc, et la question de la page Comptes
 * n'écrit rien.
 */
export function droitResultatNetDisponible(): Promise<boolean> {
  return memoiser('admin_utilisateur.perm_resultat_net', () => colonneExiste('admin_utilisateur', 'perm_resultat_net'));
}
