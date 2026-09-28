import { query } from '../db/client';
import { journalDossierDriveDisponible } from './schema';

/**
 * MODULE « GESTION » — LOT DRIVE-VISUALISER-ET-DOSSIERS : LE JOURNAL DES DOSSIERS CRÉÉS DANS LE DRIVE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE JOURNAL EST LA CONDITION DE LA CRÉATION, PAS SA TRACE. Tant que la migration 272 n'est pas appliquée, le
 * bouton « + Nouveau dossier » est DÉSACTIVÉ avec son motif : on ne crée pas dans le Drive du cabinet ce qu'on ne
 * saurait pas consigner. C'est le seul lot du module où une sonde de schéma conditionne une ÉCRITURE EXTÉRIEURE —
 * ailleurs, une migration manquante ne fait que rendre l'écran à ce qu'il était.
 *
 * 🔴 APPEND-ONLY. Il n'y a ici ni UPDATE ni DELETE, et il n'en faut pas : un journal qu'on peut corriger ne répond
 * plus à la question « que s'est-il passé ? ». C'est la même règle que `gestion_drive_refus` (lot DRIVE-1).
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce fichier par `tsx`. La frontière navigateur est
 * tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface DossierCreeAJournaliser {
  driveId: string;
  parentId: string;
  nom: string;
  /** Le chemin lisible AU MOMENT de la création (« Mon Drive › … › <nom> »), figé : un parent peut être renommé après. */
  chemin: string;
  auteurId: number | null;
  auteurLibelle: string;
  /** Le compte Google au nom duquel Google a autorisé la création (délégation). */
  compteGoogle: string | null;
}

/**
 * INSCRIT LA CRÉATION. Rend `true` si la ligne est écrite.
 *
 * 🔴 ELLE NE LÈVE JAMAIS, et c'est un choix difficile mais juste : à l'instant où elle est appelée, LE DOSSIER EXISTE
 * DÉJÀ dans le Drive. Lever ferait rendre une erreur à l'écran pour un dossier qui, lui, est bien là — et l'on
 * recommencerait, créant un doublon. On rend donc `false`, la route le DIT en toutes lettres, et la trace part dans
 * les journaux du serveur. Le seul recours honnête à ce stade est de le dire, puisque supprimer est interdit.
 */
export async function journaliserDossierCree(d: DossierCreeAJournaliser): Promise<boolean> {
  if (!(await journalDossierDriveDisponible())) return false;
  try {
    await query(
      `INSERT INTO gestion_drive_dossier_cree
         (drive_id, parent_id, nom, chemin, auteur_id, auteur_libelle, compte_google)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [d.driveId, d.parentId, d.nom, d.chemin, d.auteurId, d.auteurLibelle, d.compteGoogle]);
    return true;
  } catch (e) {
    console.error('[dossierCreeRepo] création NON journalisée — le dossier, lui, existe dans le Drive', e);
    return false;
  }
}

export interface LigneDossierCree {
  id: string;
  drive_id: string;
  parent_id: string;
  nom: string;
  chemin: string;
  auteur_libelle: string;
  compte_google: string | null;
  cree_le: string;
}

/**
 * LES DERNIÈRES CRÉATIONS, pour pouvoir répondre à « d'où vient ce dossier ? ». Lecture seule.
 *
 * ⚠️ Rend une liste VIDE si la migration manque — jamais une erreur : c'est exactement le cas où rien n'a pu être
 * créé, donc où il n'y a rien à montrer.
 */
export async function dernieresCreations(limite = 50): Promise<LigneDossierCree[]> {
  if (!(await journalDossierDriveDisponible())) return [];
  const n = Number.isSafeInteger(limite) && limite > 0 ? Math.min(limite, 500) : 50;
  const { rows } = await query<LigneDossierCree>(
    `SELECT id::text, drive_id, parent_id, nom, chemin, auteur_libelle, compte_google, cree_le
       FROM gestion_drive_dossier_cree
      ORDER BY cree_le DESC, id DESC
      LIMIT $1`, [n]);
  return rows;
}
