/**
 * MODULE « GESTION » — LOT 5-PJ-B : la mémoire des dépôts Drive. Module SERVEUR, seul fichier du lot qui écrit.
 *
 * 🔒 PÉRIMÈTRE D'ÉCRITURE : une ligne de `gestion_piece_drive`, et une ligne de `gestion_journal`. Rien d'autre.
 * Aucune pièce n'est modifiée, aucun original n'est effacé (ce sera le lot D, et ce sera une décision à part).
 *
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION. La migration 245 est livrée NON APPLIQUÉE : entre la
 * livraison et son application par Arno, nommer la table ferait échouer la requête, donc la route, donc l'écran.
 * Tant qu'elle manque, l'écran dit « bientôt disponible — une mise à jour de la base est nécessaire », et aucun
 * bouton ne promet un geste qui échouerait au clic.
 */
import { query } from '../db/client';
import { nombreRecentsValide, RECENTS_DEFAUT, type CandidatRecent } from './dossiersRecents';
import {
  compteGoogleDuDepotDisponible, copiePiecesDisponible, depotsDriveDisponibles, journalPieceDriveDisponible,
  nomDeposeDisponible, reglageRecentsDisponible,
} from './schema';
// 🔴 LOT PASTILLE-DRIVE-EN-DIRECT — la MÊME normalisation d'empreinte que l'index (module PUR).
import { empreinteNormalisee } from './indexEmpreintesDrive';
/* 🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — « cette copie existe-t-elle encore ? », écrit UNE fois pour tout le module. */
import { sqlCopieVivante } from './copieDisparueSql';

/** Un dépôt, tel que l'écran l'affiche : « Dans le Drive · ouvrir », avec le nom du dossier. */
export interface DepotDrive {
  pieceId: number;
  driveFileId: string;
  dossierId: string;
  dossierNom: string | null;
  webViewLink: string | null;
  deposeLe: string;
  deposePar: string;
}

/**
 * Les dépôts connus pour un ensemble de pièces. Une seule requête pour tout un message : pas une par carte.
 *
 * ══ 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — UNE COPIE DISPARUE N'EST PLUS UN DÉPÔT ═════════════════════════════════
 *
 * 🔴 DÉFAUT TROUVÉ EN INSTRUISANT LE POINT 1, SUR LE VRAI DRIVE. Cette lecture était le SEUL des huit endroits du
 * module à joindre `gestion_piece_drive` SANS le fragment `sqlCopieVivante` (migration 288). Conséquences, les
 * deux mesurées le 03/10/2026 après avoir mis une copie à la corbeille depuis la fenêtre :
 *
 *   ① la carte de la pièce annonçait encore « Dans le Drive · _MESURE dossier instantane · ouvrir » — un lien
 *      vers un fichier qui est à la corbeille (c'est la ligne la plus RÉCENTE qui gagne, `ORDER BY depose_le
 *      DESC`, et c'était justement celle qu'on venait de jeter) ;
 *   ② `lireDepotExistant` — qui s'appuie sur cette lecture — aurait répondu « déjà là » pour ce dossier :
 *      autrement dit, l'application aurait REFUSÉ de ranger de nouveau un document qui n'y est plus. C'est la
 *      conséquence la plus coûteuse, parce qu'elle est silencieuse.
 *
 * ⚠️ LA LIGNE RESTE EN BASE, et c'est intact : elle dit un fait daté (« nous avons déposé une copie ici, ce
 * jour-là »). On cesse de la LIRE, on ne l'efface pas — règle du lot FICHE-SAISIE-UNIFORME.
 * ⚠️ SANS LA MIGRATION 288, le fragment rend `true` et la requête est mot pour mot celle d'avant ce lot.
 */
export async function lireDepotsDesPieces(pieceIds: readonly number[]): Promise<DepotDrive[]> {
  if (pieceIds.length === 0) return [];
  if (!await depotsDriveDisponibles()) return []; // migration 245 absente : aucun dépôt ne peut exister
  const vivante = await sqlCopieVivante('gestion_piece_drive');
  const { rows } = await query<{
    piece_id: number; drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null;
    web_view_link: string | null; depose_le: string; depose_par_libelle: string;
  }>(
    `SELECT piece_id::int AS piece_id, drive_file_id, drive_dossier_id, dossier_nom, web_view_link,
            to_char(depose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS depose_le, depose_par_libelle
       FROM gestion_piece_drive
      WHERE piece_id = ANY($1::bigint[])
        AND ${vivante}
      ORDER BY piece_id, depose_le DESC`,
    [pieceIds],
  );
  return rows.map((r) => ({
    pieceId: r.piece_id, driveFileId: r.drive_file_id, dossierId: r.drive_dossier_id, dossierNom: r.dossier_nom,
    webViewLink: r.web_view_link, deposeLe: r.depose_le, deposePar: r.depose_par_libelle,
  }));
}

/** Le dépôt DÉJÀ FAIT de cette pièce dans CE dossier, s'il existe. C'est lui qu'on propose au lieu d'un doublon. */
export async function lireDepotExistant(pieceId: number, dossierId: string): Promise<DepotDrive | null> {
  if (!await depotsDriveDisponibles()) return null;
  const tous = await lireDepotsDesPieces([pieceId]);
  return tous.find((d) => d.dossierId === dossierId) ?? null;
}

/**
 * ══ 🔴 LOT PIECES-DE-LA-CONVERSATION — LES DÉPÔTS DE TOUT UN ÉCHANGE, EN UNE REQUÊTE ═════════════════════════════
 *
 * Le récapitulatif montre les pièces des DOUZE messages d'un échange, et chacune doit dire si elle est déjà dans le
 * Drive. Relire message par message (`lireDepotsDesPieces` depuis la route d'un message) aurait fait douze
 * allers-retours pour une fenêtre qui s'ouvre d'un clic — et douze fois la même sonde de schéma.
 *
 * ⚠️ MÊME FORME DE RÉPONSE que `lireDepotsDesPieces` : c'est le même objet que l'écran affiche déjà sur la carte
 * d'une pièce (« Dans le Drive · dossier · ouvrir »). Une seconde forme aurait donné deux mentions à tenir à jour.
 */
export async function lireDepotsDuFil(filId: number): Promise<DepotDrive[]> {
  if (!await depotsDriveDisponibles()) return []; // migration 245 absente : aucun dépôt ne peut exister
  const { rows } = await query<{
    piece_id: number; drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null;
    web_view_link: string | null; depose_le: string; depose_par_libelle: string;
  }>(
    `SELECT d.piece_id::int AS piece_id, d.drive_file_id, d.drive_dossier_id, d.dossier_nom, d.web_view_link,
            to_char(d.depose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS depose_le,
            d.depose_par_libelle
       FROM gestion_piece_drive d
       JOIN gestion_piece p ON p.id = d.piece_id
       JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = $1
      ORDER BY d.piece_id, d.depose_le DESC`,
    [filId],
  );
  return rows.map((r) => ({
    pieceId: r.piece_id, driveFileId: r.drive_file_id, dossierId: r.drive_dossier_id, dossierNom: r.dossier_nom,
    webViewLink: r.web_view_link, deposeLe: r.depose_le, deposePar: r.depose_par_libelle,
  }));
}

/**
 * LE DERNIER DOSSIER UTILISÉ POUR CET ÉCHANGE. Le sélecteur s'ouvre là — dans la vraie vie, les pièces d'un même
 * échange vont presque toujours au même endroit, et redescendre treize niveaux à chaque pièce serait absurde.
 *
 * DÉRIVÉ, jamais stocké : aucune colonne « dernier dossier » à tenir à jour, donc aucune à laisser mentir.
 */
export async function dernierDossierDuFil(filId: number): Promise<{ id: string; nom: string | null } | null> {
  if (!await depotsDriveDisponibles()) return null;
  const { rows } = await query<{ drive_dossier_id: string; dossier_nom: string | null }>(
    `SELECT d.drive_dossier_id, d.dossier_nom
       FROM gestion_piece_drive d
       JOIN gestion_piece p ON p.id = d.piece_id
       JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = $1
      ORDER BY d.depose_le DESC
      LIMIT 1`,
    [filId],
  );
  const r = rows[0];
  return r ? { id: r.drive_dossier_id, nom: r.dossier_nom } : null;
}

/**
 * LOT 5-PJ-D — LES DERNIERS DOSSIERS OÙ UN DÉPÔT A RÉUSSI, tous collaborateurs confondus, le plus récent d'abord.
 *
 * 🔴 DÉRIVÉ DE LA MÉMOIRE DES DÉPÔTS, comme `dernierDossierDuFil`. Aucune liste de « dossiers favoris » n'est tenue à
 * la main : un dossier est récent parce qu'un fichier y est parti, et rien d'autre. Une liste entretenue à part
 * commencerait à mentir le jour où quelqu'un déposerait ailleurs.
 *
 * 🔴 TOUS COLLABORATEURS CONFONDUS, ET C'EST VOULU : l'équipe classe dans les mêmes dossiers. Les DROITS, eux, ne
 * sont pas communs — ils sont vérifiés ensuite, un par un, avec le jeton de la personne qui regarde (cf.
 * `dossiersRecents.ts`). D'où le mot « candidats » : cette liste n'est PAS ce qui s'affiche.
 *
 * `DISTINCT ON` rend, pour chaque dossier, la ligne de son dépôt le PLUS RÉCENT — donc le nom et le Drive connus à ce
 * moment-là. C'est le nom rendu par Google qui s'affichera ; celui-ci n'est qu'un repli.
 */
export async function dossiersRecentsDeposes(limite: number): Promise<CandidatRecent[]> {
  if (limite <= 0) return [];
  if (!await depotsDriveDisponibles()) return []; // migration 245 absente : aucun dépôt ne peut exister
  const { rows } = await query<{
    drive_dossier_id: string; dossier_nom: string | null; drive_id: string | null; dernier: string;
  }>(
    `SELECT drive_dossier_id, dossier_nom, drive_id, dernier
       FROM (
         SELECT DISTINCT ON (drive_dossier_id)
                drive_dossier_id, dossier_nom, drive_id,
                to_char(depose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier
           FROM gestion_piece_drive
          ORDER BY drive_dossier_id, depose_le DESC
       ) d
      ORDER BY dernier DESC
      LIMIT $1`,
    [limite],
  );
  return rows.map((r) => ({
    id: r.drive_dossier_id, nom: r.dossier_nom, driveId: r.drive_id, dernierDepot: r.dernier,
  }));
}

/**
 * LOT 5-PJ-D — COMBIEN de dossiers récents la vue d'ouverture propose. RÉGLAGE en base (migration 248), jamais un
 * chiffre en dur : six est le choix d'Arno aujourd'hui, pas une vérité.
 *
 * ⚠️ LU À PART, et surtout PAS ajouté à la requête de `chargerConfigGestion`. Celle-ci retombe sur un SELECT réduit
 * dès qu'UNE colonne manque (erreur 42703) : y glisser une colonne non encore créée ferait perdre, le temps que la
 * migration soit appliquée, TOUS les réglages des migrations 230 à 241. Une sonde isolée ne coûte qu'une question.
 */
export async function lireMaxDossiersRecents(): Promise<number> {
  if (!await reglageRecentsDisponible()) return RECENTS_DEFAUT;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT drive_dossiers_recents_max AS n FROM gestion_config WHERE id = 1`);
    return nombreRecentsValide(rows[0]?.n);
  } catch {
    return RECENTS_DEFAUT; // le réglage n'est pas la fonctionnalité : on ouvre le sélecteur, avec le défaut
  }
}

export interface ADeposer {
  pieceId: number;
  driveFileId: string;
  dossierId: string;
  dossierNom: string | null;
  driveId: string | null;
  webViewLink: string | null;
  auteurId: number | null;
  auteurLibelle: string;
  /**
   * LOT 5-PJ-C — l'adresse Google AVEC LAQUELLE le dépôt part. C'est elle qui apparaîtra comme propriétaire du
   * fichier dans le Drive : sans elle, on saurait qui a cliqué sans savoir sous quelle identité le fichier est parti.
   */
  compteGoogle?: string | null;
  /**
   * ══ 🔴🔴 LOT RENOMMER-AVANT-RANGER — LE NOM SOUS LEQUEL LA COPIE EST PARTIE ═══════════════════════════════
   *
   * Demande d'Arno : « le journal de dépôt garde le nom d'origine ET le nom donné ».
   *
   * 🔴 LE NOM D'ORIGINE N'EST PAS RECOPIÉ ICI : il vit déjà dans `gestion_piece.nom_fichier`, et il n'a pas
   * bougé — le renommage ne touche jamais la pièce reçue. Le dupliquer créerait une seconde vérité qui
   * divergerait au premier renommage de l'autre côté. Une jointure donne les deux noms.
   *
   * ⚠️ `null` OU ÉGAL AU NOM D'ORIGINE ⇒ ON N'ÉCRIT RIEN : une colonne remplie à l'identique sur des milliers de
   * lignes ne dirait qu'une chose — « personne n'a renommé » — que l'absence dit déjà.
   * ⚠️ SANS LA MIGRATION 280, la colonne n'est NOMMÉE NULLE PART et la requête est mot pour mot celle d'avant.
   */
  nomDepose?: string | null;
  /**
   * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — L'EMPREINTE DE LA COPIE, ÉCRITE AU DÉPÔT ════════════════════════════
   *
   * DEMANDE D'ARNO (03/10/2026) : « enregistrer IMMÉDIATEMENT la copie (fileId, md5, parents, nom) au registre
   * et dans l'index ».
   *
   * 🔴 LA COLONNE EXISTAIT DEPUIS LA MIGRATION 255, ET SEULE LA COPIE AUTOMATIQUE LA REMPLISSAIT
   * (`enregistrerCopie`, `copiePiecesReel.ts`). Un rangement à la main écrivait donc une ligne à `md5` NULL —
   * vérifié en base sur le cas d'Arno : `gestion_piece_drive` id 26554, déposée le 03/10 à 21:37:35, `md5` vide.
   *
   * 🔴 CE QUE CELA COÛTAIT. `fichiersDriveDeLaPiece` et `emplacementsDesPieces` cherchent « le même contenu »
   * par `lower(d.md5)` : une copie sans empreinte n'est retrouvée que par son lien `piece_id`. La MÊME pièce
   * revenue plus tard sous un autre nom — c'est-à-dire tout le lot EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE — ne
   * pouvait donc PAS reconnaître notre propre copie avant que l'agent `changes.list` n'ait indexé le fichier.
   *
   * ⚠️ SANS LA MIGRATION 255, LA COLONNE N'EST NOMMÉE NULLE PART et la requête est mot pour mot celle d'avant ce
   * lot — même règle que `compte_google` et `nom_depose` ci-dessus, et pour la même raison.
   * ⚠️ `null` EST NORMAL : un document Google natif n'a pas d'empreinte. On n'écrit alors rien, plutôt qu'une
   * chaîne vide qui s'apparierait avec les autres chaînes vides.
   */
  md5?: string | null;
}

/** Ce que l'écriture rapporte. `doublon` = la base a refusé : le fichier était déjà là, et c'est une bonne nouvelle. */
export type IssueMemorisation =
  | { etat: 'enregistre' }
  | { etat: 'doublon' }
  | { etat: 'sans_schema' };

/**
 * MÉMORISE un dépôt, et le JOURNALISE.
 *
 * 🔴 `ON CONFLICT DO NOTHING` sur l'index unique : deux clics simultanés ne produisent jamais deux lignes, et le
 * second apprend, par un `rowCount` à zéro, que le fichier était déjà là. C'est la base qui tranche, pas une lecture
 * préalable — entre lire et écrire, il y a toujours la place pour un second clic.
 *
 * ⚠️ ORDRE : on écrit la ligne AVANT le journal, dans la même transaction implicite de la requête. Le journal est au
 * mieux-effort et son entité dépend de la migration : un journal impossible ne doit pas défaire un dépôt qui, lui,
 * a bien eu lieu dans le Drive — le fichier est là-bas, le nier serait le vrai mensonge.
 */
export async function memoriserDepot(d: ADeposer): Promise<IssueMemorisation> {
  if (!await depotsDriveDisponibles()) return { etat: 'sans_schema' };
  // La colonne `compte_google` n'existe qu'après la migration 246 : on ne la NOMME que si elle est là, sinon la
  //   requête échouerait tout entière — et le dépôt, lui, a bien eu lieu dans le Drive.
  const avecCompte = await compteGoogleDuDepotDisponible();
  /* 🔴 LOT RENOMMER-AVANT-RANGER — même règle de sonde que `compte_google` juste au-dessus : une colonne absente
     n'est NOMMÉE NULLE PART, sinon la requête entière échouerait alors que le dépôt a bien eu lieu dans le Drive. */
  const nomDepose = (d.nomDepose ?? '').trim();
  const avecNom = nomDepose !== '' && await nomDeposeDisponible();
  /* 🔴 LOT PASTILLE-DRIVE-EN-DIRECT — l'empreinte, sous la sonde de la migration 255 (`copiePiecesDisponible`
     sonde `verifie_le`, créée par la MÊME migration que `md5` : elles arrivent ensemble). Normalisée par le
     module PUR de l'index, pour que les deux côtés de la comparaison soient écrits une seule fois. */
  const md5 = empreinteNormalisee(d.md5);
  const avecMd5 = md5 !== null && await copiePiecesDisponible();
  const colonnes = ['piece_id', 'drive_file_id', 'drive_dossier_id', 'dossier_nom', 'drive_id', 'web_view_link',
    'depose_par', 'depose_par_libelle', ...(avecCompte ? ['compte_google'] : []), ...(avecNom ? ['nom_depose'] : []),
    ...(avecMd5 ? ['md5'] : [])];
  const valeurs: unknown[] = [d.pieceId, d.driveFileId, d.dossierId, d.dossierNom, d.driveId, d.webViewLink,
    d.auteurId, d.auteurLibelle, ...(avecCompte ? [d.compteGoogle ?? null] : []), ...(avecNom ? [nomDepose] : []),
    ...(avecMd5 ? [md5] : [])];
  const { rowCount } = await query(
    `INSERT INTO gestion_piece_drive
       (${colonnes.join(', ')})
     VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (piece_id, drive_dossier_id) DO NOTHING`,
    valeurs,
  );
  if ((rowCount ?? 0) === 0) return { etat: 'doublon' };

  // Le journal, au mieux-effort et sur l'entité que la base ACCEPTE — la leçon du 23/09 : écrire une entité en dur
  //   avait fait rendre un échec pour un message pourtant parti.
  try {
    const entite = await journalPieceDriveDisponible() ? 'piece_drive' : 'message';
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ($1, $2, 'depot_drive', 'hors du Drive', $3, $4, $5, $6)`,
      [
        entite,
        entite === 'piece_drive' ? d.pieceId : await messageDeLaPiece(d.pieceId),
        `dossier ${d.dossierNom ?? d.dossierId}`,
        `Une copie de la pièce jointe a été déposée dans le Google Drive, dossier « ${d.dossierNom ?? d.dossierId} »`
          + `${d.compteGoogle ? `, avec le compte Google ${d.compteGoogle}` : ''}. `
          + `L'original reste dans l'application : rien n'a été effacé.`,
        d.auteurId,
        d.auteurLibelle,
      ],
    );
  } catch (e) {
    console.error('[gestion/drive] dépôt enregistré mais NON journalisé', { pieceId: d.pieceId, e });
  }
  return { etat: 'enregistre' };
}

/**
 * ══ 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — UN DÉPLACEMENT SUIT L'ENTRÉE, IL N'EN CRÉE PAS UNE SECONDE ═════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « un DÉPLACEMENT (glisser, “Déposer ici” d'un fichier déjà dans le Drive,
 * annulation) met à jour les parents de l'entrée existante du registre et de l'index. Il ne crée jamais une
 * seconde entrée. Après un déplacement, un seul emplacement connu : le dernier. Seule une COPIE réelle ajoute un
 * emplacement. »
 *
 * ═══ 🔴 LE DÉFAUT QUE CELA CORRIGE, MESURÉ SUR LE VRAI DRIVE LE 03/10/2026 ═══════════════════════════════════════
 *
 * Arno a déplacé « test gigout.pdf » de « Test creation dossier drive » vers « _MESURE nom immediat » dans la
 * fenêtre Drive (journal `gestion_drive_mouvement` 158 → 162). `files.update` a bien déplacé le fichier — et la
 * ligne 26554 du registre a gardé `drive_dossier_id = 1dCY-…` (« Test creation dossier drive »), alors que le
 * parent RÉEL lu par `files.get` est `1EsD2E_…` (« _MESURE nom immediat »).
 *
 * 🔴 CE QUE CE MENSONGE COÛTE, ET IL COÛTE DEUX FOIS :
 *   ① le picto du mail annonce un chemin FAUX — `emplacementsDesPieces` prend `drive_dossier_id` comme parent de
 *      l'emplacement, et c'est de là qu'il trace le chemin et qu'il ouvre la fenêtre. On va chercher le document
 *      dans un dossier où il n'est plus ;
 *   ② ranger la MÊME pièce dans le dossier où elle est DÉJÀ ne serait pas reconnu comme un doublon
 *      (`lireDepotExistant` interroge `(piece_id, drive_dossier_id)`) : un second fichier naîtrait, et le
 *      compteur annoncerait deux emplacements pour un seul document.
 *
 * ⚠️ ON NE TOUCHE QU'À LA LIGNE DE CE FICHIER : `drive_file_id` est la clé du geste. Deux pièces différentes
 * peuvent très bien pointer le même fichier (une pièce revenue renommée), et les deux doivent suivre.
 *
 * ⚠️ UN CONFLIT D'UNICITÉ N'EST PAS UNE PANNE. L'index `(piece_id, drive_dossier_id)` interdit deux lignes de la
 * même pièce dans le même dossier : si une ligne y est déjà, on laisse celle-ci telle quelle plutôt que de faire
 * échouer un déplacement qui a EU LIEU chez Google. Le nettoyage des fantômes, lui, le verra.
 *
 * ⚠️ SANS LA MIGRATION 245 la table n'est NOMMÉE NULLE PART — règle du module, inchangée.
 */
export async function deplacerCopieAuRegistre(
  driveFileId: string, dossierId: string, dossierNom: string | null,
): Promise<number> {
  const fichier = driveFileId.trim();
  const dossier = dossierId.trim();
  if (fichier === '' || dossier === '') return 0;
  if (!await depotsDriveDisponibles()) return 0;
  try {
    /* 🔴 `dossier_nom` SUIT LE DOSSIER, et `coalesce` le garde quand on ne connaît pas le nom de la cible : un nom
       vide se lirait « Emplacement connu » alors qu'on sait parfaitement où le fichier est. */
    const { rowCount } = await query(
      `UPDATE gestion_piece_drive
          SET drive_dossier_id = $2,
              dossier_nom = coalesce(nullif(btrim($3), ''), dossier_nom)
        WHERE drive_file_id = $1 AND drive_dossier_id <> $2`,
      [fichier, dossier, dossierNom ?? '']);
    return rowCount ?? 0;
  } catch (e) {
    console.error('[gestion/drive] parent du registre NON mis à jour après un déplacement',
      { driveFileId: fichier, dossierId: dossier, e });
    return 0;
  }
}

/** Le message qui porte une pièce — repli du journal quand la migration 245 n'a pas encore élargi la liste d'entités. */
async function messageDeLaPiece(pieceId: number): Promise<number> {
  const { rows } = await query<{ message_id: number }>(
    `SELECT message_id::int AS message_id FROM gestion_piece WHERE id = $1`, [pieceId]);
  return rows[0]?.message_id ?? 0;
}
