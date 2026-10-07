import { query } from '../db/client';
import { deuxEcritures } from './corbeilleRepo';
/* 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — la forme d'un mail étoilé est définie UNE fois, dans le module pur. */
import type { MailEtoile } from './etoileLigne';
import { etoileGmailDisponible } from './schema';

/**
 * MODULE « GESTION » — LOT ETOILE-ET-SIGNATURE : L'ÉTOILE DE GMAIL, GARDÉE CHEZ NOUS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT QUE CE MODULE RÉPARE, ET IL SE VOYAIT À L'ŒIL NU.
 *
 * Constat d'Arno : dans le fil 334 (« Urgence – Fuite importante… »), le message du 18 septembre porte l'étoile
 * rouge. Le filtre étoile de la Réception ne renvoie AUCUN mail.
 *
 * Mesuré le 29/09/2026, la cause est entière — IL Y AVAIT DEUX ÉTOILES :
 *
 *   · celle de la CONVERSATION bascule le libellé `STARRED` dans Gmail (`gmailAction.basculerEtoile`) et ne laisse
 *     AUCUNE trace chez nous : l'état est relu dans Gmail, message par message, à l'ouverture du fil ;
 *   · celle de la LISTE écrivait dans `gestion_fil_etoile`, une table à nous que Gmail ne connaît pas. Et c'est
 *     elle, et elle seule, que le filtre lisait.
 *
 *       étoiles dans GMAIL (API, « is:starred »)  →  611 messages
 *       étoiles vues par le filtre                →    0 échange (8 lignes en table, aucune à `true`)
 *
 * Poser l'étoile là où on la VOIT ne pouvait donc jamais la faire apparaître là où on la CHERCHE.
 *
 * ═══ 🔴 DÉCISION D'ARNO : UNE SEULE ÉTOILE, CELLE DE GMAIL ══════════════════════════════════════════════════════
 *
 * Cette colonne (`gestion_message.etoile_le`, migration 277) est un MIROIR, jamais une opinion :
 *   ① LA RELÈVE la réconcilie depuis l'API Gmail — posée sur ce qui est étoilé, RETIRÉE de tout le reste ;
 *   ② TOUT GESTE CHEZ NOUS passe d'abord par Gmail, et n'écrit ici qu'une fois Gmail d'accord.
 *
 * Jamais l'inverse. Écrire d'abord chez nous ferait de notre base une seconde vérité, et deux vérités pour un même
 * fait se contredisent toujours un jour — la corbeille l'a appris à ses dépens le 29/09/2026 (voir
 * `listerCorbeilleGmail`).
 *
 * ⚠️ `gestion_fil_etoile` N'EST NI SUPPRIMÉE NI VIDÉE, et ce module ne la nomme même pas. Ses lignes restent, avec
 * qui les a touchées et quand. Elle cesse seulement d'être la source du filtre.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI, comme ses voisins `etoileRepo` et `corbeilleRepo` : `boiteRepo` l'atteint,
 * et `boiteRepo` est importé par le script CLI `boite-epreuve.ts`, que la marque tuerait au chargement. Le garde de
 * graphe `app/lib/garde/serverOnly.guard.test.ts` surveille cette règle.
 *
 * ⚠️ SANS LA MIGRATION 277, LA COLONNE N'EST NOMMÉE NULLE PART : chaque fonction rend « rien » sans poser une
 * requête. Nommer une colonne absente ferait échouer TOUTE la liste, pas seulement le geste nouveau.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Quels échanges, parmi ceux-ci, portent AU MOINS UN message étoilé ? LECTURE SEULE. Liste vide ⇒ aucune requête. */
export async function filsEtoiles(filIds: readonly number[]): Promise<Set<number>> {
  if (filIds.length === 0 || !(await etoileGmailDisponible())) return new Set();
  const { rows } = await query<{ fil_id: string }>(
    `SELECT DISTINCT fil_id::text AS fil_id FROM gestion_message
      WHERE etoile_le IS NOT NULL AND fil_id = ANY($1::bigint[])`, [[...filIds]]);
  return new Set(rows.map((r) => Number(r.fil_id)));
}

/**
 * ══ 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — LES MAILS ÉTOILÉS DE CHAQUE ÉCHANGE D'UNE PAGE ═══════════════════════════
 *
 * UNE SEULE REQUÊTE pour toute la page, jamais une par ligne — même patron que `piecesVraiesDesFils`, pour la même
 * raison : une liste de trente lignes ne doit pas poser trente questions.
 *
 * 🔴 ELLE REND LES MAILS, PAS UN BOOLÉEN. `filsEtoiles` répond « cet échange porte-t-il une étoile ? », ce qui est
 * la question du FILTRE ; la LIGNE, elle, en pose deux (le mail qu'elle montre est-il étoilé ? un autre l'est-il ?)
 * et doit pouvoir NOMMER cet autre mail dans sa bulle. Les deux lectures coexistent donc, chacune pour sa question.
 *
 * ⚠️ L'EXPÉDITEUR ET LA DATE VOYAGENT AVEC : sans eux, l'écran devrait aller les chercher message par message pour
 * écrire « (houda ghannam, 6 octobre 2026 à 17:26) ». Ils sont sur la même ligne, ils sont gratuits.
 *
 * ⚠️ ORDRE TOTAL (`recu_le DESC, id DESC`) : deux mails à la même seconde existent, et la bulle ne doit pas nommer
 * l'un ou l'autre selon l'humeur de la requête. Le module pur retrie de toute façon — on ne lui demande rien.
 *
 * ⚠️ SANS LA MIGRATION 277, LA COLONNE N'EST NOMMÉE NULLE PART : carte vide, aucune requête posée.
 */
export async function mailsEtoilesDesFils(
  filIds: readonly number[],
): Promise<Map<number, MailEtoile[]>> {
  const parFil = new Map<number, MailEtoile[]>();
  if (filIds.length === 0 || !(await etoileGmailDisponible())) return parFil;
  const { rows } = await query<{
    fil_id: string; id: string; de_adresse: string; de_nom: string | null; recu_le: string;
  }>(
    `SELECT fil_id::text, id::text, de_adresse, de_nom,
            to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le
       FROM gestion_message
      WHERE etoile_le IS NOT NULL AND fil_id = ANY($1::bigint[])
      ORDER BY recu_le DESC, id DESC`, [[...filIds]]);
  for (const r of rows) {
    const fil = Number(r.fil_id);
    const liste = parFil.get(fil) ?? [];
    liste.push({ messageId: Number(r.id), de: r.de_adresse, deNom: r.de_nom, recuLe: r.recu_le });
    parFil.set(fil, liste);
  }
  return parFil;
}

/**
 * Les messages ÉTOILÉS d'un échange, du plus récent au plus ancien. C'est ce que le geste « décrocher l'étoile »
 * doit parcourir : dans Gmail, décrocher l'étoile d'une conversation la retire de TOUS ses messages.
 */
export async function messagesEtoilesDuFil(
  filId: number,
): Promise<{ messageId: number; messageIdRfc: string }[]> {
  if (!(await etoileGmailDisponible())) return [];
  const { rows } = await query<{ id: string; message_id: string }>(
    `SELECT id::text AS id, message_id FROM gestion_message
      WHERE fil_id = $1 AND etoile_le IS NOT NULL ORDER BY recu_le DESC, id DESC`, [filId]);
  return rows.map((r) => ({ messageId: Number(r.id), messageIdRfc: r.message_id }));
}

/**
 * ÉCRIT L'ÉTOILE D'UN MESSAGE, UNE FOIS GMAIL D'ACCORD. Appelée par `gmailAction` après un aller-retour réussi,
 * jamais avant : ce serait inventer un état que Gmail pourrait refuser.
 *
 * ⚠️ `coalesce(etoile_le, now())` à la pose : reposer une étoile déjà là ne change pas sa date. C'est l'instant du
 * CONSTAT qui compte, et le premier est le bon.
 */
export async function ecrireEtoileMessage(messageId: number, etoilee: boolean): Promise<void> {
  if (!(await etoileGmailDisponible())) return;
  await query(
    etoilee
      ? `UPDATE gestion_message SET etoile_le = coalesce(etoile_le, now()), maj_le = now() WHERE id = $1`
      : `UPDATE gestion_message SET etoile_le = NULL, maj_le = now() WHERE id = $1`,
    [messageId]);
}

/**
 * ══ 🔴🔴 LA RÉCONCILIATION — MÊME FORME, MÊME GARDE-FOU QUE LA CORBEILLE ═══════════════════════════════════════
 *
 * Elle relit tout ce que GMAIL tient pour étoilé et fait coïncider notre colonne : marque posée sur ceux-là,
 * RETIRÉE de tous les autres. C'est ce second sens qui en fait un miroir — sans lui, une étoile décrochée depuis
 * un téléphone resterait chez nous pour toujours.
 *
 * 🔴 LE GARDE-FOU VIENT D'UN DÉFAUT RÉEL, celui de la corbeille le 29/09/2026 : la réconciliation avait VIDÉ la
 * colonne entière sans un mot, parce que les `Message-ID` étaient comparés dans deux écritures différentes (avec
 * et sans chevrons). « Gmail porte des étoiles, et pourtant rien ne correspond » n'est pas un ÉTAT, c'est une
 * SIGNATURE DE PANNE : on refuse alors de retirer quoi que ce soit, et on le DIT.
 *
 * Une boîte réellement sans étoile, elle, passe sans encombre — c'est `messageIdsRfc.length === 0`, et il vide
 * bien la colonne, parce que c'est la vérité.
 *
 * ⚠️ `deuxEcritures` est CELLE DE LA CORBEILLE, importée et non recopiée : c'est exactement le même pont entre les
 * deux mondes, et deux copies finiraient par diverger sur le seul détail qui compte.
 */
export async function reconcilierEtoiles(messageIdsRfc: readonly string[]): Promise<{
  poses: number; retires: number; refuse?: 'aucune_correspondance';
} | null> {
  if (!(await etoileGmailDisponible())) return null;
  const presents = deuxEcritures(messageIdsRfc);

  const { rows: corr } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_message WHERE message_id = ANY($1::text[])`, [presents]);
  if (messageIdsRfc.length > 0 && (corr[0]?.n ?? 0) === 0) {
    console.error('[gestion/etoile] réconciliation REFUSÉE : Gmail porte des étoiles, aucune ne correspond chez '
      + 'nous. Rien n’a été retiré.', { lus: messageIdsRfc.length });
    return { poses: 0, retires: 0, refuse: 'aucune_correspondance' };
  }

  const pose = await query(
    `UPDATE gestion_message SET etoile_le = coalesce(etoile_le, now()), maj_le = now()
      WHERE message_id = ANY($1::text[]) AND etoile_le IS NULL`, [presents]);
  const retire = await query(
    `UPDATE gestion_message SET etoile_le = NULL, maj_le = now()
      WHERE etoile_le IS NOT NULL AND NOT (message_id = ANY($1::text[]))`, [presents]);

  return { poses: pose.rowCount ?? 0, retires: retire.rowCount ?? 0 };
}

/** Combien d'ÉCHANGES portent au moins une étoile. Le nombre que la colonne de gauche annonce. */
export async function compterFilsEtoiles(): Promise<number> {
  if (!(await etoileGmailDisponible())) return 0;
  const { rows } = await query<{ n: number }>(
    'SELECT count(DISTINCT fil_id)::int AS n FROM gestion_message WHERE etoile_le IS NOT NULL');
  return rows[0]?.n ?? 0;
}
