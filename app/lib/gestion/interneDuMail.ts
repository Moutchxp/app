/**
 * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » EST UN STATUT PAR MAIL. Module PUR ═════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE VALIDÉE PAR ARNO (04/10/2026) : « Interne est un statut PAR MAIL. Le choix fait sur un mail s'applique
 * selon les 3 fenêtres (“Ce mail uniquement”, “Ce mail et la conversation à venir”, “Toute la conversation”). Un
 * choix ultérieur ne doit jamais effacer le statut Interne d'un mail antérieur. Le repli sur la marque d'échange
 * (gestion_fil_interne) reste un repli, utilisé seulement quand rien ne couvre le mail. »
 *
 * ═══ 🔴🔴 POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST PUR ══════════════════════════════════════════════════════
 *
 * La règle du repli doit être écrite UNE FOIS. Quatre endroits la lisent — la liste (`boiteRepo`), la modale du ⓘ
 * (`repereFenetre`), les compteurs de la colonne, et le statut d'une ligne — et c'est exactement le genre de règle
 * dont quatre copies divergent. Le défaut du point 4 de ce même lot en était déjà une preuve : la modale lisait les
 * fenêtres, la liste lisait la marque d'échange, et les deux se contredisaient sur 3 conversations.
 *
 * 🔒 PAS UN `fetch`, PAS UNE LIGNE DE SQL, PAS DE REACT : il est importable depuis un composant `'use client'`
 * comme depuis un dépôt. C'est ce qui permet au navigateur et au serveur de répondre la même chose.
 *
 * ═══ 🔴🔴 LA RÈGLE DU REPLI, EN TROIS CAS — ET LE PIÈGE QU'ELLE ÉVITE ════════════════════════════════════════════
 *
 *   ① LE MAIL PORTE UNE MARQUE PAR MAIL **VIVANTE** → il est interne. C'est la vérité la plus précise qu'on ait.
 *
 *   ② LE MAIL PORTE UNE MARQUE PAR MAIL **RETIRÉE** → il n'est PAS interne, et la marque d'échange ne le ressuscite
 *      pas. 🔴 C'EST LE PIÈGE PRINCIPAL : sans ce cas, retirer « Interne » d'un mail d'une conversation marquée
 *      interne n'aurait AUCUN effet visible — le repli le remettrait aussitôt. Quelqu'un cliquerait trois fois,
 *      puis conclurait que le bouton ne marche pas.
 *
 *   ③ LE MAIL NE PORTE AUCUNE MARQUE PAR MAIL → la marque d'ÉCHANGE répond. C'est le repli d'Arno, et il couvre
 *      deux situations réelles : les mails antérieurs à toute fenêtre, et les 9 échanges déjà marqués avant que ce
 *      lot n'existe.
 *
 * ⚠️ « AUCUNE MARQUE » ET « MARQUE RETIRÉE » NE SONT PAS LA MÊME CHOSE, et c'est toute la différence entre ② et ③.
 * La base les distingue (une ligne retirée reste, datée et signée — règle du module : on ne supprime jamais) ; ce
 * module aussi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que la base sait d'un mail, du plus précis au plus général. */
export interface SignauxInterne {
  /** Une marque PAR MAIL vivante existe-t-elle ? */
  marqueDuMailVivante: boolean;
  /**
   * Le mail a-t-il DÉJÀ porté une marque par mail, vivante ou retirée ? C'est ce qui distingue « on a décidé pour
   * ce mail » de « personne ne s'est prononcé ».
   */
  marqueDuMailConnue: boolean;
  /** La marque de l'ÉCHANGE (`gestion_fil_interne`) est-elle vivante ? C'est le repli. */
  marqueDeLEchange: boolean;
}

/**
 * CE MAIL EST-IL « INTERNE » ? PUR.
 *
 * ⚠️ L'ORDRE DES TROIS CAS EST LA RÈGLE, pas une commodité d'écriture : le plus précis gagne, et le repli ne parle
 * que si personne ne s'est prononcé sur ce mail.
 */
export function interneDuMail(s: SignauxInterne): boolean {
  if (s.marqueDuMailVivante) return true;
  if (s.marqueDuMailConnue) return false;
  return s.marqueDeLEchange;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 QUELS MAILS UN CHOIX COUVRE — LES TROIS FENÊTRES D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les trois choix, les mêmes mots que `ChoixSuivi` du module des fenêtres. */
export type ChoixInterne = 'mail' | 'suite' | 'conversation';

/**
 * LES MAILS QU'UN CHOIX COUVRE. PUR.
 *
 * 🔴 L'ORDRE DE `mails` EST CHRONOLOGIQUE, du plus ancien au plus récent — jamais l'ordre d'affichage. « Ce mail et
 * la conversation à venir » veut dire « à venir DANS LE TEMPS », et l'écran peut très bien afficher le plus récent
 * en haut. Confondre les deux aurait marqué le passé en croyant marquer l'avenir : c'est exactement le défaut que
 * le lot VISUALISER-MAIL-ET-REPERE-FENETRE a payé une fois sur le repère rouge, et il n'y a aucune raison de le
 * repayer ici.
 *
 * ⚠️ UN MAIL ABSENT DE LA LISTE NE COUVRE RIEN : on ne devine pas une position. Mieux vaut un geste qui ne porte
 * sur rien — et qui le dit — qu'un geste qui porte sur toute la conversation par accident.
 */
export function mailsCouvertsParLeChoix(
  mails: readonly number[], messageId: number, choix: ChoixInterne,
): number[] {
  if (choix === 'conversation') return [...mails];
  const i = mails.indexOf(messageId);
  if (i < 0) return [];
  return choix === 'mail' ? [messageId] : [...mails.slice(i)];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ LE MOTIF ÉCRIT QUAND LA PROJECTION RETIRE UNE MARQUE. Le même mot que pour « hors gestion », et pour la même
 * raison : il dit que le retrait vient d'une FENÊTRE et non d'une personne, ce qui ne se répare pas pareil.
 */
export const MOTIF_INTERNE_PAR_SUIVI = 'suivi de la conversation';

/** Le motif écrit par la reprise des données. Il nomme le lot, pour qu'on sache six mois plus tard d'où ça vient. */
export const MOTIF_INTERNE_REPRISE =
  'reprise de la marque d’échange en marque par mail (migration 297, lot RENOMMER-PARTOUT-ET-FINITIONS)';
