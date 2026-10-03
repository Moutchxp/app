/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LE STATUT DE TOUTES LES PIÈCES, EN UNE REQUÊTE ═════════════════
 *
 * Module SERVEUR (il tire `pg`). Il LIT, et il ne fait que lire.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONTRAINTE D'ARNO (03/10/2026) : « Calcul rapide : le statut de toutes les pièces d'un mail est lu en UNE SEULE
 * requête, sans appel Google à l'ouverture du mail. »
 *
 * 🔴 POURQUOI CE N'EST PAS LA ROUTE `drive/localiser` QU'ON APPELLE EN BOUCLE. Elle répond pour UN document, et
 * son mode complet remonte la chaîne des parents chez Google, emplacement par emplacement. Dix pièces auraient
 * donc fait dix appels à notre serveur, et des dizaines à Google, à chaque dépliage de message. Ici, tout se lit
 * en base — y compris les chemins, que l'index des empreintes porte déjà.
 *
 * 🔴 LA SOURCE EST LA MÊME QUE LA PASTILLE VERTE ET LA LOUPE, et c'est la contrainte d'Arno : registre des dépôts,
 * registre PAR EMPREINTE, puis index des empreintes. Voir l'encadré de `pieceDansLeDrive.ts`.
 *
 * ⚠️ TROIS SONDES DE SCHÉMA, ET CHACUNE RETIRE SA PART SANS RIEN CASSER :
 *   · migration 245 absente (`gestion_piece_drive`) ⇒ pas de registre ;
 *   · migration 298 absente (`gestion_piece.md5`)   ⇒ pas de reconnaissance par contenu ;
 *   · migration 299 absente (`gestion_drive_empreinte`) ⇒ pas d'index.
 * Les trois absentes, la fonction rend une liste vide : aucun picto, et aucune erreur.
 *
 * 🔒 AUCUNE ÉCRITURE, AUCUN APPEL RÉSEAU. « Documents clients scannés » n'est lu qu'en MÉTADONNÉES (un nom, un
 * parent, une empreinte) — exactement ce que fait déjà le fil d'Ariane de la fenêtre Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { cheminDepuisIndex } from './indexEmpreintesDrive';
import { sqlNomAffiche } from './nomUsageSql';
import { EMPLACEMENTS_MAX, type EmplacementPiece, type StatutPieceDrive } from './pieceDansLeDrive';
import { depotsDriveDisponibles, indexEmpreintesDriveDisponible, pieceMd5Disponible } from './schema';

/** Ce que la requête rend : des emplacements, et les nœuds qui tracent leurs chemins. */
interface LigneBrute {
  sorte: 'emplacement' | 'noeud';
  piece: string | null;
  drive_file_id: string;
  nom: string | null;
  parent_id: string | null;
  dossier_nom: string | null;
  voie: string | null;
}

/**
 * La cible : les pièces désignées une à une, celles d'un MESSAGE, ou celles de tout un ÉCHANGE.
 *
 * ⚠️ TROIS PORTES, UNE SEULE REQUÊTE : c'est le `WHERE` du premier CTE qui change, et rien d'autre. Trois
 * fonctions auraient donné trois assemblages à tenir d'accord — et l'un d'eux aurait fini par diverger.
 */
export type CiblePieces =
  | { pieceIds: readonly number[] }
  | { messageId: number }
  | { filId: number };

/**
 * ══ LE STATUT DE PLUSIEURS PIÈCES, EN UNE SEULE REQUÊTE ══════════════════════════════════════════════════════════
 *
 * 🔴 UNE SEULE INSTRUCTION SQL, ET C'EST VOULU. Les emplacements ET les nœuds de chemin reviennent ensemble,
 * distingués par la colonne `sorte` : deux requêtes auraient fait deux allers-retours pour une réponse qui n'a de
 * sens qu'entière, et la seconde aurait pu arriver après que l'écran a déjà affiché la première.
 *
 * ⚠️ BORNÉE PAR PIÈCE (`EMPLACEMENTS_MAX`), avec le REGISTRE D'ABORD : si un document traîne cent copies, ce sont
 * les cinquante dont nous sommes sûrs qui restent. Couper au hasard aurait fait disparaître la copie que nous
 * avons nous-mêmes déposée.
 */
export async function emplacementsDesPieces(cible: CiblePieces): Promise<StatutPieceDrive[]> {
  const parPieces = 'pieceIds' in cible;
  if (parPieces && cible.pieceIds.length === 0) return [];

  const [avecRegistre, avecMd5, avecIndex] = await Promise.all([
    depotsDriveDisponibles(), pieceMd5Disponible(), indexEmpreintesDriveDisponible(),
  ]);
  /* ⚠️ SANS REGISTRE NI INDEX, IL NE PEUT RIEN Y AVOIR : on rend une liste vide plutôt qu'une requête pour rien. */
  if (!avecRegistre && !(avecIndex && avecMd5)) return [];

  /**
   * 🔴 LE `md5` DE LA PIÈCE N'EXISTE QU'AVEC LA MIGRATION 298. Sans elle, la colonne n'est PAS NOMMÉE — une
   * requête qui la citerait échouerait, donc la route, donc l'écran. C'est la discipline du dépôt depuis le lot
   * 5-PJ-B.
   */
  const md5Piece = avecMd5 ? "lower(btrim(coalesce(p.md5, '')))" : "''";
  /**
   * 🔴 LE NOM D'USAGE, PAS LE NOM D'ARRIVÉE (lot NOM-UNIQUE-DES-PIECES). Ce nom ne sert ici que de REPLI, quand
   * le registre n'a gardé aucun nom pour une copie — mais un repli qui afficherait « scan_0042.pdf » d'une pièce
   * renommée « Quittance juillet » serait exactement le défaut que ce fragment existe pour empêcher.
   */
  const nomPiece = await sqlNomAffiche('p');
  const ouPieces = parPieces
    ? 'p.id = ANY($1::bigint[])'
    : ('messageId' in cible
      ? 'p.message_id = $1'
      : 'p.message_id IN (SELECT m.id FROM gestion_message m WHERE m.fil_id = $1)');

  /**
   * ── ① LE REGISTRE : ce que l'application a rangé, pour cette pièce ou pour un contenu identique ──────────────
   *
   * 🔴🔴 DEUX BRANCHES, ET SURTOUT PAS UN `OR`, ET C'EST MESURÉ. Écrit `ON (d.piece_id = c.piece_id OR
   * lower(d.md5) = c.md5)`, le planificateur abandonne les deux index et BALAIE `gestion_piece_drive` en entier —
   * 26 552 lignes, 12 ms, pour trouver neuf emplacements. En deux branches, chacune prend son index
   * (`…_piece_idx`, `…_md5_idx`) et la même réponse tombe en une fraction de milliseconde.
   *
   * ⚠️ `lower(d.md5)` ET NON `lower(btrim(d.md5))` : l'index EST `btree (lower(md5))`. Un `btrim` autour le rend
   * inutilisable — l'expression indexée doit être écrite À L'IDENTIQUE, sinon elle n'est plus la même expression.
   * Les empreintes viennent de Google ou de `digest('hex')` : elles ne portent pas d'espaces.
   *
   * ⚠️ `UNION ALL` ET NON `UNION` : les doublons entre branches sont écartés plus bas, par `rang_doublon`, qui
   * garde LA VOIE LA PLUS FORTE. Un `UNION` les aurait fondus au hasard et fait perdre « par le registre ».
   */
  const registre = avecRegistre ? `
    SELECT c.piece_id,
           d.drive_file_id,
           coalesce(nullif(btrim(d.nom_drive), ''), nullif(btrim(d.nom_depose), ''), c.nom_piece) AS nom,
           d.drive_dossier_id AS parent_id,
           d.dossier_nom,
           'registre'::text AS voie
      FROM cibles c
      JOIN gestion_piece_drive d
        ON d.piece_id = c.piece_id
     WHERE d.disparu_le IS NULL AND btrim(d.drive_file_id) <> ''
    ${avecMd5 ? `
     UNION ALL
    SELECT c.piece_id,
           d.drive_file_id,
           coalesce(nullif(btrim(d.nom_drive), ''), nullif(btrim(d.nom_depose), ''), c.nom_piece) AS nom,
           d.drive_dossier_id AS parent_id,
           d.dossier_nom,
           'empreinte'::text AS voie
      FROM cibles c
      JOIN gestion_piece_drive d
        ON lower(d.md5) = c.md5
     WHERE c.md5 <> '' AND d.disparu_le IS NULL AND btrim(d.drive_file_id) <> ''` : ''}` : '';

  /* ── ② L'INDEX : les fichiers que l'application n'a jamais touchés ──────────────────────────────────────────── */
  const index = avecIndex && avecMd5 ? `
    SELECT c.piece_id, e.drive_file_id, e.nom, e.parent_id, NULL::text AS dossier_nom, 'empreinte'::text AS voie
      FROM cibles c
      JOIN gestion_drive_empreinte e
        ON lower(e.md5) = c.md5 AND e.disparu_le IS NULL AND NOT e.est_dossier
     WHERE c.md5 <> ''` : '';

  const sources = [registre, index].filter((s) => s !== '').join('\n     UNION ALL\n');

  /**
   * ⚠️ SANS L'INDEX (migration 299), `gestion_drive_empreinte` N'EXISTE PAS et ne doit être NOMMÉE NULLE PART :
   * la remontée des chemins disparaît alors entièrement, et chaque emplacement se réduit au nom de dossier que le
   * registre a gardé. L'écran dit moins ; il ne casse pas, et il ne ment pas.
   */
  const remontee = avecIndex ? `,
    /* 🔴 LES CHEMINS, REMONTÉS EN BASE : l'index porte aussi les DOSSIERS, donc leurs parents. Zéro appel Google. */
    remontee AS (
      SELECT e.drive_file_id, e.nom, e.parent_id, 1 AS niveau
        FROM gestion_drive_empreinte e
       WHERE e.drive_file_id IN (SELECT parent_id FROM uniques WHERE coalesce(btrim(parent_id), '') <> '')
      UNION
      SELECT a.drive_file_id, a.nom, a.parent_id, r.niveau + 1
        FROM gestion_drive_empreinte a
        JOIN remontee r ON a.drive_file_id = r.parent_id
       WHERE r.niveau < 32
    )` : '';
  const noeudsSql = avecIndex ? `
    UNION ALL
    SELECT 'noeud', NULL, drive_file_id, nom, parent_id, NULL, NULL
      FROM remontee` : '';

  const sql = `
    WITH RECURSIVE cibles AS (
      SELECT p.id AS piece_id, ${nomPiece} AS nom_piece, ${md5Piece} AS md5
        FROM gestion_piece p
       WHERE ${ouPieces}
    ),
    toutes AS (${sources}
    ),
    classees AS (
      SELECT piece_id, drive_file_id, nom, parent_id, dossier_nom, voie,
             row_number() OVER (
               PARTITION BY piece_id, drive_file_id ORDER BY (voie = 'registre') DESC
             ) AS rang_doublon,
             row_number() OVER (
               PARTITION BY piece_id ORDER BY (voie = 'registre') DESC, drive_file_id
             ) AS rang
        FROM toutes
    ),
    uniques AS (
      SELECT piece_id, drive_file_id, nom, parent_id, dossier_nom, voie
        FROM classees WHERE rang_doublon = 1 AND rang <= ${EMPLACEMENTS_MAX}
    )${remontee}
    SELECT 'emplacement' AS sorte, piece_id::text AS piece, drive_file_id, nom, parent_id, dossier_nom, voie
      FROM uniques${noeudsSql}`;

  const parametre = parPieces
    ? [...cible.pieceIds]
    : ('messageId' in cible ? cible.messageId : cible.filId);
  const { rows } = await query<LigneBrute>(sql, [parametre]);

  /* ── ③ L'ASSEMBLAGE, en mémoire : les nœuds tracent les chemins, les emplacements se rangent par pièce ──────── */
  const noeuds = new Map<string, { nom: string; parentId: string | null }>();
  for (const r of rows) {
    if (r.sorte !== 'noeud') continue;
    noeuds.set(r.drive_file_id, { nom: r.nom ?? '', parentId: r.parent_id });
  }

  const parPiece = new Map<number, EmplacementPiece[]>();
  for (const r of rows) {
    if (r.sorte !== 'emplacement' || r.piece === null) continue;
    const id = Number(r.piece);
    const liste = parPiece.get(id) ?? [];
    liste.push({
      driveFileId: r.drive_file_id,
      nom: (r.nom ?? '').trim(),
      dossierId: (r.parent_id ?? '').trim(),
      dossierNom: r.dossier_nom,
      /* 🔴 LE MÊME TRACÉ QUE L'INDEX DES EMPREINTES (`cheminDepuisIndex`), borné et à l'épreuve des cycles. */
      chemin: cheminDepuisIndex(r.parent_id, noeuds),
      voie: r.voie === 'registre' ? 'registre' : 'empreinte',
    });
    parPiece.set(id, liste);
  }

  return [...parPiece.entries()]
    .map(([pieceId, emplacements]) => ({ pieceId, emplacements }))
    .sort((a, b) => a.pieceId - b.pieceId);
}
