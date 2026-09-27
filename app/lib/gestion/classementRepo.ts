/**
 * MODULE « GESTION » — LOT CLASSEMENT-1 : CE QUE LA BASE SAIT DU CLASSEMENT. IMPUR (SQL), LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 AUCUNE ÉCRITURE, NULLE PART. Ni base, ni Drive, ni MinIO. Ce fichier n'émet que des `SELECT` — un test le
 * vérifie sur la source. La décision est dans `classement.ts` (pur) ; le déplacement, s'il a lieu un jour, est dans
 * `classementDrive.ts` et ne s'exécute pas tant qu'Arno n'a pas tranché.
 *
 * 🔴 LES RATTACHEMENTS PORTENT SUR LES MAILS, PAS SUR LES PIÈCES — mesuré le 27/09/2026 : les 43 204 lignes de
 * `gestion_rattachement` ont toutes `piece_id IS NULL`. C'est la convention du lot RATTACHEMENT-1 (« piece_id NULL =
 * le mail entier »). Le plan d'une pièce se déduit donc de SON MESSAGE, et une pièce hérite de ce que son mail sait.
 *
 * 🔴 SEULS LES RATTACHEMENTS « confirme » COMPTENT. Un « propose » est une hypothèse que personne n'a validée : ranger
 * un document sur une hypothèse, c'est le perdre à l'endroit où on croira l'avoir mis. Mesuré : 5 493 propositions en
 * attente, dont le rapport donne le nombre pour qu'Arno sache ce que leur confirmation débloquerait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { rattachementsDisponibles, arbreDriveDisponible } from './schema';
import type { PieceAClasser } from './classement';

/** Combien de pièces par paquet. Le plan est calculé en mémoire : on ne charge pas 27 000 lignes d'un coup. */
export const LOT_CLASSEMENT = 500;

/** Une pièce, ses rattachements confirmés, et sa copie Drive quand elle existe. */
export interface PieceEtCopie extends PieceAClasser {
  /** L'identifiant de la copie dans « 00 Arrivée des mails ». `null` = rien à déplacer. */
  driveFileId: string | null;
  /** Son empreinte, pour le rapprochement avec la production. */
  md5: string | null;
  tailleOctets: number | null;
}

/**
 * LES PIÈCES À CLASSER, par paquets, du plus petit identifiant au plus grand. LECTURE SEULE.
 *
 * ⚠️ LES DEUX SONDES AVANT D'ÉMETTRE LE SQL. Sans la migration 257 il n'y a pas de rattachement, sans la 254 pas
 * d'arborescence : dans les deux cas on rend une liste vide plutôt que de nommer une table absente, ce qui ferait
 * échouer toute la commande.
 *
 * ⚠️ `array_agg(DISTINCT …) FILTER` PLUTÔT QUE DEUX SOUS-REQUÊTES PAR PIÈCE. Sur 27 000 pièces, deux sous-requêtes
 * corrélées chacune sur `gestion_rattachement` coûtaient 54 000 accès ; un seul passage regroupé par message les
 * ramène à un. MESURÉ : 41 s en sous-requêtes, 1,3 s ainsi.
 */
export async function chargerAClasser(depuis: number, lot = LOT_CLASSEMENT): Promise<PieceEtCopie[]> {
  if (!(await rattachementsDisponibles()) || !(await arbreDriveDisponible())) return [];

  const { rows } = await query<{
    id: string; nom_fichier: string; objet: string | null; extrait: string | null; recu_le: string;
    lots: string[] | null; props: string[] | null;
    drive_file_id: string | null; md5: string | null; taille_octets: string | null;
  }>(
    `WITH page AS (
       SELECT p.id, p.nom_fichier, p.message_id, p.taille_octets
         FROM gestion_piece p
        WHERE p.id > $1
        ORDER BY p.id
        LIMIT $2
     ),
     liens AS (
       SELECT r.message_id,
              array_agg(DISTINCT r.cible_cle) FILTER (WHERE r.cible_sorte = 'lot')          AS lots,
              array_agg(DISTINCT r.cible_cle) FILTER (WHERE r.cible_sorte = 'proprietaire') AS props
         FROM gestion_rattachement r
        WHERE r.piece_id IS NULL AND r.statut = 'confirme'
          AND r.message_id IN (SELECT message_id FROM page)
        GROUP BY r.message_id
     )
     SELECT pg.id, pg.nom_fichier, m.objet,
            left(coalesce(m.corps_texte, ''), 400) AS extrait,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            l.lots, l.props,
            d.drive_file_id, d.md5, pg.taille_octets::text
       FROM page pg
       JOIN gestion_message m ON m.id = pg.message_id
       LEFT JOIN liens l ON l.message_id = pg.message_id
       -- La copie que NOUS avons faite, et elle seule : c'est le fichier qu'un classement déplacerait.
       LEFT JOIN gestion_piece_drive d
              ON d.piece_id = pg.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL
      ORDER BY pg.id`, [depuis, lot]);

  return rows.map((r) => ({
    pieceId: Number(r.id), nomFichier: r.nom_fichier, objet: r.objet, extrait: r.extrait, recuLe: r.recu_le,
    lotsConfirmes: r.lots ?? [], proprietairesConfirmes: r.props ?? [],
    driveFileId: r.drive_file_id, md5: r.md5,
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
  }));
}

/**
 * LES DOSSIERS MÉMORISÉS, indexés par `(sorte, clé)` — c'est ce qui transforme une cible de plan en identifiant Drive.
 * LECTURE SEULE.
 *
 * 🔴 C'EST AUSSI LA LISTE BLANCHE. Une cible absente de cette carte ne donne aucun identifiant, donc aucun
 * déplacement possible : un plan ne peut pas désigner un dossier que le programme n'a pas créé, et donc jamais un
 * dossier de la production.
 */
export async function dossiersMemorises(): Promise<Map<string, { driveId: string; chemin: string }>> {
  const m = new Map<string, { driveId: string; chemin: string }>();
  if (!(await arbreDriveDisponible())) return m;
  const { rows } = await query<{ sorte: string; cle: string; drive_id: string; chemin: string }>(
    `SELECT sorte, cle, drive_id, chemin FROM gestion_drive_arbre WHERE absent_le IS NULL`);
  for (const r of rows) m.set(`${r.sorte}|${r.cle}`, { driveId: r.drive_id, chemin: r.chemin });
  return m;
}

/**
 * LES DOUBLONS AVEC LA PRODUCTION, par EMPREINTE. LECTURE SEULE, et EN BASE UNIQUEMENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 AUCUN APPEL DRIVE : on lit `gestion_drive_production`, l'inventaire du lot DRIVE-2-bis, relevé le 26/09/2026 à
 * 11:50 (32 026 fichiers, 32 023 avec empreinte, 69 Go). Il n'est PAS relancé — un inventaire de 32 000 fichiers
 * prend une demi-heure et « Documents clients scannés » ne doit pas même être relu cette nuit.
 *
 * 🔴 LE MD5 EST LE SEUL RAPPROCHEMENT SÛR. Ni le nom (« scan.pdf » existe cent fois), ni la taille (deux PDF de
 * 110 876 octets peuvent différer), ni la date. Deux fichiers de même MD5 sont le même document — c'est ce que le lot
 * DRIVE-2-bis a établi, et c'est ce qui permet de dire à Arno « ce document est DÉJÀ en production, là ».
 *
 * ⚠️ UN MD5 PEUT CORRESPONDRE À PLUSIEURS FICHIERS DE PRODUCTION (le même document rangé deux fois). On rend donc
 * une liste de chemins, bornée, plutôt qu'un seul — et le nombre total, pour ne pas laisser croire qu'il n'y en a
 * qu'un.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function doublonsProduction(
  md5s: readonly string[], cheminsMax = 3,
): Promise<Map<string, { total: number; chemins: string[] }>> {
  const m = new Map<string, { total: number; chemins: string[] }>();
  const propres = [...new Set(md5s.map((x) => (x ?? '').trim().toLowerCase()).filter((x) => x !== ''))];
  if (propres.length === 0) return m;
  const { rows } = await query<{ md5: string; total: string; chemins: string[] }>(
    `SELECT lower(md5) AS md5, count(*)::text AS total,
            (array_agg(coalesce(chemin, nom, drive_file_id) ORDER BY chemin))[1:$2] AS chemins
       FROM gestion_drive_production
      WHERE md5 IS NOT NULL AND lower(md5) = ANY($1::text[])
      GROUP BY lower(md5)`, [propres, cheminsMax]);
  for (const r of rows) m.set(r.md5, { total: Number(r.total), chemins: r.chemins ?? [] });
  return m;
}

/** Les chiffres d'ensemble qui éclairent le plan, sans le calculer. LECTURE SEULE. */
export async function chiffresClassement(): Promise<{
  pieces: number; piecesAvecCopie: number; messagesConfirmes: number; messagesProposes: number;
  productionFichiers: number; productionAvecMd5: number; productionReleveLe: string | null;
}> {
  const { rows: p } = await query<{ n: string; avec: string }>(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM gestion_piece_drive d
               WHERE d.piece_id = gestion_piece.id AND d.origine = 'copie' AND d.verifie_le IS NOT NULL))::text AS avec
       FROM gestion_piece`);
  const { rows: r } = await query<{ confirmes: string; proposes: string }>(
    `SELECT count(DISTINCT message_id) FILTER (WHERE statut = 'confirme')::text AS confirmes,
            count(DISTINCT message_id) FILTER (WHERE statut = 'propose')::text  AS proposes
       FROM gestion_rattachement WHERE piece_id IS NULL`);
  const { rows: pr } = await query<{ n: string; avec: string; le: string | null }>(
    `SELECT count(*)::text AS n, count(md5)::text AS avec,
            to_char(max(releve_le) AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS le
       FROM gestion_drive_production`);
  return {
    pieces: Number(p[0]?.n ?? 0), piecesAvecCopie: Number(p[0]?.avec ?? 0),
    messagesConfirmes: Number(r[0]?.confirmes ?? 0), messagesProposes: Number(r[0]?.proposes ?? 0),
    productionFichiers: Number(pr[0]?.n ?? 0), productionAvecMd5: Number(pr[0]?.avec ?? 0),
    productionReleveLe: pr[0]?.le ?? null,
  };
}
