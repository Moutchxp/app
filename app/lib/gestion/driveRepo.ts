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
  compteGoogleDuDepotDisponible, depotsDriveDisponibles, journalPieceDriveDisponible, reglageRecentsDisponible,
} from './schema';

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

/** Les dépôts connus pour un ensemble de pièces. Une seule requête pour tout un message : pas une par carte. */
export async function lireDepotsDesPieces(pieceIds: readonly number[]): Promise<DepotDrive[]> {
  if (pieceIds.length === 0) return [];
  if (!await depotsDriveDisponibles()) return []; // migration 245 absente : aucun dépôt ne peut exister
  const { rows } = await query<{
    piece_id: number; drive_file_id: string; drive_dossier_id: string; dossier_nom: string | null;
    web_view_link: string | null; depose_le: string; depose_par_libelle: string;
  }>(
    `SELECT piece_id::int AS piece_id, drive_file_id, drive_dossier_id, dossier_nom, web_view_link,
            to_char(depose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS depose_le, depose_par_libelle
       FROM gestion_piece_drive
      WHERE piece_id = ANY($1::bigint[])
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
  const { rowCount } = await query(
    `INSERT INTO gestion_piece_drive
       (piece_id, drive_file_id, drive_dossier_id, dossier_nom, drive_id, web_view_link, depose_par, depose_par_libelle${avecCompte ? ', compte_google' : ''})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8${avecCompte ? ', $9' : ''})
     ON CONFLICT (piece_id, drive_dossier_id) DO NOTHING`,
    avecCompte
      ? [d.pieceId, d.driveFileId, d.dossierId, d.dossierNom, d.driveId, d.webViewLink, d.auteurId, d.auteurLibelle, d.compteGoogle ?? null]
      : [d.pieceId, d.driveFileId, d.dossierId, d.dossierNom, d.driveId, d.webViewLink, d.auteurId, d.auteurLibelle],
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

/** Le message qui porte une pièce — repli du journal quand la migration 245 n'a pas encore élargi la liste d'entités. */
async function messageDeLaPiece(pieceId: number): Promise<number> {
  const { rows } = await query<{ message_id: number }>(
    `SELECT message_id::int AS message_id FROM gestion_piece WHERE id = $1`, [pieceId]);
  return rows[0]?.message_id ?? 0;
}
