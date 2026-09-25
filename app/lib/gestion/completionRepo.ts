/**
 * MODULE « GESTION » — LOT 5-DEST : les I/O de la complétion des destinataires. SEUL fichier du lot qui écrit.
 *
 * 🔒 PÉRIMÈTRE D'ÉCRITURE, VOLONTAIREMENT MINUSCULE ET ÉNUMÉRÉ ICI :
 *      ① `gestion_message.dest_a / dest_cc / dest_cci / repondre_a`, et UNIQUEMENT sur des lignes où `dest_a IS NULL` ;
 *      ② une ligne de `gestion_journal` par passe appliquée.
 *    Rien d'autre. Aucun réglage (`gestion_config`, règles d'exclusion) n'est touché, aucune passe n'est inscrite au
 *    journal des relèves, aucune ligne n'est créée ni supprimée nulle part.
 *
 * 🔒 `maj_le` N'EST PAS TOUCHÉE, ET C'EST DÉLIBÉRÉ. Elle date le dernier changement MÉTIER d'un message ; remonter
 *    27 833 lignes à aujourd'hui parce qu'on a relu leurs en-têtes ferait passer un rattrapage technique pour une
 *    activité réelle, et brouillerait une colonne dont c'est le seul usage.
 *
 * 🔴 LE `dest_a IS NULL` EST DANS LE `WHERE` DE L'UPDATE, pas seulement dans la sélection d'amont. Entre le moment où
 *    on lit les candidats et celui où on écrit, une relève ordinaire peut avoir capturé et analysé la même ligne. Le
 *    filtre porté en amont seul laisserait alors ÉCRASER une valeur fraîche par une valeur relue — et le `rowCount`
 *    à 0 est précisément ce qui nous apprend que le cas s'est produit (compteur `dejaFaits`).
 */
import { query, withTransaction } from '../db/client';
import type { AEcrire, LigneACompleter, RapportCompletion } from './completion';

/**
 * Les lignes qui n'ont JAMAIS été analysées, les plus anciennes d'abord (`id` croissant = ordre de capture).
 *
 * `uid_imap` est cast en `int` : les UID d'un dossier IMAP tiennent largement dans un entier (le plus grand mesuré ici
 * vaut 55 972), et `pg` rendrait sinon un `bigint` SOUS FORME DE CHAÎNE — un piège déjà payé dans ce dépôt, où une
 * comparaison stricte se met alors à mentir en silence. `uid_validity` reste en TEXTE et se compare en texte : elle ne
 * sert jamais de nombre, seulement d'égalité.
 */
export async function lireACompleter(limite: number): Promise<LigneACompleter[]> {
  const { rows } = await query<{ id: number; message_id: string; uid_imap: number | null; uid_validity: string | null }>(
    `SELECT id::int AS id, message_id, uid_imap::int AS uid_imap, uid_validity::text AS uid_validity
       FROM gestion_message
      WHERE dest_a IS NULL
      ORDER BY id
      LIMIT $1`,
    [limite],
  );
  return rows.map((r) => ({ id: r.id, messageId: r.message_id, uidImap: r.uid_imap, uidValidity: r.uid_validity }));
}

/** Combien de lignes restent « jamais analysées ». Sert au compte rendu ET à la détection du surplace. */
export async function compterRestantes(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_message WHERE dest_a IS NULL`);
  return rows[0]?.n ?? 0;
}

/** Ce qu'un lot d'écriture rapporte : les lignes réellement touchées, et celles qu'une autre passe avait déjà faites. */
export interface IssueEcriture { completes: number; dejaFaits: number }

/**
 * ÉCRIT un lot de destinataires, dans UNE transaction. Chaque ligne est écrite séparément pour que son `rowCount` soit
 * lisible un par un : c'est lui, et lui seul, qui distingue « complété » de « une autre passe l'avait déjà fait ».
 *
 * Aucun chemin de refus après une écriture : `withTransaction` VALIDE au retour normal (piège documenté du dépôt), donc
 * une fonction qui déciderait de refuser APRÈS un UPDATE écrirait quand même. Ici il n'y a rien à refuser — on écrit ou
 * on n'écrit pas, et le `WHERE dest_a IS NULL` tranche côté base.
 */
export async function ecrireLot(lot: readonly AEcrire[]): Promise<IssueEcriture> {
  if (lot.length === 0) return { completes: 0, dejaFaits: 0 };
  return withTransaction(async (q) => {
    let completes = 0;
    let dejaFaits = 0;
    for (const a of lot) {
      const d = a.destinataires;
      const { rowCount } = await q(
        `UPDATE gestion_message
            SET dest_a = $2::jsonb, dest_cc = $3::jsonb, dest_cci = $4::jsonb, repondre_a = $5::jsonb
          WHERE id = $1 AND dest_a IS NULL`,
        [a.id, JSON.stringify(d.a), JSON.stringify(d.cc), JSON.stringify(d.cci), JSON.stringify(d.repondreA)],
      );
      if ((rowCount ?? 0) > 0) completes += 1;
      else dejaFaits += 1;
    }
    return { completes, dejaFaits };
  });
}

/**
 * L'AUTEUR de l'opération, nom FIGÉ. Ce n'est ni une personne ni « automatique » : c'est une OPÉRATION nommée, du même
 * patron que « migration 229 » dans ce journal. Des années après, on doit pouvoir savoir quelle commande a écrit ça.
 */
export const AUTEUR_COMPLETION = 'gestion:completer-destinataires';

/**
 * ⚠️ `entite = 'releve'`, `entite_id = 0`. Le journal du module n'a AUCUNE clé étrangère (ni sur `entite_id`, ni sur
 * `auteur_id`) — c'est écrit dans la migration 228, pour que la trace survive à la purge de l'objet. Un `entite_id` de
 * 0 dit donc exactement ce qu'il doit dire : l'opération ne porte sur AUCUNE passe de relève enregistrée, parce qu'elle
 * n'en crée pas. La liste fermée des entités n'a pas besoin d'être élargie, donc ce lot n'apporte aucune migration.
 */
export async function journaliserCompletion(r: RapportCompletion): Promise<void> {
  const details = [
    `${r.completes} message(s) complété(s)`,
    `${r.introuvables} introuvable(s) dans la boîte`,
    `${r.ambigus} Message-ID ambigu(s)`,
    `${r.echecs} échec(s) de lecture`,
    `${r.dejaFaits} déjà fait(s) par une autre passe`,
    `${r.resteNull} restant(s) à compléter`,
  ].join(' · ');
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
     VALUES ('releve', 0, 'completion_destinataires', $1, $2, $3, $4)`,
    [
      'dest_a NULL (jamais analysé)',
      `${r.completes} ligne(s) analysée(s)`,
      `Complétion des destinataires À / Cc / Cci / Répondre-à de messages capturés avant le lot 5-0. Seuls les quatre `
        + `champs de destinataires ont été écrits, et seulement sur des lignes jamais analysées ; aucun corps ni aucune `
        + `pièce n'a été téléchargé, la boîte n'a pas été modifiée. ${details}.`,
      AUTEUR_COMPLETION,
    ],
  );
}
