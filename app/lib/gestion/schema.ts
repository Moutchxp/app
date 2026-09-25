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

/**
 * LOT 5-PJ-B — la migration 245 est-elle appliquée ? Elle seule porte la table des dépôts dans le Google Drive.
 *
 * 🔴 CELLE-CI, CONTRAIREMENT À LA 244, CONDITIONNE UNE FONCTIONNALITÉ. Sans elle, on ne peut pas se souvenir d'un
 * dépôt — donc pas empêcher un doublon, ni afficher « Dans le Drive · ouvrir ». Déposer quand même serait promettre
 * une mémoire qu'on n'a pas, et le deuxième clic enverrait une seconde copie sans le dire. Les boutons Drive
 * annoncent donc « bientôt disponible — une mise à jour de la base est nécessaire », ce qui est la vérité.
 */
export function depotsDriveDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_piece_drive', () => tableExiste('gestion_piece_drive'));
}

/**
 * LOT 5-PJ-B — le journal accepte-t-il l'entité « piece_drive » ? Élargie par la MÊME migration 245, mais sondée à
 * part : on sonde la RÈGLE, pas une colonne, parce que c'est elle, et elle seule, qui refuserait l'écriture. Même
 * précaution que pour `journalEnvoiDisponible` — un journal qui échoue ne doit jamais faire échouer le geste.
 */
export function journalPieceDriveDisponible(): Promise<boolean> {
  return memoiser('journal.entite_piece_drive', async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM pg_constraint
          WHERE conrelid = to_regclass('public.gestion_journal')
            AND conname = 'gestion_journal_entite_chk'
            AND pg_get_constraintdef(oid) LIKE '%''piece_drive''%'`);
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false; // base injoignable : on se range sur l'entité qui marche partout
    }
  });
}

/**
 * LOT 5-PJ-C — la migration 246 est-elle appliquée ? Elle seule porte les comptes Google PERSONNELS.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE COMPORTEMENT D'AVANT EST CONSERVÉ : le sélecteur continue d'utiliser le jeton de
 * `gestion@`, exactement comme aujourd'hui. On ne retire rien, on n'affiche pas un bouton qui échouerait — on ajoute
 * seulement, une fois la table là, la possibilité pour chacun de relier son propre compte.
 */
export function comptesGoogleDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_google_compte', () => tableExiste('gestion_google_compte'));
}

/** LOT 5-PJ-C — le journal accepte-t-il « compte_google » ? On sonde la RÈGLE, pas une colonne (cf. lot 5e). */
export function journalCompteGoogleDisponible(): Promise<boolean> {
  return memoiser('journal.entite_compte_google', async () => {
    try {
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM pg_constraint
          WHERE conrelid = to_regclass('public.gestion_journal')
            AND conname = 'gestion_journal_entite_chk'
            AND pg_get_constraintdef(oid) LIKE '%''compte_google''%'`);
      return (rows[0]?.n ?? 0) > 0;
    } catch {
      return false;
    }
  });
}

/**
 * LOT 5-PJ-D — la migration 248 est-elle appliquée ? Elle porte le RÉGLAGE du nombre de dossiers récents proposés à
 * l'ouverture du sélecteur.
 *
 * ⚠️ Elle ne conditionne AUCUNE fonctionnalité : sans elle, la vue d'ouverture propose six dossiers, ce qui est
 * exactement la valeur par défaut de la colonne. Elle est sondée À PART plutôt qu'ajoutée à `chargerConfigGestion` —
 * dont le repli est tout-ou-rien et ferait perdre, en attendant, les réglages des migrations 230 à 241.
 */
export function reglageRecentsDisponible(): Promise<boolean> {
  return memoiser('config.drive_dossiers_recents_max', () => colonneExiste('gestion_config', 'drive_dossiers_recents_max'));
}

/**
 * LOT 5-PJ-ENVOI — la migration 252 est-elle appliquée ? Elle seule porte les PIÈCES JOINTES d'un brouillon.
 *
 * 🔴 TANT QU'ELLE MANQUE, L'ÉDITEUR EST EXACTEMENT CELUI D'AVANT : aucun bouton « joindre », aucun glisser-déposer,
 * aucune entrée « Transférer en tant que pièce jointe », et l'envoi TEXTE fonctionne à l'identique. Proposer de
 * joindre un fichier qu'on ne saurait pas mémoriser ferait perdre le fichier ET le message.
 */
export function piecesEnvoiDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_brouillon_piece', () => tableExiste('gestion_brouillon_piece'));
}

/**
 * LOT 5-BOITE-3 — la migration 251 est-elle appliquée ? Elle seule porte la CORBEILLE interne.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE COMPORTEMENT D'AVANT EST EXACTEMENT CONSERVÉ : l'entrée « Supprimer » n'apparaît pas
 * dans le menu, l'étiquette « Corbeille » non plus, et aucune requête ne nomme la colonne absente — ce qui ferait
 * échouer TOUTE la boîte, pas seulement le geste nouveau. Proposer « Supprimer » sans pouvoir s'en souvenir serait
 * pire : le clic suivant rendrait l'échange comme si de rien n'était.
 */
export function corbeilleDisponible(): Promise<boolean> {
  return memoiser('fil.corbeille_le', () => colonneExiste('gestion_fil', 'corbeille_le'));
}

/**
 * LOT 5-BOITE — la migration 250 est-elle appliquée ? Elle seule porte le LU / NON LU par collaborateur.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE COMPORTEMENT D'AVANT EST EXACTEMENT CONSERVÉ : aucune ligne n'est en gras, aucun
 * compteur de non-lus n'apparaît, et le menu « ⋯ » ne propose pas « Marquer comme non lu ». Rien n'échoue, rien ne
 * s'affiche à moitié — proposer un geste qui ne pourrait pas être mémorisé serait pire que de ne rien montrer.
 *
 * On sonde la TABLE : c'est elle qui porte l'état. Le repère d'historique (`gestion_config.lecture_service_le`)
 * arrive par la même migration, donc au même moment.
 */
export function lectureDisponible(): Promise<boolean> {
  return memoiser('table.gestion_message_lu', () => tableExiste('gestion_message_lu'));
}

/**
 * LOT 5-VEILLE — la migration 249 est-elle appliquée ? Elle porte la TOLÉRANCE de la veille : combien d'intervalles
 * de retard avant que l'écran n'annonce que la relève automatique est arrêtée.
 *
 * ⚠️ Elle ne conditionne AUCUNE fonctionnalité : sans elle, la tolérance vaut 10 intervalles, exactement le défaut de
 * la colonne. Sondée À PART plutôt qu'ajoutée à `chargerConfigGestion`, dont le repli est tout-ou-rien et ferait
 * perdre, en attendant, les réglages des migrations 230 à 241.
 */
export function reglageVeilleDisponible(): Promise<boolean> {
  return memoiser('config.veille_releve_intervalles', () => colonneExiste('gestion_config', 'veille_releve_intervalles'));
}

/** LOT 5-PJ-C — le registre des dépôts sait-il dire AVEC QUEL COMPTE Google le dépôt a été fait (migration 246) ? */
export function compteGoogleDuDepotDisponible(): Promise<boolean> {
  return memoiser('piece_drive.compte_google', () => colonneExiste('gestion_piece_drive', 'compte_google'));
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

/**
 * LOT ANNUAIRE-1 — la migration 253 est-elle appliquée ? Elle seule porte l'annuaire WIPPIMMO.
 *
 * 🔴 ELLE CONDITIONNE TOUT L'ÉCRAN « ANNUAIRE », et c'est assumé : sans elle il n'y a RIEN à montrer — ni
 * propriétaire, ni lot, ni locataire. L'entrée du menu reste donc visible mais DIT « annuaire pas encore installé »,
 * ce qui est la vérité, plutôt que de disparaître (une entrée qui s'évapore donne à croire qu'on l'a rêvée) ou
 * d'ouvrir un écran vide (qui ferait croire à un annuaire sans personne dedans).
 *
 * On sonde la table des propriétaires : les six tables de l'annuaire naissent dans UNE transaction, elles arrivent
 * donc ensemble.
 */
export function annuaireDisponible(): Promise<boolean> {
  return memoiser('table.gestion_annuaire_proprietaire', () => tableExiste('gestion_annuaire_proprietaire'));
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
