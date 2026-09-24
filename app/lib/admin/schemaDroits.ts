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

/** Une réponse par question, retenue pour la vie du processus : le schéma ne change pas sous nos pieds. */
const cache = new Map<string, Promise<boolean>>();

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

function memoiser(cle: string, calcul: () => Promise<boolean>): Promise<boolean> {
  const dejaLa = cache.get(cle);
  if (dejaLa) return dejaLa;
  const promesse = calcul();
  cache.set(cle, promesse);
  return promesse;
}

/** Pour les tests : oublie ce qu'on croyait savoir du schéma. N'a aucun effet en production, où rien ne l'appelle. */
export function oublierSchemaDroits(): void {
  cache.clear();
}
