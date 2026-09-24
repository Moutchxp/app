/**
 * CORRECTIF DU 24/09/2026 — OÙ SE RANGE LA LIGNE DE JOURNAL D'UN ENVOI. Module PUR, zéro import.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA FAUTE, MESURÉE AVANT D'ÊTRE CORRIGÉE. La route écrivait `entite = 'envoi'` dans `gestion_journal`. Or la table
 * porte une règle qui énumère les entités permises — et « envoi » n'y figure pas :
 *
 *   gestion_journal_entite_chk CHECK (entite = ANY (ARRAY['message','fil','evenement','affectation','regle','config',
 *                                                          'releve','partenaire']))
 *
 * PostgreSQL refusait donc l'écriture (code 23514), l'exception remontait à la route, et Arno lisait « Envoi
 * impossible » alors que le message était parti. Vérifié en base le 24/09 : `gestion_envoi` id 1 en état `envoye`,
 * `gmail_message_id` renseigné — et ZÉRO ligne de journal d'envoi.
 *
 * 🔴 CE QU'ON EN FAIT, ET POURQUOI PAS SEULEMENT UNE MIGRATION. La migration 243 ajoute « envoi » à la règle. Mais les
 * migrations de ce module sont LIVRÉES NON APPLIQUÉES : entre la livraison et le moment où Arno les passe, le journal
 * ne doit pas rester muet. On range donc la ligne LÀ OÙ ELLE A DU SENS ET OÙ LA BASE L'ACCEPTE DÉJÀ :
 *   ① un envoi RATTACHÉ À UN ÉCHANGE se range sur l'échange (« fil ») — et c'est même le meilleur endroit, puisque
 *      c'est là qu'on relit l'histoire d'une conversation. Aucune migration nécessaire ;
 *   ② un envoi SANS échange (message tout neuf) se range sur lui-même (« envoi ») — possible seulement une fois la
 *      migration 243 appliquée ;
 *   ③ à défaut, sur le message auquel on répondait ;
 *   ④ et si rien de tout cela n'est disponible, on rend `null` : PAS DE LIGNE INVENTÉE. Un journal qui ment sur ce
 *      qu'il décrit est pire qu'un journal incomplet — l'absence se voit, la fausse piste, non. L'appelant signale
 *      alors l'incident au journal DU SERVEUR, et l'envoi, lui, reste un envoi réussi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les entités que `gestion_journal` accepte AUJOURD'HUI, avant la migration 243. Recopiées de la règle en base. */
export const ENTITES_JOURNAL_AVANT_243 = [
  'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
] as const;

export interface CibleJournal {
  entite: string;
  entiteId: number;
}

/** Un identifiant utilisable : un entier strictement positif. `0` n'est pas un identifiant, c'est un aveu. */
function idUtile(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x > 0;
}

/**
 * DÉCIDE où se range la ligne de journal d'un envoi. Rend `null` quand aucun rangement n'est à la fois VRAI et permis
 * par la base — jamais un rangement approximatif.
 */
export function cibleJournalEnvoi(d: {
  /** L'identifiant de la ligne `gestion_envoi`. */
  envoiId: number;
  /** L'échange auquel l'envoi se rattache, s'il y en a un. */
  filId: number | null;
  /** Le message auquel on répondait, s'il y en a un. */
  repondAMessageId: number | null;
  /** La migration 243 est-elle appliquée ? (« envoi » accepté par la règle de la table.) */
  envoiPermis: boolean;
}): CibleJournal | null {
  if (idUtile(d.filId)) return { entite: 'fil', entiteId: d.filId };
  if (d.envoiPermis && idUtile(d.envoiId)) return { entite: 'envoi', entiteId: d.envoiId };
  if (idUtile(d.repondAMessageId)) return { entite: 'message', entiteId: d.repondAMessageId };
  return null;
}

/** L'action inscrite au journal. Deux mots seulement : un envoi part, ou il ne part pas. */
export function actionJournalEnvoi(issue: 'envoye' | 'echec'): string {
  return issue === 'envoye' ? 'envoi' : 'envoi_echec';
}

/**
 * LE COMMENTAIRE : qui, à qui, quel objet. 🔒 JAMAIS le corps du message — le journal dit qu'un courrier est parti, il
 * n'en garde pas le contenu.
 */
export function commentaireJournalEnvoi(l: { objet: string; destinataires: readonly string[] }): string {
  const objet = l.objet.trim() === '' ? '(sans objet)' : l.objet.trim();
  const qui = l.destinataires.length === 0 ? '(aucun destinataire)' : l.destinataires.join(', ');
  return `« ${objet} » à ${qui}`;
}
