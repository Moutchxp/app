import { query } from '../db/client';
import { adressesMessagesDisponibles, rattachementsDisponibles } from './schema';
import { messagesAReconnaitre, messagesDeCesAdresses, recalculerLesAdresses } from './adressesRepo';
import {
  chargerLibelles, examinerFilsPrecis, COMPTES_VIDES, type ComptesPasse,
} from './rattachementRepo';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — AUCUN CACHE PÉRIMÉ. IMPUR (SQL). ══════════════════════════════════
 *
 * ═══ CE QU'ARNO DEMANDE, EN DEUX TEMPS ══════════════════════════════════════════════════════════════════════════
 *
 *   ① TOUT DE SUITE — « toute modification des coordonnées d'une fiche (ajout, retrait, changement d'une adresse)
 *      recalcule IMMÉDIATEMENT les propositions des mails concernés (anciens et récents) de cette adresse » ;
 *   ② EN FILET — « ensuite, à l'ouverture d'un mail, les propositions sont recalculées si la fiche a changé depuis
 *      leur calcul ».
 *
 * 🔴 LES DEUX, ET NON L'UN OU L'AUTRE. ① seul laisserait périmés les mails arrivés pendant une panne, ceux d'un
 * import d'annuaire, ceux d'une fiche modifiée par un autre chemin. ② seul ferait attendre la prochaine ouverture
 * — or Arno vient de corriger une fiche PRÉCISÉMENT pour que le mail qu'il regarde change d'avis.
 *
 * ═══ 🔴 CE QUI NE BOUGE JAMAIS ══════════════════════════════════════════════════════════════════════════════════
 *
 * LES RATTACHEMENTS POSÉS À LA MAIN. Le réexamen passe par `examinerFilsPrecis`, donc par `ecrireLienMoteur` et
 * `retirerLiensPerimes`, qui excluent tous deux les lignes qu'un humain a touchées (`statut_par_libelle` non nul,
 * `origine` autre qu'automatique). Un lien confirmé à la main survit à n'importe quel recalcul : la personne avait
 * le mail sous les yeux, le moteur non. Un candidat REJETÉ ne ressuscite pas non plus — la ligne existe, donc
 * l'insertion ne se fait pas.
 *
 * ⚠️ DEUX ÉTAPES, DANS CET ORDRE, ET IL COMPTE : on recalcule d'abord la RECONNAISSANCE des adresses
 * (`gestion_message_adresse`), puis les PROPOSITIONS qui s'en déduisent. L'inverse réexaminerait les mails avec
 * l'ancienne lecture de l'annuaire — c'est-à-dire ne changerait rien, en ayant l'air de travailler.
 */

export interface ChiffresRafraichissement {
  /** Combien de messages avaient une reconnaissance périmée. */
  messagesPerimes: number;
  /** Combien de lignes d'adresse ont été réécrites. */
  adressesRecalculees: number;
  /** Combien de conversations ont été réexaminées par le moteur de propositions. */
  filsReexamines: number;
  comptes: ComptesPasse;
}

const RIEN: ChiffresRafraichissement = {
  messagesPerimes: 0, adressesRecalculees: 0, filsReexamines: 0, comptes: { ...COMPTES_VIDES },
};

/**
 * ⚠️ UNE BORNE, PARCE QU'UNE ADRESSE PEUT ÊTRE PARTOUT. Mesuré le 01/10/2026 : l'adresse externe la plus répandue
 * touche 791 messages, la fiche de Mme THAI 10. La borne ne sert donc jamais en pratique — elle est là pour qu'une
 * modification de fiche ne puisse JAMAIS bloquer l'écran plusieurs secondes. Ce qu'elle laisse de côté est rattrapé
 * à l'ouverture du mail, par `rafraichirLesFils`.
 */
export const FILS_MAX_PAR_GESTE = 300;

/** Les conversations de ces messages. LECTURE SEULE. */
async function filsDeCesMessages(messageIds: readonly number[]): Promise<number[]> {
  if (messageIds.length === 0) return [];
  const { rows } = await query<{ fil_id: string | null }>(
    'SELECT DISTINCT fil_id::text FROM gestion_message WHERE id = ANY($1::bigint[]) AND fil_id IS NOT NULL',
    [messageIds]);
  return rows.map((r) => Number(r.fil_id));
}

/** Le réexamen des propositions de ces conversations. Rien n'est écrit si le moteur n'a pas changé d'avis. */
async function reexaminer(filIds: readonly number[], c: ChiffresRafraichissement): Promise<void> {
  if (filIds.length === 0 || !(await rattachementsDisponibles())) return;
  const bornes = filIds.slice(0, FILS_MAX_PAR_GESTE);
  await examinerFilsPrecis(bornes, await chargerLibelles(), c.comptes, true, {
    auteur: 'mise à jour d’une fiche',
    motif: 'les coordonnées de la fiche ont changé : le moteur ne propose plus cette cible',
  });
  c.filsReexamines = bornes.length;
}

/**
 * 🔴 ① APRÈS UNE MODIFICATION DE FICHE : les mails de ces adresses, tout de suite.
 *
 * ⚠️ ON PASSE LES ADRESSES RETIRÉES **ET** AJOUTÉES. Retirer une adresse doit faire DISPARAÎTRE les propositions
 * qu'elle fondait — sans quoi le geste d'Arno n'aurait servi qu'à moitié, ce qui est pire que rien (c'est déjà la
 * raison d'être de `conditionCoordonneeVivante`).
 */
export async function rafraichirPourAdresses(adresses: readonly string[]): Promise<ChiffresRafraichissement> {
  if (!(await adressesMessagesDisponibles())) return { ...RIEN, comptes: { ...COMPTES_VIDES } };
  const c: ChiffresRafraichissement = { ...RIEN, comptes: { ...COMPTES_VIDES } };

  const { messageIds, filIds } = await messagesDeCesAdresses(adresses);
  if (messageIds.length === 0) return c;
  c.messagesPerimes = messageIds.length;
  c.adressesRecalculees = await recalculerLesAdresses(messageIds);
  await reexaminer(filIds, c);
  return c;
}

/**
 * 🔴 ② À L'OUVERTURE D'UN MAIL : on ne recalcule QUE si une fiche a bougé depuis le dernier calcul.
 *
 * ⚠️ LE CONTRÔLE EST UNE SEULE REQUÊTE, et il ne rend rien dans l'immense majorité des cas (voir
 * `messagesAReconnaitre`). C'est ce qui permet de le poser sur un chemin aussi fréquenté que l'ouverture d'un mail
 * sans le ralentir.
 *
 * 🔴 ON REGARDE TOUTE LA CONVERSATION, pas le seul mail ouvert : les propositions d'un mail se fondent aussi sur
 * les adresses des AUTRES messages du fil (règle de l'échange). Ne rafraîchir que le mail ouvert laisserait une
 * moitié de la question périmée.
 */
export async function rafraichirLesFils(filIds: readonly number[]): Promise<ChiffresRafraichissement> {
  const c: ChiffresRafraichissement = { ...RIEN, comptes: { ...COMPTES_VIDES } };
  if (filIds.length === 0 || !(await adressesMessagesDisponibles())) return c;

  const { rows } = await query<{ id: string }>(
    'SELECT id::text FROM gestion_message WHERE fil_id = ANY($1::bigint[])', [filIds]);
  const perimes = await messagesAReconnaitre(rows.map((r) => Number(r.id)));
  if (perimes.length === 0) return c;

  c.messagesPerimes = perimes.length;
  c.adressesRecalculees = await recalculerLesAdresses(perimes);
  await reexaminer(await filsDeCesMessages(perimes), c);
  return c;
}

/**
 * LE MÊME FILET, POUR UN MAIL DÉSIGNÉ. C'est l'appel que fait la route de classement avant de répondre.
 *
 * ⚠️ NE LÈVE JAMAIS : un rafraîchissement en échec ne doit pas empêcher d'ouvrir un mail. On le DIT au journal du
 * serveur — l'endroit où l'on regarde quand un chiffre surprend — et l'écran répond avec ce qu'il a.
 */
export async function rafraichirAvantOuverture(messageId: number): Promise<ChiffresRafraichissement> {
  try {
    const { rows } = await query<{ fil_id: string | null }>(
      'SELECT fil_id::text FROM gestion_message WHERE id = $1', [messageId]);
    const fil = rows[0]?.fil_id ?? null;
    return fil === null
      ? await rafraichirLesFilsDeCeMail(messageId)
      : await rafraichirLesFils([Number(fil)]);
  } catch (e) {
    console.error('[gestion/propositions] rafraîchissement impossible (message=%d)', messageId, e);
    return { ...RIEN, comptes: { ...COMPTES_VIDES } };
  }
}

/** Un mail sans conversation : il n'y a que lui à regarder. */
async function rafraichirLesFilsDeCeMail(messageId: number): Promise<ChiffresRafraichissement> {
  const c: ChiffresRafraichissement = { ...RIEN, comptes: { ...COMPTES_VIDES } };
  const perimes = await messagesAReconnaitre([messageId]);
  if (perimes.length === 0) return c;
  c.messagesPerimes = perimes.length;
  c.adressesRecalculees = await recalculerLesAdresses(perimes);
  return c;
}
