/**
 * MODULE « GESTION » — CE QUE LA BASE SAIT DÉJÀ FAIRE. IMPUR (base), en LECTURE SEULE.
 *
 * Les migrations de ce module sont LIVRÉES NON APPLIQUÉES : Arno les passe à la main, parfois plusieurs jours après la
 * livraison du code. Entre les deux, le code tourne sur un schéma plus ancien que lui. Une requête qui nommerait une
 * colonne pas encore créée ferait échouer TOUT l'écran — pas seulement la fonctionnalité nouvelle.
 *
 * On DEMANDE donc à la base ce qu'elle sait faire, une fois par processus, et on choisit le SQL AVANT de l'émettre.
 *
 * ⚠️ LA SONDE SE FAIT HORS TRANSACTION, et ce n'est pas un détail de style. PostgreSQL ABANDONNE toute la transaction
 * à la première erreur : un repli placé dans un `withTransaction` après une requête qui vient d'échouer ne peut JAMAIS
 * s'exécuter — il rendrait « current transaction is aborted ». Ce défaut a été livré une fois (lot 4a) avant d'être
 * mesuré puis corrigé ; la règle qui en découle est ici, en toutes lettres.
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
    // Base injoignable : on répond « non », donc on émet le SQL le plus ancien — celui qui marche partout. L'erreur
    //   réelle sera rapportée par la requête suivante, avec son vrai motif, au lieu d'être déguisée ici.
    return false;
  }
}

function memoiser(cle: string, calcul: () => Promise<boolean>): Promise<boolean> {
  const dejaLa = cache.get(cle);
  if (dejaLa) return dejaLa;
  const promesse = calcul();
  cache.set(cle, promesse);
  return promesse;
}

/**
 * La migration 234 est-elle appliquée ? Elle seule permet de rattacher UN MAIL à une autre carte que son échange.
 * Tant qu'elle ne l'est pas, tout le module se comporte exactement comme avant : les mails suivent leur échange.
 */
export function deplacementsDeMailsDisponibles(): Promise<boolean> {
  return memoiser('affectation.message_id', () => colonneExiste('gestion_affectation', 'message_id'));
}

/**
 * La migration 235 est-elle appliquée ? Elle seule permet d'écrire les destinataires SÉPARÉS (À / Cc / Cci / Reply-To).
 * Tant qu'elle ne l'est pas, la capture se comporte exactement comme avant : elle remplit `destinataires` (To et Cc
 * fondus) et `nb_destinataires`, et n'écrit aucune des quatre colonnes nouvelles.
 *
 * On sonde `dest_a`, jamais les quatre : la migration les crée dans UNE transaction, elles arrivent donc ensemble.
 */
export function destinatairesSeparesDisponibles(): Promise<boolean> {
  return memoiser('message.dest_a', () => colonneExiste('gestion_message', 'dest_a'));
}

/**
 * LOT 5c — la migration 237 est-elle appliquée ? Elle seule pose l'index plein texte du courrier.
 *
 * Tant qu'elle ne l'est pas, la recherche bascule en MODE RÉDUIT (`LIKE`, qui balaie) : plus lente, sans radicaux, mais
 * elle TROUVE — et l'écran dit qu'elle est réduite. On ne sonde pas la colonne mais l'INDEX : c'est lui, et lui seul,
 * qui fait la différence entre une recherche instantanée et un balayage de 41 Mo.
 */
export function rechercheTexteDisponible(): Promise<boolean> {
  return memoiser('index.recherche', async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes
          WHERE tablename = 'gestion_message' AND indexname = 'gestion_message_recherche_idx'`);
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false; // base injoignable : on répond « non », donc le chemin qui marche partout
    }
  });
}

/** Pour les tests : oublie ce qu'on croyait savoir du schéma. N'a aucun effet en production, où rien ne l'appelle. */
export function oublierSchema(): void {
  cache.clear();
}
