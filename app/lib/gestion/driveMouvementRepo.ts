import { query } from '../db/client';
import { copiePiecesDisponible, corbeilleDriveDisponible, journalMouvementDriveDisponible } from './schema';

/**
 * LOT DRIVE-DEPLACER — CE QUE LA BASE GARDE DES DÉPLACEMENTS ET DES COPIES. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE MODULE N'ÉCRIT RIEN DANS LE DRIVE, et il ne sait pas le faire : `driveMouvement` n'est même pas importé.
 * Il inscrit la PREUVE d'un geste que la route, elle, a exécuté. La séparation est la même qu'au lot DRIVE-3 (le
 * vidage) : l'endroit qui écrit la preuve et l'endroit qui touche au Drive ne doivent pas pouvoir être confondus.
 *
 * 🔴 ET C'EST LUI QUI REND « ANNULER » POSSIBLE. Le parent d'origine est CONSIGNÉ ; « Annuler » le relit ici, et
 * non dans ce que l'écran croit se rappeler. Un écran se recharge, se trompe, se remplace ; une ligne de journal,
 * non.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LES QUATRE GESTES QUE LE JOURNAL SAIT DIRE ═════════════════
 *
 * « corbeille » et « restaurer » s'ajoutent à « deplacer » et « copier ». Ils ne sont inscriptibles QUE si la
 * migration 295 est appliquée : la base refuserait la ligne sans elle, et on n'écrit pas dans le Drive ce qu'on ne
 * saurait pas consigner (règle du lot DRIVE-DEPLACER).
 *
 * ⚠️ « restaurer » EST UNE ACTION À PART, et non une corbeille à l'envers : le journal se relit des mois plus tard
 * par quelqu'un qui cherche où est passé un document, et deux lignes « corbeille » dont l'une voudrait dire le
 * contraire de l'autre seraient illisibles.
 */
export type ActionMouvement = 'deplacer' | 'copier' | 'corbeille' | 'restaurer';

export interface MouvementInscrit {
  id: number;
  action: ActionMouvement;
  driveId: string;
  nom: string;
  parentOrigine: string;
  /** VIDE pour « corbeille » et « restaurer » : ces gestes-là n'ont pas de destination dans l'arborescence. */
  parentCible: string;
  copieDriveId: string | null;
}

/**
 * INSCRIT UN MOUVEMENT. À appeler APRÈS que Google a confirmé.
 *
 * 🔴 L'ORDRE EST CELUI-LÀ, ET IL EST DÉLIBÉRÉ : on déplace, PUIS on inscrit. L'inverse laisserait, en cas de panne
 * entre les deux, un journal qui affirme un déplacement qui n'a pas eu lieu — et « Annuler » irait alors chercher
 * un fichier là où il n'a jamais été. Dans l'ordre choisi, la panne laisse un déplacement sans ligne : c'est
 * visible (le fichier n'est plus où on le cherche) et réparable à la main, ce qu'un mensonge n'est pas.
 */
export async function inscrireMouvement(o: {
  action: ActionMouvement;
  driveId: string;
  nom: string;
  estDossier: boolean;
  parentOrigine: string;
  /** VIDE (chaîne vide) pour « corbeille » et « restaurer » : la migration 295 l'autorise pour elles seules. */
  parentCible: string;
  copieDriveId: string | null;
  auteurId: number | null;
  auteurLibelle: string;
  compteGoogle: string | null;
}): Promise<number | null> {
  if (!await journalMouvementDriveDisponible()) return null;
  /**
   * 🔴🔴 SANS LA MIGRATION 295, ON N'INSCRIT PAS UNE CORBEILLE — ET ON NE LAISSE PAS LA BASE LA REFUSER À NOTRE
   * PLACE. Une contrainte violée lèverait une exception au milieu d'une route qui vient d'écrire chez Google : le
   * fichier serait à la corbeille, sans ligne de journal, donc sans « Annuler ». On répond `null` AVANT, et la
   * route refuse le geste en entier — c'est la seule issue qui ne laisse rien derrière elle.
   */
  if ((o.action === 'corbeille' || o.action === 'restaurer') && !await corbeilleDriveDisponible()) return null;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_drive_mouvement
       (action, drive_id, nom, est_dossier, parent_origine, parent_cible, copie_drive_id,
        auteur_id, auteur_libelle, compte_google)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id::int AS id`,
    [o.action, o.driveId, o.nom, o.estDossier, o.parentOrigine, o.parentCible, o.copieDriveId,
      o.auteurId, o.auteurLibelle, o.compteGoogle]);
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * LES GESTES D'UN LOT, RELUS POUR « ANNULER ».
 *
 * ⚠️ UNE COPIE NE S'ANNULE PAS, et c'est inchangé : l'annuler voudrait dire SUPPRIMER la copie — la suppression
 * DÉFINITIVE, celle que ce dépôt n'écrit nulle part. Le bandeau d'une copie ne propose donc pas de retour.
 *
 * 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — UNE CORBEILLE, SI. Arno : « “Annuler le dernier déplacement”
 * sait aussi annuler une mise à la corbeille (restauration). » Elle entre donc dans cette lecture, au même titre
 * qu'un déplacement, et pour la même raison : elle se défait exactement.
 *
 * ⚠️ « restaurer » N'Y ENTRE PAS : annuler une restauration remettrait le document à la corbeille, c'est-à-dire
 * referait le geste qu'on vient de défaire. On ne construit pas une bascule sans fin dans un bouton d'annulation.
 */
export async function mouvementsAnnulables(ids: readonly number[]): Promise<MouvementInscrit[]> {
  if (ids.length === 0 || !await journalMouvementDriveDisponible()) return [];
  const { rows } = await query<{
    id: string; action: string; drive_id: string; nom: string;
    parent_origine: string; parent_cible: string; copie_drive_id: string | null;
  }>(
    `SELECT id::int AS id, action, drive_id, nom, parent_origine, parent_cible, copie_drive_id
       FROM gestion_drive_mouvement
      WHERE id = ANY($1::bigint[]) AND action IN ('deplacer', 'corbeille') AND annule_le IS NULL
      ORDER BY id`, [ids]);
  return rows.map((r) => ({
    id: Number(r.id), action: r.action as ActionMouvement, driveId: r.drive_id, nom: r.nom,
    parentOrigine: r.parent_origine, parentCible: r.parent_cible, copieDriveId: r.copie_drive_id,
  }));
}

/**
 * DATE UN MOUVEMENT COMME ANNULÉ.
 *
 * 🔴 ON NE SUPPRIME PAS LA LIGNE : le re-déplacement en écrit une NOUVELLE, et celle-ci reste, datée. Effacer la
 * première ferait disparaître la trace du geste qu'on répare — or c'est précisément celle-là qu'on relira le jour
 * où l'on cherchera à comprendre ce qui s'est passé.
 */
export async function marquerAnnule(id: number): Promise<void> {
  if (!await journalMouvementDriveDisponible()) return;
  await query(`UPDATE gestion_drive_mouvement SET annule_le = now() WHERE id = $1 AND annule_le IS NULL`, [id]);
}

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LES COPIES D'UN DOCUMENT, LUES DANS LE JOURNAL ═══════════════
 *
 * C'est le « registre de l'appli » dont parle la loupe « Où est ce document ? ». Chaque copie faite par cette
 * application a laissé ici une ligne portant la SOURCE (`drive_id`) et la COPIE (`copie_drive_id`) : les retrouver
 * ne demande aucun appel à Google, et la réponse est EXACTE — on ne devine pas, on relit ce qu'on a fait.
 *
 * 🔴 ON REND LES LIENS, PAS LA RÉPONSE. La fermeture (copies, copies de copies, et l'original) est calculée par le
 * module PUR `localisationDrive.fermetureCopies`, qui la borne en profondeur et en nombre. Une requête récursive
 * en SQL aurait mis cette règle hors de portée d'un test sans base.
 *
 * ⚠️ DEUX SENS, ET IL FAUT LES DEUX : on part aussi bien d'un original que d'une copie. Chercher seulement
 * `drive_id = $1` n'aurait rien trouvé quand on ouvre la loupe sur la copie — c'est-à-dire la moitié des cas.
 *
 * ⚠️ UNE LIGNE ANNULÉE COMPTE QUAND MÊME : « annulé » ne vaut que pour un DÉPLACEMENT (il est revenu) ou une
 * CORBEILLE (elle a été défaite). Une copie, elle, ne s'annule pas — la ligne dit qu'elle a eu lieu, et le
 * fichier existe. C'est l'appelant qui vérifiera chez Google si chaque occurrence est encore là.
 *
 * 🔒 LECTURE SEULE. Et bornée : un document très recopié ne doit pas ramener dix mille lignes.
 */
export async function copiesDuDocument(driveId: string, limite = 300): Promise<{ source: string; copie: string }[]> {
  const id = driveId.trim();
  if (id === '' || !await journalMouvementDriveDisponible()) return [];
  const { rows } = await query<{ source: string; copie: string }>(
    `SELECT drive_id AS source, copie_drive_id AS copie
       FROM gestion_drive_mouvement
      WHERE action = 'copier' AND copie_drive_id IS NOT NULL
        AND (drive_id = $1 OR copie_drive_id = $1)
      ORDER BY id
      LIMIT $2`, [id, limite]);
  return rows.map((r) => ({ source: r.source, copie: r.copie }));
}

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LES DÉPÔTS DRIVE D'UNE PIÈCE JOINTE ══════════════════════════
 *
 * L'autre moitié du « registre de l'appli ». Une pièce jointe de mail n'a pas d'identifiant Drive tant qu'on ne
 * l'a pas rangée ; `gestion_piece_drive` garde chaque dépôt — c'est par là que la loupe part quand on l'ouvre sur
 * une pièce du message plutôt que sur une vignette dupliquée.
 *
 * ⚠️ TOUS LES DÉPÔTS, QUELLE QUE SOIT LEUR ORIGINE : un rangement à la main et une copie faite par le programme
 * désignent le même document. Ce qui les distingue intéresse l'audit, pas la question « où est-il ? ».
 *
 * ⚠️ `md5` EST RENDU QUAND ON L'A : il évite un `files.get` à l'appelant pour les pièces, et c'est l'empreinte
 * que la comparaison de contenu utilisera.
 *
 * 🔒 LECTURE SEULE, et bornée.
 */
export async function fichiersDriveDeLaPiece(
  pieceId: number, limite = 50,
): Promise<{ driveFileId: string; md5: string | null }[]> {
  if (!Number.isSafeInteger(pieceId) || pieceId <= 0) return [];
  if (!await copiePiecesDisponible()) return [];
  const { rows } = await query<{ drive_file_id: string; md5: string | null }>(
    `SELECT drive_file_id, md5
       FROM gestion_piece_drive
      WHERE piece_id = $1 AND btrim(drive_file_id) <> ''
      ORDER BY id
      LIMIT $2`, [pieceId, limite]);
  return rows.map((r) => ({ driveFileId: r.drive_file_id, md5: r.md5 }));
}
