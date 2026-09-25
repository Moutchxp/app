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
    // Base injoignable : on répond « non », donc on émet le SQL le plus ancien — celui qui marche partout. L'erreur
    //   réelle sera rapportée par la requête suivante, avec son vrai motif, au lieu d'être déguisée ici.
    return false;
  }
}

const memoire = creerMemoireSonde();
const memoiser = memoire.memoiser;

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

/**
 * LOT 5-PJ-A — la migration 244 est-elle appliquée ? Elle seule permet de MÉMORISER la miniature d'une pièce jointe
 * (sa clé sur le stockage, ou la raison pour laquelle il n'y en aura pas).
 *
 * ⚠️ Elle ne conditionne AUCUNE fonctionnalité visible : sans elle, les cartes de pièces jointes s'affichent avec
 * leur icône de type, et tout le reste — nom, taille, téléchargement, archive — fonctionne à l'identique. On ne sonde
 * qu'`miniature_cle` : la migration crée les quatre colonnes dans UNE transaction, elles arrivent donc ensemble.
 */
export function miniaturesDisponibles(): Promise<boolean> {
  return memoiser('piece.miniature_cle', () => colonneExiste('gestion_piece', 'miniature_cle'));
}

/** Pour les tests : oublie ce qu'on croyait savoir du schéma. N'a aucun effet en production, où rien ne l'appelle. */
export function oublierSchema(): void {
  memoire.oublier();
}

/**
 * LOT 5e — les migrations 239 et 240 sont-elles appliquées ? Elles seules portent les BROUILLONS et le REGISTRE DES
 * ENVOIS. Tant qu'elles ne le sont pas : aucun bouton de rédaction ne s'affiche, et l'écran DIT « mise à jour de la
 * base à appliquer » plutôt que de proposer un geste qui échouerait au clic.
 *
 * 🔴 LES DEUX ENSEMBLE, jamais l'une sans l'autre : écrire un brouillon qu'on ne pourrait pas envoyer, ou envoyer sans
 * pouvoir enregistrer, sont deux demi-fonctions — et une demi-fonction qui s'affiche est une promesse qu'on ne tient pas.
 */
export function redactionDisponible(): Promise<boolean> {
  return memoiser('redaction.tables', async () => {
    const [b, e] = await Promise.all([tableExiste('gestion_brouillon'), tableExiste('gestion_envoi')]);
    return b && e;
  });
}

async function tableExiste(table: string): Promise<boolean> {
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1`, [table]);
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false; // base injoignable : on répond « non », donc l'écran se tait au lieu de proposer l'impossible
  }
}

/** LOT 5e — la migration 241 (délai d'annulation réglable) est-elle appliquée ? Sinon le délai vaut son défaut. */
export function delaiAnnulationDisponible(): Promise<boolean> {
  return memoiser('config.annulation_envoi_secondes', () => colonneExiste('gestion_config', 'annulation_envoi_secondes'));
}

/**
 * LOT 5-FIDÈLE — la migration 242 est-elle appliquée ? Elle seule permet de MÉMORISER la correspondance avec Gmail.
 *
 * ⚠️ Elle ne conditionne AUCUNE fonctionnalité : sans elle, chaque action Gmail retrouve le message par une recherche
 * `rfc822msgid:`, ce qui marche — au prix d'une requête de plus. La sonde ne sert donc qu'à éviter d'écrire dans des
 * colonnes qui n'existent pas encore.
 */
export function identifiantsGmailDisponibles(): Promise<boolean> {
  return memoiser('message.gmail_message_id', () => colonneExiste('gestion_message', 'gmail_message_id'));
}

/**
 * CORRECTIF DU 24/09/2026 — la migration 243 est-elle appliquée ? Elle ajoute « envoi » aux entités que
 * `gestion_journal` accepte. Tant qu'elle ne l'est pas, un envoi RATTACHÉ À UN ÉCHANGE se journalise quand même (sur
 * l'échange) ; seul un message tout neuf, sans échange, reste sans ligne de journal. Voir `journalEnvoi.ts`.
 *
 * On sonde la RÈGLE elle-même, pas une colonne : c'est elle, et elle seule, qui refusait l'écriture.
 */
export function journalEnvoiDisponible(): Promise<boolean> {
  return memoiser('journal.entite_envoi', async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM pg_constraint
          WHERE conrelid = to_regclass('public.gestion_journal')
            AND conname = 'gestion_journal_entite_chk'
            AND pg_get_constraintdef(oid) LIKE '%''envoi''%'`);
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false; // base injoignable : on répond « non », donc le rangement qui marche partout
    }
  });
}
