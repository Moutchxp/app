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

/**
 * LOT DRIVE-1 — la migration 254 est-elle appliquée ? Elle seule porte la MÉMOIRE de l'arborescence Drive, qui est
 * aussi la LISTE BLANCHE du garde-fou.
 *
 * 🔴 SANS ELLE, AUCUNE ÉCRITURE DRIVE N'EST POSSIBLE, et c'est voulu : le garde-fou ② exige que le dossier parent
 * figure dans une table qui n'existe pas encore. La commande de construction le DIT et s'arrête — elle ne « fait pas
 * au mieux ». Une arborescence bâtie sans mémoire serait impossible à reprendre et se dédoublerait au second essai.
 */
export function arbreDriveDisponible(): Promise<boolean> {
  return memoiser('table.gestion_drive_arbre', () => tableExiste('gestion_drive_arbre'));
}

/**
 * LOT DRIVE-2 — la migration 255 est-elle appliquée ? Elle seule porte la VÉRIFICATION des copies (`verifie_le`) et
 * le journal des passes, qui sert aussi de verrou.
 *
 * 🔴 SANS ELLE, LA COPIE DE MASSE NE DÉMARRE PAS, et c'est voulu : sans `verifie_le`, « copié » ne voudrait rien
 * dire — on ne saurait pas distinguer une copie contrôlée d'un envoi accepté par Drive mais corrompu, ni quoi
 * refaire au passage suivant. Le geste MANUEL du lot 5-PJ-B, lui, continue de fonctionner exactement comme avant :
 * il n'écrit aucune des colonnes nouvelles.
 *
 * On sonde `verifie_le` : la migration ajoute les six colonnes dans UNE transaction, elles arrivent ensemble.
 */
export function copiePiecesDisponible(): Promise<boolean> {
  return memoiser('piece_drive.verifie_le', () => colonneExiste('gestion_piece_drive', 'verifie_le'));
}

/**
 * LOT DRIVE-2-bis — la migration 256 est-elle appliquée ? Elle porte la TRACE MAIL EXHAUSTIVE, les propositions de
 * tri et l'inventaire de production.
 *
 * 🔴 SANS ELLE, LA COPIE NE DÉMARRE PAS — non par prudence excessive, mais parce que la décision d'Arno du 26/09
 * est que la copie DÉPOSE dans un dossier d'arrivée en mémorisant une PROPOSITION. Sans table où l'écrire, la
 * copie perdrait le seul travail que ce lot lui demande de faire, et il faudrait tout recommencer.
 *
 * On sonde la table des adresses : la migration crée les trois tables dans UNE transaction, elles arrivent ensemble.
 */
export function adressesMessagesDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_message_adresse', () => tableExiste('gestion_message_adresse'));
}

/**
 * LOT RATTACHEMENT-1 — la migration 257 est-elle appliquée ? Elle seule porte les RATTACHEMENTS d'un mail (lots,
 * propriétaires, événements) et le mémo d'examen qui alimente la file de tri.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE MODULE EST EXACTEMENT CELUI D'AVANT. Le bandeau « Rattaché à » ne s'affiche pas, la
 * file « À trier » dit « pas encore installée », et AUCUNE requête ne nomme les tables absentes — ce qui ferait
 * échouer toute la conversation, pas seulement le bandeau nouveau (incident du 24/09/2026). Rien n'est retiré :
 * l'affectation aux cartes, le classement, les pièces jointes, l'annuaire fonctionnent à l'identique.
 *
 * On sonde la table des rattachements : la migration crée les deux tables dans UNE transaction, elles arrivent
 * donc ensemble.
 */
export function rattachementsDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_rattachement', () => tableExiste('gestion_rattachement'));
}

/**
 * LOT DRIVE-3 — la migration 260 est-elle appliquée ? Elle porte le REGISTRE du vidage : quelles pièces n'ont plus
 * leur contenu dans MinIO, et vers quel fichier Drive l'application doit lire à leur place.
 *
 * 🔴 SANS ELLE, L'APPLICATION SERT LES PIÈCES DEPUIS MinIO EXACTEMENT COMME AVANT, et la commande de vidage refuse
 * de s'exécuter — elle n'aurait nulle part où inscrire la preuve de ce qu'elle efface, et un effacement sans preuve
 * est un effacement qu'on ne peut pas défendre.
 *
 * ⚠️ LA SONDE EST CONSULTÉE AVANT CHAQUE LECTURE DE PIÈCE. Elle ne mémorise que le « oui » (cf. `sondeSchema`) : la
 * migration peut être appliquée pendant que l'écran est ouvert, et le téléchargement suivant en tiendra compte.
 */
export function vidageDisponible(): Promise<boolean> {
  return memoiser('table.gestion_piece_vidage', () => tableExiste('gestion_piece_vidage'));
}

/**
 * LOT ENVOI-DIAG — la migration 261 est-elle appliquée ? Elle porte les AVIS DE NON-REMISE lus et rattachés.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE COMPORTEMENT D'AVANT EST EXACTEMENT CONSERVÉ : aucune mention « non distribué »
 * n'apparaît, aucune requête ne nomme la table, et la relève ne tente aucune lecture d'avis. Les avis restent ce
 * qu'ils étaient — des messages ordinaires dans la boîte, visibles comme tels.
 */
export function nonRemiseDisponible(): Promise<boolean> {
  return memoiser('table.gestion_non_remise', () => tableExiste('gestion_non_remise'));
}

/**
 * LOT COPIE-SURV — la migration 259 est-elle appliquée ? Elle porte les MOTIFS d'échec de la copie, un par ligne.
 *
 * 🔴 ELLE NE CONDITIONNE RIEN, ET C'EST ESSENTIEL. Une passe de copie tourne peut-être en ce moment, avec le code
 * d'avant ce lot : elle ne doit être gênée d'aucune façon. Sans la migration, les motifs continuent d'aller au
 * terminal, exactement comme avant, et la copie se comporte à l'identique. La sonde est consultée AVANT chaque
 * écriture — jamais au milieu d'une transaction, où un repli ne pourrait plus s'exécuter.
 */
export function copieEchecsDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_drive_copie_echec', () => tableExiste('gestion_drive_copie_echec'));
}

/**
 * LOT RATTACHEMENT-2 — la migration 258 est-elle appliquée ? Elle porte le VERDICT de l'enchaînement qui suit une
 * passe de relève (relevé des adresses, puis rattachement), dans trois colonnes distinctes de celles de la relève.
 *
 * ⚠️ ELLE NE CONDITIONNE PAS L'ENCHAÎNEMENT LUI-MÊME : celui-ci tourne sans elle, et son issue est alors consignée
 * dans `gestion_journal` (entité « rattachement », action « suite »). Ce qui manque en son absence, et seulement
 * cela : la ligne de bandeau qui signale un échec. On sonde `suite_resultat` — les trois colonnes naissent dans UNE
 * transaction, elles arrivent donc ensemble.
 */
export function suiteReleveDisponible(): Promise<boolean> {
  return memoiser('releve_run.suite_resultat', () => colonneExiste('gestion_releve_run', 'suite_resultat'));
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

/**
 * LOT CLASSEMENT-1 — la migration 262 est-elle appliquée ? Elle porte le REGISTRE DES DÉPLACEMENTS de pièces.
 *
 * 🔴 ELLE NE CONDITIONNE PAS LE PLAN. La simulation (`gestion:classement:plan`) ne lit que l'existant et n'écrit
 * rien : elle tourne sans cette table, et le rapport de nuit du 27/09/2026 a été produit sans elle. La sonde ne sert
 * qu'au jour où les déplacements réels seront autorisés — sans la table, aucune écriture n'est tentée.
 */
export function classementDisponible(): Promise<boolean> {
  return memoiser('table.gestion_piece_classement', () => tableExiste('gestion_piece_classement'));
}

/**
 * LOT ERGO-BOITE-3 — la migration 263 est-elle appliquée ? Elle porte `gestion_message.spam_le`, le seul endroit où
 * l'on note qu'un message était du spam chez Gmail.
 *
 * 🔴 CE QU'ELLE COMMANDE, ET C'EST BEAUCOUP. Tant qu'elle répond « non » :
 *   · la relève N'OUVRE PAS le dossier de spam — écrire la constatation serait impossible, la lire n'aurait pas de
 *     sens, et ouvrir un dossier pour rien coûterait une connexion à chaque passe ;
 *   · la colonne n'est NOMMÉE NULLE PART, ni en lecture ni en écriture. C'est la leçon de la migration 251 : nommer
 *     une colonne absente ne casse pas la fonction nouvelle, il casse TOUTE la boîte, y compris pour qui arrive par
 *     une vieille adresse ;
 *   · l'entrée « Spam » reste visible mais sans compteur, et sa liste est vide plutôt que fausse.
 */
export function spamDisponible(): Promise<boolean> {
  return memoiser('message.spam_le', () => colonneExiste('gestion_message', 'spam_le'));
}

/**
 * LOT LISTE-GMAIL — la migration 264 est-elle appliquée ? Elle porte `gestion_fil_etoile`, l'étoile de l'ÉQUIPE
 * sur un échange.
 *
 * 🔴 CE N'EST PAS L'ÉTOILE DE GMAIL. Celle-là (libellé STARRED sur un MESSAGE) existe déjà et n'a pas besoin de
 * migration. Celle-ci est un état de NOTRE application, posé sur un ÉCHANGE, partagé et daté.
 *
 * Tant que la sonde répond « non » : la table n'est nommée nulle part, aucun échange n'est rendu étoilé, et le
 * bouton de la barre d'actions est rendu DÉSACTIVÉ avec une info-bulle qui dit pourquoi — plutôt qu'absent, ce qui
 * enverrait chercher un bug, ou actif, ce qui promettrait un geste impossible.
 */
export function etoileDisponible(): Promise<boolean> {
  return memoiser('table.gestion_fil_etoile', () => tableExiste('gestion_fil_etoile'));
}

/**
 * ══ LOT REDACTION-GMAIL — LA MIGRATION 265 EST-ELLE APPLIQUÉE ? ════════════════════════════════════════════════
 * Elle porte DEUX choses indépendantes, et elles se sondent SÉPARÉMENT : l'une peut exister sans l'autre si
 * quelqu'un applique la migration à moitié, et une sonde unique mentirait alors dans un sens ou dans l'autre.
 *
 * ① `gestion_brouillon.corps_html` — le corps en texte mis en forme.
 * Tant que la sonde répond « non » : l'éditeur riche fonctionne À L'ÉCRAN et l'envoi part bien en HTML (il lit ce
 * qui est à l'écran, pas la base), mais le brouillon ENREGISTRÉ ne garde que sa version texte. L'éditeur le DIT,
 * plutôt que de laisser croire que la mise en forme survivra au rechargement.
 */
export function brouillonHtmlDisponible(): Promise<boolean> {
  return memoiser('brouillon.corps_html', () => colonneExiste('gestion_brouillon', 'corps_html'));
}

/**
 * ② `gestion_brouillon_cible` — les cibles de « Classer ce mail », gardées avec le brouillon.
 *
 * Tant que la sonde répond « non » : le champ n'est PAS affiché du tout. Proposer un classement qu'on ne saurait
 * pas garder serait promettre un geste qui se perdrait au premier rechargement — pire qu'une fonction absente.
 */
export function brouillonCibleDisponible(): Promise<boolean> {
  return memoiser('table.gestion_brouillon_cible', () => tableExiste('gestion_brouillon_cible'));
}

/**
 * 🔴 LOT STATUT-HORS-GESTION — la migration 266 est-elle appliquée ? Elle seule porte le marquage « Hors gestion » :
 * ce mail ne concerne AUCUN bien (prospection, collègue, divers), décidé À LA MAIN par un collaborateur.
 *
 * 🔴 TANT QU'ELLE MANQUE, LE MODULE EST EXACTEMENT CELUI D'AVANT : aucune capsule grise nulle part, le filtre
 * « Hors gestion » de l'écran partagé ne s'affiche pas, l'option de la fenêtre de classement est GRISÉE avec une
 * info-bulle qui dit pourquoi — et AUCUNE requête ne nomme la table absente, ce qui ferait échouer tout l'écran et
 * pas seulement la nouveauté (incident du 24/09/2026).
 */
export function horsGestionDisponible(): Promise<boolean> {
  return memoiser('table.gestion_hors_gestion', () => tableExiste('gestion_hors_gestion'));
}

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — la migration 267 est-elle appliquée ? Elle porte le LIBELLÉ DE LA COLONNE
 * WIPPIMMO d'où vient chaque coordonnée (« Mobile 1 », « Email 2 »).
 *
 * 🔴 TANT QU'ELLE MANQUE, la fiche retombe sur un libellé générique dérivé de la sorte et du rang
 * (« E-mail », « E-mail 2 ») : jamais une coordonnée orpheline, et jamais une attribution inventée — la
 * reconnaissance du 28/09/2026 a établi que l'export ne permet PAS de relier une coordonnée à une personne.
 */
export function libelleSourceContactDisponible(): Promise<boolean> {
  return memoiser('contact.libelle_source', () => colonneExiste('gestion_annuaire_contact', 'libelle_source'));
}

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — la migration 268 est-elle appliquée ? Elle qualifie un événement (catégorie,
 * urgence) et dit SUR QUOI il porte (le bien, son propriétaire, son locataire — `gestion_evenement_partie`).
 *
 * 🔴 TANT QU'ELLE MANQUE, LE MODULE EST EXACTEMENT CELUI D'AVANT : l'écran ne propose ni catégorie ni urgence,
 * la recherche d'événements ne peut pas mettre en tête ceux du bien (elle reste la recherche d'avant, qui marche),
 * et AUCUNE requête ne nomme les colonnes ni la table absentes — ce qui ferait échouer tout l'écran.
 *
 * On sonde la TABLE : la migration crée les colonnes et la table dans UNE transaction, elles arrivent ensemble.
 */
export function evenementQualifieDisponible(): Promise<boolean> {
  return memoiser('table.gestion_evenement_partie', () => tableExiste('gestion_evenement_partie'));
}

/**
 * 🔴 LOT EDITEUR-PJ — la migration 269 est-elle appliquée ? Elle tient l'historique des pièces et des dossiers
 * qu'une personne a réellement joints à un mail (`gestion_piece_recente`).
 *
 * 🔴 TANT QU'ELLE MANQUE, LES DEUX ÉCRANS SONT EXACTEMENT CEUX D'AVANT : la section « Récents » ne s'affiche pas —
 * ni dans le sélecteur Drive, ni sous « Joindre un fichier » — et AUCUNE requête ne nomme la table absente. On
 * navigue dossier par dossier et l'on passe par le sélecteur du Mac, comme aujourd'hui.
 */
export function piecesRecentesDisponibles(): Promise<boolean> {
  return memoiser('table.gestion_piece_recente', () => tableExiste('gestion_piece_recente'));
}

/**
 * 🔴 LOT ENVOI-ARRIERE-PLAN — la migration 271 est-elle appliquée ? Elle porte la FILE D'ENVOI persistante
 * (`gestion_envoi_file`) et l'ÉTAT des pièces d'un brouillon (`gestion_brouillon_piece.etat`).
 *
 * 🔴 TANT QU'ELLE MANQUE, LE MODULE EST EXACTEMENT CELUI D'AVANT :
 *   · l'envoi reste SYNCHRONE — la requête du navigateur attend la remise à Gmail, attente visible comprise ;
 *   · une pièce du Drive se joint en un seul temps : le navigateur attend les octets, comme aujourd'hui ;
 *   · et AUCUNE requête ne nomme la table ni les colonnes absentes, ce qui ferait échouer tout l'écran.
 *
 * ⚠️ UNE SEULE SONDE POUR LES DEUX, parce que la migration les crée dans UNE transaction : elles arrivent
 * ensemble ou pas du tout. On sonde la TABLE, qui est le morceau le plus visible.
 */
export function fileEnvoiDisponible(): Promise<boolean> {
  return memoiser('table.gestion_envoi_file', () => tableExiste('gestion_envoi_file'));
}

/**
 * 🔴🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — la migration 272 est-elle appliquée ? Elle porte le JOURNAL des dossiers
 * créés dans le Drive (`gestion_drive_dossier_cree`) : qui, quand, quel nom, quel identifiant, dans quel parent.
 *
 * 🔴 CETTE SONDE EST DIFFÉRENTE DE TOUTES LES AUTRES DU MODULE, et il faut le dire : ailleurs, une migration
 * manquante ne fait que rendre l'écran à ce qu'il était. Ici elle conditionne une ÉCRITURE DANS LE DRIVE DU CABINET.
 * Tant qu'elle manque, le bouton « + Nouveau dossier » est DÉSACTIVÉ avec son motif, et la route refuse même si on
 * l'appelle directement — on ne crée pas dans le Drive ce qu'on ne saurait pas consigner. Un dossier apparu sans
 * ligne de journal serait un dossier que personne ne pourrait expliquer.
 *
 * ⚠️ TOUT LE RESTE EST INCHANGÉ : « Visualiser », « Joindre », « Insérer un lien », la navigation, la recherche et
 * les lignes prioritaires ne dépendent pas d'elle — elle ne concerne que la création.
 */
export function journalDossierDriveDisponible(): Promise<boolean> {
  return memoiser('table.gestion_drive_dossier_cree', () => tableExiste('gestion_drive_dossier_cree'));
}
