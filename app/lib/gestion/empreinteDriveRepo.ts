import { query } from '../db/client';
import { indexEmpreintesDriveDisponible, pieceMd5Disponible } from './schema';
import { cheminDepuisIndex, empreinteNormalisee, type LigneIndex } from './indexEmpreintesDrive';

/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — CE QUE LA BASE SAIT DES EMPREINTES DU DRIVE ═════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒🔒 CE MODULE NE SAIT PAS ÉCRIRE DANS LE DRIVE, ET C'EST UNE PROPRIÉTÉ DE SON CODE : il n'importe aucun module
 * Drive, pas même en lecture, et n'émet pas un `fetch`. Il range des métadonnées qu'un appelant a lues, et il
 * répond à une seule question — « quels fichiers portent cette empreinte ? ». Un garde statique le vérifie.
 *
 * 🔴 L'INDEX EST UN REFLET, JAMAIS UNE VÉRITÉ. Le Drive fait foi ; cette table dit « voici ce que j'ai vu, et
 * quand ». C'est pourquoi chaque lecture rend aussi la DATE du relevé : l'écran doit pouvoir dire depuis quand il
 * sait, et ne jamais promettre l'exhaustivité.
 *
 * 🔴🔴 « Documents clients scannés » Y ENTRE EN MÉTADONNÉES, ET SEULEMENT EN MÉTADONNÉES — un nom, un parent, une
 * empreinte. C'est ce qui permet de DIRE qu'un document y est déjà rangé sans jamais en ouvrir le contenu. Aucune
 * ligne d'ici ne donne le droit d'y écrire, et le garde d'écriture de `driveDeplacement` n'est pas effleuré.
 *
 * ⚠️ SANS LA MIGRATION 299, la table n'est NOMMÉE NULLE PART : chaque fonction rend « rien » et l'appelant
 * retombe sur le niveau 1. Rien ne casse, et rien ne ment.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que l'index sait d'un fichier qui porte l'empreinte cherchée. */
export interface FichierIndexe {
  driveFileId: string;
  nom: string;
  parentId: string | null;
  driveId: string | null;
  /** Le chemin, du parent immédiat à la racine, reconstitué EN BASE — zéro appel Google. */
  chemin: { id: string; nom: string }[];
  releveLe: Date | null;
}

/** La borne de tout ce qui sort d'ici : la fenêtre doit répondre tout de suite, et 50 emplacements suffisent. */
export const FICHIERS_MAX = 50;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'EMPREINTE D'UN DOCUMENT, SANS APPELER GOOGLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * L'EMPREINTE D'UNE PIÈCE, telle que la migration 298 l'a rangée.
 *
 * 🔴 ELLE EST LE POINT DE DÉPART DE TOUT LE NIVEAU 2. Une pièce revenue renommée n'a aucun dépôt à son nom : si
 * l'on ne connaissait son empreinte que par ses copies au registre, on ne saurait jamais quoi chercher dans
 * l'index. C'est son empreinte PROPRE qu'il faut, et elle est en base depuis la capture.
 */
export async function md5DeLaPiece(pieceId: number): Promise<string | null> {
  if (!Number.isSafeInteger(pieceId) || pieceId <= 0) return null;
  if (!(await pieceMd5Disponible())) return null;
  const { rows } = await query<{ md5: string | null }>(
    'SELECT md5 FROM gestion_piece WHERE id = $1', [pieceId]);
  return empreinteNormalisee(rows[0]?.md5 ?? null);
}

/**
 * L'EMPREINTE D'UN FICHIER DU DRIVE, telle que l'index l'a relevée.
 *
 * ⚠️ ELLE ÉVITE UN `files.get`, et c'est ce qui rend la loupe gratuite sur une vignette dupliquée : si le fichier
 * est indexé, on connaît son empreinte sans rien demander à Google. Absent de l'index ⇒ `null`, et l'appelant
 * reste libre d'aller la chercher lui-même.
 */
export async function md5IndexeDuFichier(driveFileId: string): Promise<string | null> {
  const id = (driveFileId ?? '').trim();
  if (id === '') return null;
  if (!(await indexEmpreintesDriveDisponible())) return null;
  const { rows } = await query<{ md5: string | null }>(
    'SELECT md5 FROM gestion_drive_empreinte WHERE drive_file_id = $1 AND disparu_le IS NULL', [id]);
  return empreinteNormalisee(rows[0]?.md5 ?? null);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA QUESTION QUE GOOGLE REFUSE : « QUELS FICHIERS PORTENT CETTE EMPREINTE ? »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LES FICHIERS DE MÊME CONTENU, AVEC LEUR CHEMIN, EN UNE SEULE REQUÊTE ════════════════════════════════════
 *
 * C'est exactement la requête que `files.list` refuse (HTTP 400 sur `q=md5Checksum='…'`), et c'est pour elle que
 * l'index existe.
 *
 * 🔴 LE CHEMIN SE REMONTE EN BASE, PAR UN `WITH RECURSIVE`, et non par un appel Google par niveau. Les dossiers
 * sont indexés au même titre que les fichiers : c'est ce qui rend la remontée possible sans réseau.
 *
 * ⚠️ BORNÉE EN NOMBRE **ET** EN PROFONDEUR : un contenu recopié mille fois ne doit pas remplir l'écran, et une
 * table abîmée par un cycle ne doit pas figer la fenêtre. La profondeur est tenue par `cheminDepuisIndex`, qui
 * refuse de repasser par un identifiant déjà vu.
 */
export async function fichiersDeMemeEmpreinte(
  md5: string | null, limite = FICHIERS_MAX,
): Promise<FichierIndexe[]> {
  const e = empreinteNormalisee(md5);
  if (e === null) return [];
  if (!(await indexEmpreintesDriveDisponible())) return [];

  const { rows } = await query<{
    drive_file_id: string; nom: string; parent_id: string | null; drive_id: string | null; releve_le: string;
  }>(
    `SELECT drive_file_id, nom, parent_id, drive_id, releve_le::text
       FROM gestion_drive_empreinte
      WHERE lower(md5) = $1 AND disparu_le IS NULL AND NOT est_dossier
      ORDER BY releve_le DESC
      LIMIT $2`, [e, Math.max(1, Math.min(limite, FICHIERS_MAX))]);
  if (rows.length === 0) return [];

  /**
   * 🔴 LES ANCÊTRES DE TOUS LES RÉSULTATS, EN UNE REQUÊTE. Un `WITH RECURSIVE` les remonte tous à la fois ; une
   * boucle aurait émis une requête par niveau et par fichier, soit des dizaines pour afficher un chemin.
   */
  const parents = rows.map((r) => r.parent_id).filter((x): x is string => (x ?? '') !== '');
  const noeuds = new Map<string, { nom: string; parentId: string | null }>();
  if (parents.length > 0) {
    const { rows: anc } = await query<{ drive_file_id: string; nom: string; parent_id: string | null }>(
      `WITH RECURSIVE remontee AS (
         SELECT drive_file_id, nom, parent_id, 1 AS niveau
           FROM gestion_drive_empreinte WHERE drive_file_id = ANY($1::text[])
         UNION
         SELECT d.drive_file_id, d.nom, d.parent_id, r.niveau + 1
           FROM gestion_drive_empreinte d
           JOIN remontee r ON d.drive_file_id = r.parent_id
          WHERE r.niveau < 32
       )
       SELECT drive_file_id, nom, parent_id FROM remontee`, [parents]);
    for (const a of anc) noeuds.set(a.drive_file_id, { nom: a.nom, parentId: a.parent_id });
  }

  return rows.map((r) => ({
    driveFileId: r.drive_file_id,
    nom: r.nom,
    parentId: r.parent_id,
    driveId: r.drive_id,
    chemin: cheminDepuisIndex(r.parent_id, noeuds),
    releveLe: new Date(r.releve_le),
  }));
}

/**
 * COMBIEN D'EMPREINTES L'INDEX CONNAÎT, ET DEPUIS QUAND.
 *
 * 🔴 C'EST CE QUI PERMET À L'ÉCRAN DE DIRE LA VÉRITÉ sur l'étendue de sa recherche. Sans ce nombre, la fenêtre
 * annoncerait « le Drive n'est pas balayé » alors qu'il l'est, ou l'inverse — et c'est l'inverse qui est grave.
 */
export async function etatDeLIndex(): Promise<{ fichiers: number; releveLe: Date | null }> {
  if (!(await indexEmpreintesDriveDisponible())) return { fichiers: 0, releveLe: null };
  const { rows } = await query<{ n: string; dernier: string | null }>(
    `SELECT count(*)::text AS n, max(releve_le)::text AS dernier
       FROM gestion_drive_empreinte
      WHERE md5 IS NOT NULL AND disparu_le IS NULL`);
  return {
    fichiers: Number(rows[0]?.n ?? '0'),
    releveLe: (rows[0]?.dernier ?? null) === null ? null : new Date(rows[0].dernier as string),
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ ALIMENTER L'INDEX — SANS JAMAIS RIEN ÉCRIRE DANS LE DRIVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 RANGER CE QU'ON VIENT DE VOIR. Les deux sources appellent cette seule fonction. ════════════════════════
 *
 *   ① CHAQUE DOSSIER OUVERT dans la fenêtre. La liste porte déjà l'empreinte de chaque ligne — elle arrive dans
 *      le MÊME appel que les noms, donc gratuitement. C'est l'alimentation la plus précieuse : elle couvre
 *      exactement les endroits où l'on travaille.
 *   ② LE BALAYAGE DE FOND, et plus tard `changes.list`.
 *
 * 🔴 `ON CONFLICT … DO UPDATE` : revoir un fichier MET À JOUR son reflet et sa date. Un fichier renommé ou
 * remplacé dans le Drive ne doit pas garder chez nous le nom et l'empreinte de l'an dernier.
 *
 * ⚠️ `releve_le = now()` À CHAQUE PASSAGE, même si rien n'a changé : la date dit « je l'ai VU », pas « il a
 * changé ». C'est elle qui permet de répondre « depuis quand sais-tu ça ? ».
 *
 * ⚠️ `disparu_le = NULL` AU RETOUR : un fichier qu'on revoit n'est plus disparu. Sans ce retour, une suppression
 * puis une restauration dans le Drive l'aurait effacé de l'index pour de bon.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA PAGE, par `unnest` : mille `INSERT` séparés pour une page de mille entrées
 * auraient fait du balayage un chantier de base de données, pas une lecture.
 */
export async function noterFichiersVus(lignes: readonly LigneIndex[]): Promise<number> {
  if (lignes.length === 0) return 0;
  if (!(await indexEmpreintesDriveDisponible())) return 0;
  const { rowCount } = await query(
    `INSERT INTO gestion_drive_empreinte
       (drive_file_id, md5, nom, parent_id, drive_id, est_dossier, type_mime, taille_octets, modifie_le, releve_le)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::bigint[],
       $9::timestamptz[]
     ) AS t(drive_file_id, md5, nom, parent_id, drive_id, est_dossier, type_mime, taille_octets, modifie_le)
     CROSS JOIN (SELECT now() AS releve_le) h
     ON CONFLICT (drive_file_id) DO UPDATE SET
       md5 = EXCLUDED.md5, nom = EXCLUDED.nom, parent_id = EXCLUDED.parent_id, drive_id = EXCLUDED.drive_id,
       est_dossier = EXCLUDED.est_dossier, type_mime = EXCLUDED.type_mime,
       taille_octets = EXCLUDED.taille_octets, modifie_le = EXCLUDED.modifie_le,
       releve_le = now(), disparu_le = NULL`,
    [
      lignes.map((l) => l.driveFileId), lignes.map((l) => l.md5), lignes.map((l) => l.nom),
      lignes.map((l) => l.parentId), lignes.map((l) => l.driveId), lignes.map((l) => l.estDossier),
      lignes.map((l) => l.typeMime), lignes.map((l) => l.tailleOctets), lignes.map((l) => l.modifieLe),
    ]);
  return rowCount ?? 0;
}

/**
 * MARQUER DISPARUS des fichiers que `changes.list` annonce supprimés ou mis à la corbeille.
 *
 * 🔴 ON DATE, ON N'EFFACE PAS. Une ligne supprimée ne dirait plus rien ; une ligne datée dit « ce contenu a été
 * ici jusqu'au … », et c'est ce qu'on veut lire six mois plus tard en cherchant où un document est passé.
 */
export async function noterFichiersDisparus(ids: readonly string[]): Promise<number> {
  const propres = [...new Set(ids.map((x) => (x ?? '').trim()).filter((x) => x !== ''))];
  if (propres.length === 0) return 0;
  if (!(await indexEmpreintesDriveDisponible())) return 0;
  const { rowCount } = await query(
    `UPDATE gestion_drive_empreinte SET disparu_le = now()
      WHERE drive_file_id = ANY($1::text[]) AND disparu_le IS NULL`, [propres]);
  return rowCount ?? 0;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ OÙ EN EST L'INDEX, CORPUS PAR CORPUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface EtatCorpus {
  corpus: string;
  nom: string | null;
  pageToken: string | null;
  balayeLe: Date | null;
  incrementLe: Date | null;
  fichiers: number | null;
  dossiers: number | null;
  pages: number | null;
  dureeMs: number | null;
}

export async function etatsDesCorpus(): Promise<EtatCorpus[]> {
  if (!(await indexEmpreintesDriveDisponible())) return [];
  const { rows } = await query<{
    corpus: string; nom: string | null; page_token: string | null; balaye_le: string | null;
    increment_le: string | null; fichiers: string | null; dossiers: string | null;
    pages: number | null; duree_ms: string | null;
  }>(`SELECT corpus, nom, page_token, balaye_le::text, increment_le::text,
             fichiers::text, dossiers::text, pages, duree_ms::text
        FROM gestion_drive_index_etat ORDER BY corpus`);
  return rows.map((r) => ({
    corpus: r.corpus,
    nom: r.nom,
    pageToken: r.page_token,
    balayeLe: r.balaye_le === null ? null : new Date(r.balaye_le),
    incrementLe: r.increment_le === null ? null : new Date(r.increment_le),
    fichiers: r.fichiers === null ? null : Number(r.fichiers),
    dossiers: r.dossiers === null ? null : Number(r.dossiers),
    pages: r.pages,
    dureeMs: r.duree_ms === null ? null : Number(r.duree_ms),
  }));
}

/**
 * NOTER CE QU'UN BALAYAGE A FAIT, et le jeton qui permettra de ne plus le refaire.
 *
 * 🔴 LE JETON DE REPRISE EST LE POINT LE PLUS IMPORTANT DE CETTE TABLE. `changes.list` exige un
 * `startPageToken` obtenu AVANT le balayage : le perdre obligerait à tout rebalayer — 209 appels et six minutes.
 */
export async function noterBalayage(o: {
  corpus: string; nom: string | null; pageToken: string | null;
  fichiers: number; dossiers: number; pages: number; dureeMs: number;
}): Promise<void> {
  if (!(await indexEmpreintesDriveDisponible())) return;
  await query(
    `INSERT INTO gestion_drive_index_etat
       (corpus, nom, page_token, balaye_le, fichiers, dossiers, pages, duree_ms)
     VALUES ($1,$2,$3, now(), $4,$5,$6,$7)
     ON CONFLICT (corpus) DO UPDATE SET
       nom = EXCLUDED.nom,
       /* ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le littéral de gabarit (piège vu 10 fois).
          ON NE PERD PAS UN JETON DEJA RANGE au profit d'une valeur nulle : un balayage qui n'a pas su en
          obtenir un ne doit pas effacer celui du balayage precedent, qui marche encore. */
       page_token = coalesce(EXCLUDED.page_token, gestion_drive_index_etat.page_token),
       balaye_le = now(), fichiers = EXCLUDED.fichiers, dossiers = EXCLUDED.dossiers,
       pages = EXCLUDED.pages, duree_ms = EXCLUDED.duree_ms`,
    [o.corpus, o.nom, o.pageToken, o.fichiers, o.dossiers, o.pages, o.dureeMs]);
}

/** NOTER UN INCRÉMENT : le nouveau jeton de reprise, et la date. Rien d'autre ne change. */
export async function noterIncrement(corpus: string, pageToken: string | null): Promise<void> {
  if (!(await indexEmpreintesDriveDisponible())) return;
  await query(
    `UPDATE gestion_drive_index_etat
        SET page_token = coalesce($2, page_token), increment_le = now()
      WHERE corpus = $1`, [corpus, pageToken]);
}
