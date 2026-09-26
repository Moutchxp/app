/**
 * MODULE « GESTION » — LOT DRIVE-3 : CE QUE LA BASE SAIT DU VIDAGE. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'EFFACE RIEN SUR MinIO, et il ne sait pas le faire : `supprimer` n'est même pas importé. Il lit les
 * candidates, et il inscrit la PREUVE d'un effacement que la commande, elle, a exécuté. La séparation est voulue :
 * l'endroit qui écrit la preuve et l'endroit qui enlève les octets ne doivent pas pouvoir être confondus.
 *
 * 🔒 LA SEULE ÉCRITURE EST UNE LIGNE DE `gestion_piece_vidage` (append-only) et une de `gestion_journal`.
 * `gestion_piece.cle_stockage` n'est JAMAIS modifiée : ce lot enlève des octets, pas des informations.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { piecesEnvoiDisponibles, vidageDisponible } from './schema';
import type { PieceCandidate } from './vidageStockage';

/**
 * LES PIÈCES À EXAMINER, par lots, du plus petit identifiant au plus grand.
 *
 * 🔴 LE CURSEUR EST L'IDENTIFIANT DE PIÈCE, donc la reprise est triviale : on repart après la dernière vue. Et comme
 * une pièce vidée porte une ligne dans `gestion_piece_vidage`, la relancer depuis zéro ne fait que la reconnaître
 * « déjà vidée » — l'idempotence ne dépend pas du curseur.
 *
 * ⚠️ `brouillonEnCours` EST CALCULÉ ICI, ET SEULEMENT SI LA MIGRATION 252 EST LÀ. Sans elle il n'y a pas de table de
 * pièces de brouillon : nommer une table absente ferait échouer toute la commande, et la sonde se fait donc AVANT
 * d'émettre le SQL — jamais dans une transaction, où aucun repli ne pourrait plus s'exécuter.
 */
export async function chargerCandidates(depuis: number, lot: number): Promise<PieceCandidate[]> {
  const avecBrouillons = await piecesEnvoiDisponibles();
  const avecVidage = await vidageDisponible();

  const { rows } = await query<{
    id: string; nom_fichier: string; type_mime: string | null; cle_stockage: string | null;
    taille_octets: string | null; deja_videe: boolean; drive_file_id: string | null;
    drive_dossier_id: string | null; md5: string | null; verifie_le: string | null; brouillon: boolean;
  }>(
    `SELECT p.id, p.nom_fichier, p.type_mime, p.cle_stockage, p.taille_octets::text,
            ${avecVidage ? 'EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id)' : 'false'} AS deja_videe,
            d.drive_file_id, d.drive_dossier_id, d.md5, d.verifie_le::text,
            ${avecBrouillons
    // ⚠️ LES DEUX LIENS, ET SEULEMENT LES PIÈCES ENCORE ATTACHÉES. Un brouillon référence une pièce soit par son
    //   identifiant (« transférer en tant que pièce jointe »), soit par la même clé de stockage (fichier déposé).
    //   `retire_le IS NULL` écarte celles qu'on a détachées du brouillon : leur contenu n'est plus attendu par lui.
    ? `EXISTS (SELECT 1 FROM gestion_brouillon_piece bp
                WHERE bp.retire_le IS NULL
                  AND (bp.piece_id = p.id OR (p.cle_stockage IS NOT NULL AND bp.cle_stockage = p.cle_stockage)))`
    : 'false'} AS brouillon
       FROM gestion_piece p
       -- La copie que NOUS avons faite, et elle seule : un dépôt manuel (lot 5-PJ-B) n'autorise aucun effacement,
       -- parce que rien ne garantit qu'il soit encore là ni qu'il porte la même empreinte.
       LEFT JOIN gestion_piece_drive d
              ON d.piece_id = p.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
      WHERE p.id > $1
      ORDER BY p.id
      LIMIT $2`, [depuis, lot]);

  return rows.map((r) => ({
    pieceId: Number(r.id), nomFichier: r.nom_fichier, typeMime: r.type_mime,
    cleStockage: r.cle_stockage,
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
    dejaVidee: r.deja_videe, driveFileId: r.drive_file_id, driveDossierId: r.drive_dossier_id,
    md5: r.md5, verifieLe: r.verifie_le, brouillonEnCours: r.brouillon,
  }));
}

/**
 * INSCRIT LA PREUVE D'UN EFFACEMENT. À appeler APRÈS que les octets ont réellement quitté MinIO.
 *
 * 🔴 L'ORDRE EST CELUI-LÀ, ET IL EST DÉLIBÉRÉ : on efface, PUIS on inscrit. L'inverse laisserait, en cas de panne
 * entre les deux, une base qui prétend que le contenu est parti alors qu'il est encore là — et l'application lirait
 * dans le Drive un fichier dont la copie MinIO existe toujours, sans que personne le sache. Dans l'ordre choisi, la
 * panne laisse un objet effacé sans ligne : la passe suivante le verra « sans copie enregistrée côté vidage » et la
 * pièce sera signalée indisponible, ce qui est visible et réparable. Un trou qui se voit vaut mieux qu'un mensonge.
 *
 * ⚠️ `ON CONFLICT DO NOTHING` : la clé unique sur `piece_id` fait que deux passes ne peuvent pas écrire deux preuves.
 */
export async function noterVidage(o: {
  pieceId: number; cleStockage: string; md5: string; taille: number;
  driveFileId: string; driveMd5: string; driveTaille: number; verifieLe: string; auteur: string;
}): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO gestion_piece_vidage
       (piece_id, cle_stockage, md5, taille_octets, drive_file_id, drive_md5, drive_taille, verifie_le, auteur_libelle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9)
     ON CONFLICT (piece_id) DO NOTHING`,
    [o.pieceId, o.cleStockage, o.md5, o.taille, o.driveFileId, o.driveMd5, o.driveTaille, o.verifieLe, o.auteur]);
  return (rowCount ?? 0) > 0;
}

/** Une passe de vidage laisse UNE ligne dans le journal du module. Ne jette jamais : voir `journalEnvoi`. */
export async function journaliserPasseVidage(comptees: number, commentaire: string): Promise<void> {
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
       VALUES ('vidage_stockage', $1, 'passe', $2, 'vidage automatique')`, [comptees, commentaire]);
  } catch { /* le carnet de bord ne commande pas le navire */ }
}

/**
 * UNE PASSE DE COPIE EST-ELLE EN COURS ? LECTURE SEULE.
 *
 * 🔴 LE VIDAGE REFUSE DE TOURNER PENDANT UNE COPIE, et ce n'est pas une précaution de politesse. La copie écrit dans
 * `gestion_piece_drive` au fil de l'eau ; vider en même temps, c'est décider d'effacer sur la foi d'un état qui
 * change sous nos pieds. Les deux commandes se relaient, elles ne se croisent pas.
 */
export async function copieEnCours(): Promise<{ enCours: boolean; passeId: number | null }> {
  try {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM gestion_drive_copie_passe
        WHERE termine_le IS NULL AND mode = 'applique' ORDER BY id DESC LIMIT 1`);
    return { enCours: rows.length > 0, passeId: rows.length > 0 ? Number(rows[0].id) : null };
  } catch {
    // On ne peut pas savoir ⇒ on se comporte comme si une copie tournait. Le doute ne doit jamais autoriser
    //   l'effacement : c'est la seule direction dans laquelle se tromper coûte des octets irrécupérables.
    return { enCours: true, passeId: null };
  }
}

/** Les chiffres d'ensemble du vidage, pour le rapport. LECTURE SEULE. */
export async function chiffresVidage(): Promise<{
  videes: number; octetsLiberes: number; premierLe: string | null; dernierLe: string | null;
} | null> {
  if (!(await vidageDisponible())) return null;
  const { rows } = await query<{ n: string; o: string; premier: string | null; dernier: string | null }>(
    `SELECT count(*)::text AS n, coalesce(sum(taille_octets), 0)::text AS o,
            min(vide_le)::text AS premier, max(vide_le)::text AS dernier
       FROM gestion_piece_vidage`);
  const r = rows[0];
  return {
    videes: Number(r.n), octetsLiberes: Number(r.o), premierLe: r.premier, dernierLe: r.dernier,
  };
}
