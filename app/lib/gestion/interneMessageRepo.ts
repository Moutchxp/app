import { query } from '../db/client';
import { interneDuMessageDisponible } from './schema';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » PAR MAIL. LE CÂBLAGE DE LA MIGRATION 297 ═══════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI. Les commandes de ligne (`tsx`) importent les dépôts du module, et
 * `server-only` lève hors du bundle react-server. La frontière client/serveur est tenue par
 * `app/lib/garde/serverOnly.guard.test.ts` et `clientBoundary.guard.test.ts` — convention du module, voir
 * `horsGestionRepo.ts`, dont ce fichier est le jumeau.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER TERMINE, ET POURQUOI IL N'EXISTAIT PAS. La migration 297 a été livrée le 03/10/2026 par le
 * commit 559d394a, qui s'est arrêté VOLONTAIREMENT : « Le modèle complet demande une marque PAR MAIL, donc la
 * MIGRATION 297 […], LIVRÉE ET NON APPLIQUÉE. Je m'arrête là et je demande l'accord d'Arno. » Le code n'a donc
 * jamais été écrit — rien n'a été perdu, et `git log -S"gestion_message_interne"` le confirme : deux commits en
 * tout, celui de la migration et un commentaire du 04/10. Arno a donné son accord le 04/10.
 *
 * ═══ 🔴🔴 LA RÈGLE, ET CE QU'ELLE CHANGE ═════════════════════════════════════════════════════════════════════════
 *
 * « Interne est un statut PAR MAIL. Le choix fait sur un mail s'applique selon les 3 fenêtres. Un choix ultérieur
 * ne doit jamais effacer le statut Interne d'un mail antérieur. Le repli sur la marque d'échange reste un repli,
 * utilisé seulement quand rien ne couvre le mail. » (Arno, 04/10/2026.)
 *
 * 🔴 LA RÈGLE DU REPLI VIT DANS UN MODULE PUR (`interneDuMail`), et le fragment SQL de ce fichier la rend MOT POUR
 * MOT. Deux écritures de la même règle — une en TypeScript pour la conversation, une en SQL pour la liste —
 * divergeraient au premier ajustement, et c'est précisément le défaut que le point 4 de ce lot vient de corriger :
 * la modale lisait les fenêtres, la liste lisait la marque d'échange, et les deux se contredisaient.
 *
 * 🔴 JAMAIS AUTOMATIQUE, comme son jumeau : un statut « interne » est une décision, elle a un auteur humain. La
 * base le refuse aussi de son côté (`gestion_message_interne_humain_chk`) — deux gardes pour la même règle, parce
 * qu'un garde applicatif se contourne au prochain script et une contrainte non.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ. Annuler écrit `retire_le` sur la ligne vivante ; elle reste, datée et signée. Et cette
 * ligne retirée COMPTE : elle dit « quelqu'un s'est prononcé sur ce mail », ce qui empêche la marque d'échange de
 * le ressusciter (cas ② de `interneDuMail`).
 *
 * ⚠️ SANS LA MIGRATION 297, LA TABLE N'EST NOMMÉE NULLE PART : chaque fonction sonde d'abord, et « interne » se
 * comporte exactement comme avant ce lot — la marque d'échange répond seule.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une marque PAR MAIL, telle que l'écran la lit. */
export interface MarqueInterneMessage {
  messageId: number;
  vivante: boolean;
  poseLe: string;
  posePar: string;
}

export type IssueInterneMessage = { ok: true; nb: number } | { ok: false; motif: string };

const SANS_MIGRATION = 'Mise à jour de la base à appliquer (migration 297) : le marquage « interne » par mail '
  + 'n’est pas encore installé.';

/** 🔴 L'AUTEUR EST-IL UN HUMAIN NOMMÉ ? La même règle que son jumeau, au mot près. PUR. */
export function auteurHumainInterneMessage(a: { libelle?: string | null } | null | undefined): boolean {
  const l = (a?.libelle ?? '').trim();
  return l !== '' && l.toLowerCase() !== 'automatique';
}

/** Les identifiants propres, sans doublon et bornés — même borne que le jumeau. */
const MESSAGES_MAX = 500;
function idsPropres(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, MESSAGES_MAX);
}

/**
 * CE QUE LA BASE SAIT DE CES MAILS — vivantes ET retirées. LECTURE SEULE.
 *
 * 🔴 LES RETIRÉES SONT RENDUES AUSSI, et c'est indispensable : sans elles, l'appelant ne peut pas distinguer
 * « personne ne s'est prononcé » de « on a retiré la marque » — et le repli ressusciterait un retrait. Voir le
 * cas ② de `interneDuMail`.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA PAGE : règle du module.
 */
export async function lireInterneDesMessages(
  messageIds: readonly number[],
): Promise<Map<number, MarqueInterneMessage>> {
  const m = new Map<number, MarqueInterneMessage>();
  const ids = idsPropres(messageIds);
  if (ids.length === 0 || !(await interneDuMessageDisponible())) return m;

  const { rows } = await query<{
    message_id: string; vivante: boolean; pose_le: string; pose_par: string;
  }>(
    /* 🔴 LA PLUS RÉCENTE PAR MAIL, vivante ou non : c'est elle qui dit l'état d'aujourd'hui. `DISTINCT ON` évite
       de rendre tout l'historique pour trente lignes de liste. */
    `SELECT DISTINCT ON (message_id)
            message_id::text,
            (retire_le IS NULL) AS vivante,
            to_char(pose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS pose_le,
            pose_par_libelle AS pose_par
       FROM gestion_message_interne
      WHERE message_id = ANY($1::bigint[])
      ORDER BY message_id, pose_le DESC, id DESC`, [ids]);

  // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, la clé de la carte ne retrouverait jamais son mail.
  for (const r of rows) {
    m.set(Number(r.message_id), {
      messageId: Number(r.message_id), vivante: r.vivante === true, poseLe: r.pose_le, posePar: r.pose_par,
    });
  }
  return m;
}

/**
 * MARQUER CES MAILS « INTERNE ». Un geste humain, borné aux mails nommés.
 *
 * ⚠️ `ON CONFLICT … DO NOTHING` SUR L'INDEX PARTIEL DES VIVANTES : reposer une marque déjà vivante ne crée pas un
 * doublon et ne lui fait pas perdre sa date d'origine. C'est le même diff que les rattachements — on ne réécrit
 * pas ce qui est déjà juste.
 */
export async function marquerInterneDesMessages(o: {
  messageIds: readonly number[]; auteur: Auteur;
}): Promise<IssueInterneMessage> {
  if (!(await interneDuMessageDisponible())) return { ok: false, motif: SANS_MIGRATION };
  if (!auteurHumainInterneMessage(o.auteur)) {
    return { ok: false, motif: '« Interne » ne se pose qu’à la main : l’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.messageIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun mail désigné.' };

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_message_interne (message_id, pose_par, pose_par_libelle)
     SELECT m.id, $2, $3 FROM gestion_message m WHERE m.id = ANY($1::bigint[])
     ON CONFLICT (message_id) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle]);
  return { ok: true, nb: rows.length };
}

/**
 * ANNULER « INTERNE » SUR CES MAILS. Le geste inverse, tout aussi explicite.
 *
 * 🔴 AUCUN `DELETE`. La ligne reste : on y écrit qui a annulé, quand, et pourquoi. Et sa présence même devient une
 * information — « quelqu'un s'est prononcé sur ce mail » — qui empêche la marque d'échange de le ressusciter.
 */
export async function annulerInterneDesMessages(o: {
  messageIds: readonly number[]; auteur: Auteur; motif?: string | null;
}): Promise<IssueInterneMessage> {
  if (!(await interneDuMessageDisponible())) return { ok: false, motif: SANS_MIGRATION };
  if (!auteurHumainInterneMessage(o.auteur)) {
    return { ok: false, motif: 'L’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.messageIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun mail désigné.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_message_interne
        SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
      WHERE message_id = ANY($1::bigint[]) AND retire_le IS NULL
      RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle,
      typeof o.motif === 'string' && o.motif.trim() !== '' ? o.motif.trim().slice(0, 300) : null]);
  return { ok: true, nb: rows.length };
}

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — DIRE « CE MAIL N'EST PAS INTERNE », SANS MARQUE À RETIRER ══════
 *
 * ═══ LE CAS EXACT, ET POURQUOI `annulerInterneDesMessages` NE PEUT PAS LE TRAITER ════════════════════════════════
 *
 * Un mail peut être « interne » SANS porter aucune marque par mail : c'est le cas ③ de `interneDuMail`, le REPLI
 * sur la marque de l'ÉCHANGE. Il n'y a alors RIEN à retirer — `UPDATE … WHERE retire_le IS NULL` ne trouve aucune
 * ligne, et le mail reste interne. Rattacher un bien n'aurait donc aucun effet sur son statut, et l'on
 * reconstruirait exactement l'état qu'Arno veut voir à zéro : « Interne avec bien ».
 *
 * 🔴 CE QU'ON ÉCRIT : UNE LIGNE NÉE RETIRÉE. C'est le mécanisme pour lequel le cas ② de `interneDuMail` a été
 * conçu, et son encadré le dit déjà mot pour mot : « cette ligne retirée COMPTE : elle dit “quelqu'un s'est
 * prononcé sur ce mail”, ce qui empêche la marque d'échange de le ressusciter ». On ne touche PAS la marque
 * d'échange : elle couvre d'autres mails, et les décider ici dépasserait la fenêtre choisie.
 *
 * ⚠️ `pose_par_libelle` PORTE LE NOM DE LA PERSONNE QUI A RATTACHÉ, ET IL FAUT LE LIRE POUR CE QU'IL EST : la
 * table n'a pas de colonne « motif de pose » (migration 297), et cette ligne n'est pas la trace d'un marquage
 * qu'on aurait posé puis retiré — c'est la trace d'une DÉCISION PRISE SUR CE MAIL, ouverte et fermée par le même
 * geste. Le `retire_motif` dit laquelle. Ajouter une colonne pour la seule élégance du journal coûterait une
 * migration à une table que ce lot n'a aucune raison de changer.
 *
 * 🔴 JAMAIS AUTOMATIQUE, comme les deux autres verbes : la contrainte `gestion_message_interne_humain_chk` le
 * refuse de son côté, et le garde applicatif le refuse ici.
 */
export async function declarerNonInterneDesMessages(o: {
  messageIds: readonly number[]; auteur: Auteur; motif: string;
}): Promise<IssueInterneMessage> {
  if (!(await interneDuMessageDisponible())) return { ok: false, motif: SANS_MIGRATION };
  if (!auteurHumainInterneMessage(o.auteur)) {
    return { ok: false, motif: 'L’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.messageIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun mail désigné.' };

  const { rows } = await query<{ id: string }>(
    /* ⚠️ `NOT EXISTS` : un mail qui porte DÉJÀ une ligne (vivante ou retirée) s'est déjà prononcé. Lui en ajouter
       une seconde n'apprendrait rien et brouillerait le `DISTINCT ON` de la lecture. Le retrait d'une marque
       vivante, lui, est le travail d'`annulerInterneDesMessages` — appelé avant celui-ci. */
    `INSERT INTO gestion_message_interne
       (message_id, pose_par, pose_par_libelle, retire_le, retire_par, retire_par_libelle, retire_motif)
     SELECT m.id, $2, $3, now(), $2, $3, $4
       FROM gestion_message m
      WHERE m.id = ANY($1::bigint[])
        AND NOT EXISTS (SELECT 1 FROM gestion_message_interne x WHERE x.message_id = m.id)
     RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle, o.motif.trim().slice(0, 300)]);
  return { ok: true, nb: rows.length };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE FRAGMENT SQL — LA MÊME RÈGLE QUE `interneDuMail`, RENDUE PAR LA BASE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA JOINTURE QUI LIT LA MARQUE PAR MAIL, dans une liste. Écrite ICI et importée par les listes : trois copies
 * auraient divergé, et la capsule aurait changé de sens d'un écran à l'autre.
 *
 * 🔴 ELLE REND DEUX COLONNES, ET IL EN FAUT DEUX : « vivante ? » et « connue ? ». Une seule (« vivante ») aurait
 * confondu « personne ne s'est prononcé » et « on a retiré la marque » — c'est-à-dire fait ressusciter un retrait
 * par le repli. Voir les cas ② et ③ de `interneDuMail`.
 *
 * ⚠️ `avec` FAUX (migration 297 absente) ⇒ CHAÎNE VIDE : la table n'est nommée nulle part, et la requête est mot
 * pour mot celle d'avant ce lot.
 *
 * ══ 🔴🔴 ELLE REÇOIT LA COLONNE, PAS UN ALIAS — ET C'EST UN DÉFAUT QUE L'ÉCRAN A ATTRAPÉ ═════════════════════════
 *
 * J'avais écrit `${alias}.id`, par symétrie avec la jointure de l'échange (`${alias}.fil_id`). La boîte a répondu
 * « Lecture impossible », et PostgreSQL a dit pourquoi : « column p.id does not exist ». L'alias `p` de la liste
 * est un CTE qui expose `m.id AS message_id` — il porte donc `message_id`, et pas `id`.
 *
 * 🔴 LE PARAMÈTRE EST DONC L'EXPRESSION COMPLÈTE DE LA COLONNE, jamais un alias dont on devinerait le nom de
 * colonne. Deviner marchait pour `fil_id` par chance : les deux CTE le nomment pareil. Ici non, et c'est
 * exactement le genre de coïncidence qui fait écrire du code faux avec l'air d'être juste.
 */
export function sqlJointureInterneMessage(avec: boolean, colonneMessage: string): string {
  if (!avec) return '';
  return `LEFT JOIN LATERAL (
       SELECT (mi.retire_le IS NULL) AS vivante
         FROM gestion_message_interne mi
        WHERE mi.message_id = ${colonneMessage}
        ORDER BY mi.pose_le DESC, mi.id DESC
        LIMIT 1
     ) itm ON true`;
}

/**
 * LES DEUX COLONNES que la jointure ci-dessus rend. `NULL` quand la migration manque : jamais `false`, qui
 * mentirait en disant « on s'est prononcé, et c'est non ».
 */
export function sqlColonnesInterneMessage(avec: boolean): string {
  return avec
    ? 'itm.vivante AS itm_vivante, (itm.vivante IS NOT NULL) AS itm_connue'
    : 'NULL::boolean AS itm_vivante, false AS itm_connue';
}
