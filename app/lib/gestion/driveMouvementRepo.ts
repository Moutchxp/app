import { query } from '../db/client';
import { journalMouvementDriveDisponible } from './schema';

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

export interface MouvementInscrit {
  id: number;
  action: 'deplacer' | 'copier';
  driveId: string;
  nom: string;
  parentOrigine: string;
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
  action: 'deplacer' | 'copier';
  driveId: string;
  nom: string;
  estDossier: boolean;
  parentOrigine: string;
  parentCible: string;
  copieDriveId: string | null;
  auteurId: number | null;
  auteurLibelle: string;
  compteGoogle: string | null;
}): Promise<number | null> {
  if (!await journalMouvementDriveDisponible()) return null;
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
 * LES DÉPLACEMENTS D'UN LOT, RELUS POUR « ANNULER ».
 *
 * ⚠️ SEULEMENT LES DÉPLACEMENTS, et seulement ceux qui n'ont pas déjà été annulés : annuler une COPIE voudrait dire
 * SUPPRIMER la copie, et l'application ne supprime rien. Le bandeau d'une copie ne propose donc pas de retour.
 */
export async function mouvementsAnnulables(ids: readonly number[]): Promise<MouvementInscrit[]> {
  if (ids.length === 0 || !await journalMouvementDriveDisponible()) return [];
  const { rows } = await query<{
    id: string; action: string; drive_id: string; nom: string;
    parent_origine: string; parent_cible: string; copie_drive_id: string | null;
  }>(
    `SELECT id::int AS id, action, drive_id, nom, parent_origine, parent_cible, copie_drive_id
       FROM gestion_drive_mouvement
      WHERE id = ANY($1::bigint[]) AND action = 'deplacer' AND annule_le IS NULL
      ORDER BY id`, [ids]);
  return rows.map((r) => ({
    id: Number(r.id), action: r.action as 'deplacer' | 'copier', driveId: r.drive_id, nom: r.nom,
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
