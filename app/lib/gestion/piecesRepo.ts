/**
 * MODULE « GESTION » — LOT 5-PJ-A : les I/O des pièces jointes (base + stockage objet). Module SERVEUR.
 *
 * 🔒 PÉRIMÈTRE D'ÉCRITURE, énuméré ici et nulle part ailleurs : les QUATRE colonnes de miniature de `gestion_piece`
 * (migration 244), et rien d'autre. Aucune pièce n'est modifiée, aucune n'est supprimée, aucun original n'est touché.
 *
 * 🔒 AUCUNE URL DE STOCKAGE NE SORT D'ICI. Les octets sont rendus à une route de l'application, qui les sert elle-même
 * après avoir relu le droit — même règle que `/api/admin/gestion/pieces/[id]` depuis le lot 4c.
 */
import { query } from '../db/client';
import { miniaturesDisponibles } from './schema';

/** Une pièce, telle que l'archive et la miniature en ont besoin. */
export interface PiecePourArchive {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  cleStockage: string;
  tailleOctets: number | null;
}

/** L'en-tête du message : ce qui NOMME l'archive. */
export interface EnTeteMessage {
  messageId: number;
  objet: string | null;
  recuLe: string;
}

/**
 * Les pièces RÉELLEMENT déposées d'un message, dans l'ordre où elles ont été capturées. Une pièce refusée à la
 * capture (`cle_stockage IS NULL`) n'en fait pas partie : on ne met pas dans une archive un fichier qu'on n'a pas.
 * L'écran, lui, la montre quand même avec son motif — ce sont deux questions différentes.
 */
export async function lirePiecesDuMessage(messageId: number): Promise<PiecePourArchive[]> {
  const { rows } = await query<{
    id: number; nom_fichier: string; type_mime: string | null; cle_stockage: string; taille_octets: string | null;
  }>(
    `SELECT id::int AS id, nom_fichier, type_mime, cle_stockage, taille_octets
       FROM gestion_piece
      WHERE message_id = $1 AND cle_stockage IS NOT NULL
      ORDER BY id`,
    [messageId],
  );
  return rows.map((r) => ({
    pieceId: r.id,
    nomFichier: r.nom_fichier,
    typeMime: r.type_mime,
    cleStockage: r.cle_stockage,
    // `pg` rend un bigint SOUS FORME DE CHAÎNE : sans cette conversion, les additions de tailles concatèneraient.
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
  }));
}

/** L'objet et la date du message — pour nommer l'archive « 2026-09-25 — Fenêtre cassée.zip ». */
export async function lireEnTeteMessage(messageId: number): Promise<EnTeteMessage | null> {
  const { rows } = await query<{ id: number; objet: string | null; recu_le: string }>(
    `SELECT id::int AS id, objet, to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le
       FROM gestion_message WHERE id = $1`,
    [messageId],
  );
  const m = rows[0];
  return m ? { messageId: m.id, objet: m.objet, recuLe: m.recu_le } : null;
}

/** Ce que la base sait de la miniature d'une pièce. `null` = pièce inconnue ou jamais déposée. */
export interface EtatMiniature {
  cleStockage: string;
  nomFichier: string;
  typeMime: string | null;
  /** `null` = jamais tentée ; `'ok'` = fabriquée ; `'echec'` = tentée, impossible. */
  etat: 'ok' | 'echec' | null;
  cleMiniature: string | null;
  motif: string | null;
}

/**
 * L'état de la miniature d'une pièce.
 *
 * ⚠️ LA SONDE DE SCHÉMA D'ABORD, HORS TRANSACTION. Tant que la migration 244 n'est pas appliquée, les quatre colonnes
 * n'existent pas : les NOMMER ferait échouer la requête, donc la route, donc la carte. On émet alors le SQL d'avant —
 * celui qui marche partout — et l'écran se contente de l'icône de type. C'est la règle du module depuis le lot 4a.
 */
export async function lireEtatMiniature(pieceId: number): Promise<EtatMiniature | null> {
  const avecMiniature = await miniaturesDisponibles();
  const colonnes = avecMiniature
    ? 'miniature_etat, miniature_cle, miniature_motif'
    : `NULL::text AS miniature_etat, NULL::text AS miniature_cle, NULL::text AS miniature_motif`;
  const { rows } = await query<{
    cle_stockage: string | null; nom_fichier: string; type_mime: string | null;
    miniature_etat: string | null; miniature_cle: string | null; miniature_motif: string | null;
  }>(
    `SELECT cle_stockage, nom_fichier, type_mime, ${colonnes} FROM gestion_piece WHERE id = $1`,
    [pieceId],
  );
  const p = rows[0];
  if (!p || !p.cle_stockage) return null;
  const etat = p.miniature_etat === 'ok' || p.miniature_etat === 'echec' ? p.miniature_etat : null;
  return {
    cleStockage: p.cle_stockage,
    nomFichier: p.nom_fichier,
    typeMime: p.type_mime,
    etat,
    cleMiniature: p.miniature_cle,
    motif: p.miniature_motif,
  };
}

/**
 * MÉMORISE une miniature fabriquée. Sans la migration 244, on ne mémorise RIEN et on le dit à l'appelant : la
 * vignette sera refaite au prochain affichage. C'est le prix, assumé et borné, de faire tourner le code sur un schéma
 * plus ancien que lui — et c'est exactement pourquoi la migration existe.
 */
export async function memoriserMiniature(pieceId: number, cle: string): Promise<boolean> {
  if (!await miniaturesDisponibles()) return false;
  await query(
    `UPDATE gestion_piece
        SET miniature_cle = $2, miniature_etat = 'ok', miniature_motif = NULL, miniature_le = now()
      WHERE id = $1`,
    [pieceId, cle],
  );
  return true;
}

/**
 * MÉMORISE un échec, UNE fois. C'est ce qui empêche un fichier mal formé de redevenir une charge à chaque affichage.
 * Le motif est borné : il vient parfois d'une bibliothèque, et une colonne n'a pas à porter une trace d'exécution.
 */
export async function memoriserEchecMiniature(pieceId: number, motif: string): Promise<boolean> {
  if (!await miniaturesDisponibles()) return false;
  await query(
    `UPDATE gestion_piece
        SET miniature_etat = 'echec', miniature_motif = left($2, 300), miniature_cle = NULL, miniature_le = now()
      WHERE id = $1`,
    [pieceId, motif],
  );
  return true;
}
