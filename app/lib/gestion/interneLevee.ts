/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — RATTACHER UN BIEN LÈVE LA MARQUE « INTERNE » ════════════════════
 *
 * Module PUR : aucune I/O, aucune base, aucun réseau, aucun DOM. Il est atteint par le NAVIGATEUR (les mots de la
 * confirmation viennent d'ici) : il ne doit donc jamais rien importer qui tire `pg`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) :
 *
 *   « Câble l'autre sens. Quand un HUMAIN rattache un bien à un mail marqué Interne, la marque Interne est levée
 *   pour ce mail, selon la même fenêtre choisie.
 *   — Avant d'appliquer : “Ce mail est marqué Interne : rattacher ce bien retirera la marque Interne” avec
 *     Confirmer / Annuler. Après : “Annuler” quelques secondes, qui remet exactement l'état d'avant.
 *   — La passe AUTOMATIQUE ne lève jamais la marque et ne pose jamais de bien sur un mail Interne (garde le
 *     test). »
 *
 * ═══ 🔴🔴 CE QUE CE SENS-CI FERME, ET CE QUE LE SENS INVERSE AVAIT LAISSÉ OUVERT ══════════════════════════════════
 *
 * Le lot précédent a câblé « marquer Interne détache les biens » (`interneDetache.ts`). Il restait l'autre porte,
 * et elle était grande ouverte : rattacher un bien à un mail déjà marqué Interne laissait les DEUX états vivants.
 * C'est l'une des deux façons dont les 6 cas « Interne avec bien » du lot précédent ont pu naître — l'autre ayant
 * été refermée par ce même lot.
 *
 * 🔴 LES DEUX SENS SE LISENT DÉSORMAIS CÔTE À CÔTE, et c'est pour cela que ce module est séparé de son jumeau
 * plutôt que fondu dedans : chacun porte SES mots et SES motifs. Un module unique aurait fait croire
 * qu'un seul « Annuler » défait les deux gestes, ce qui est faux.
 *
 * ═══ 🔴🔴 POURQUOI UNE CONFIRMATION, ET POURQUOI ELLE SUFFIT ═════════════════════════════════════════════════════
 *
 * La marque Interne est une DÉCISION HUMAINE : quelqu'un a dit « cet échange ne concerne aucun bien ». La lever
 * sans rien dire reviendrait à défaire cette décision au passage d'un autre geste. Le geste annonce donc ce qu'il
 * va faire, attend un « Confirmer », et laisse un « Annuler » derrière lui — exactement la discipline du sens
 * inverse, et la même que « Toute la conversation ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 LE MOTIF ÉCRIT EN BASE SUR CHAQUE MARQUE LEVÉE. Il dit POURQUOI, et il se relit six mois plus tard sans
 * connaître ce lot.
 *
 * ⚠️ IL EST DISTINCT DE `MOTIF_INTERNE_PAR_SUIVI` (la projection d'une fenêtre) ET de l'annulation ordinaire de la
 * case du bandeau. Les trois ne se défont pas de la même façon, et confondre leurs traces rendrait l'« Annuler »
 * incapable de savoir ce qu'il a le droit de remettre — défaut déjà payé une fois sur les rattachements.
 */
export const MOTIF_LEVE_PAR_RATTACHEMENT = 'levé en rattachant un bien à ce mail';

/** Le motif écrit quand l'« Annuler » des secondes qui suivaient repose la marque. */
export const MOTIF_INTERNE_REMIS_APRES_ANNULATION =
  'remis : le rattachement a été annulé dans les secondes qui suivaient';

/**
 * 🔴 LE MOTIF ÉCRIT SUR LE RATTACHEMENT QUE L'« ANNULER » RETIRE. Il dit que le lien n'a pas été jugé faux, mais
 * que le geste entier a été repris — ce qui ne se relit pas du tout comme « retiré à la main ».
 */
export const MOTIF_RATTACHEMENT_ANNULE = 'rattachement annulé dans les secondes qui suivaient';

/**
 * ══ 🔴 LE MESSAGE DE CONFIRMATION, MOT POUR MOT CELUI D'ARNO. PUR. ══════════════════════════════════════════════
 *
 * « Ce mail est marqué Interne : rattacher ce bien retirera la marque Interne »
 *
 * ⚠️ RENDRE `null` QUAND LE MAIL N'EST PAS INTERNE, et c'est la règle du sens inverse appliquée ici : sur le cas
 * le plus fréquent — un mail ordinaire —, le rattachement garde EXACTEMENT le comportement d'avant ce lot, au clic
 * près. Une boîte de confirmation qui dirait « rien ne sera retiré » serait un geste de plus pour rien.
 */
export function messageLeveeInterne(interne: boolean): string | null {
  return interne
    ? 'Ce mail est marqué Interne : rattacher ce bien retirera la marque Interne'
    : null;
}

/**
 * CE QU'ON DIT APRÈS LE GESTE, et qui accompagne l'« Annuler ».
 *
 * 🔴 LE NOMBRE DE MAILS EST DIT, PARCE QUE LA FENÊTRE PEUT PORTER PLUS LOIN QUE LE MAIL AFFICHÉ. « Marque Interne
 * retirée » sur un geste qui en a levé quatre serait une information fausse par omission.
 */
export function motApresLevee(nbMails: number): string {
  if (nbMails <= 0) return 'Bien rattaché.';
  if (nbMails === 1) return 'Bien rattaché · marque « interne » retirée de ce mail.';
  return `Bien rattaché · marque « interne » retirée de ${nbMails} mails.`;
}

/** Le mot de l'annulation. PUR. */
export function motApresAnnulationLevee(nbLiens: number): string {
  if (nbLiens <= 0) return 'Rattachement annulé · marque « interne » remise.';
  return `Rattachement annulé (${nbLiens} lien${nbLiens > 1 ? 's' : ''}) · marque « interne » remise.`;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 CE QUE LA LEVÉE NE TOUCHE PAS : LA MARQUE DE L'**ÉCHANGE**. ET C'EST UNE DÉCISION ═════════════════════
 *
 * IL Y A DEUX MARQUES, et il faut les distinguer pour lire ce lot :
 *   · la marque PAR MAIL (`gestion_message_interne`, migration 297) — la vérité précise, celle que ce lot lève ;
 *   · la marque d'ÉCHANGE (`gestion_fil_interne`, migration 281) — le REPLI, qui répond pour tout mail dont
 *     personne ne s'est occupé.
 *
 * 🔴 ARNO ÉCRIT « la marque Interne est levée POUR CE MAIL, selon la même fenêtre choisie ». La levée porte donc
 * sur des MAILS — ceux que la fenêtre couvre — et jamais sur l'échange.
 *
 * 🔴🔴 ET CE N'EST PAS SEULEMENT UNE LECTURE LITTÉRALE : la règle du module l'impose déjà. Le 03/10/2026, le
 * commit 559d394a a RETIRÉ de la projection des fenêtres le retrait de la marque d'échange, avec ce motif, écrit
 * dans `periodeRepo` : « elle reste le repli, et un repli qu'une projection effacerait ne serait pas un repli ».
 * Lever ici ce qu'on a refusé de lever là serait rouvrir la même porte par l'autre côté.
 *
 * ⚠️ CONSÉQUENCE CONCRÈTE, QU'IL FAUT CONNAÎTRE : une conversation marquée interne par la case du bandeau
 * continuera de donner « Interne » à ses RÉPONSES FUTURES, même après qu'on ait rattaché un bien à l'un de ses
 * mails. Ce n'est pas l'état interdit — une réponse future n'a pas de bien —, et c'est réparable d'un clic sur
 * la case verte. Si Arno veut que le rattachement emporte aussi la marque de la conversation, c'est une
 * DÉCISION DE PLUS, et elle lui appartient.
 *
 * 🔴 C'EST POURQUOI `leverInterneApresRattachement` (interneRepo) N'A TOUJOURS PAS D'APPELANT. Elle porte sur
 * l'ÉCHANGE : la brancher ferait exactement ce que les deux paragraphes ci-dessus refusent. Elle reste écrite,
 * documentée, et non branchée — c'est un état assumé, pas un oubli.
 */

/**
 * ══ 🔴 COMBIEN DE SECONDES L'« ANNULER » RESTE OFFERT ═══════════════════════════════════════════════════════════
 *
 * Arno : « “Annuler” quelques secondes ». Le MÊME délai que le sens inverse (`interneDetache.SECONDES_ANNULER`),
 * et c'est volontairement une valeur et non un import : les deux gestes sont indépendants, et rien n'oblige
 * Arno à les régler ensemble. Les tenir égaux aujourd'hui est une cohérence, pas une contrainte.
 */
export const SECONDES_ANNULER_LEVEE = 12;
