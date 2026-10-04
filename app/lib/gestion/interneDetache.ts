/**
 * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — MARQUER « INTERNE » DÉTACHE LES BIENS ═════════════
 *
 * Module PUR : aucune I/O, aucune base, aucun réseau, aucun DOM. Il est atteint par le NAVIGATEUR (les mots de la
 * confirmation viennent d'ici) : il ne doit donc jamais rien importer qui tire `pg`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) :
 *
 *   « Règle symétrique de `leverInterneApresRattachement` : marquer Interne DÉTACHE les biens de ce mail, selon la
 *   fenêtre choisie (Ce mail uniquement / Ce mail et la conversation à venir / Toute la conversation), par la porte
 *   existante (statut 'retire'), tracé.
 *   — AVANT d'appliquer, un message clair : “Marquer interne détachera : <liste des biens>” avec Confirmer /
 *     Annuler. Après : “Annuler” pendant quelques secondes, qui remet exactement les rattachements d'avant.
 *   — Si aucun bien n'est rattaché : comportement actuel inchangé, sans message. »
 *
 * ═══ 🔴🔴 CE QUE J'AI TROUVÉ EN CHERCHANT LA « SYMÉTRIE », ET QU'IL FAUT DIRE ═════════════════════════════════════
 *
 * `leverInterneApresRattachement` existe, est documentée comme l'arbitrage du conflit (« un rattachement l'emporte
 * sur Interne »)… et **n'a JAMAIS eu d'appelant**. Vérifié sur tout le dépôt et depuis son commit d'origine
 * (68f8a254) : seule sa jumelle `leverHorsGestionApresRattachement` est câblée.
 *
 * 🔴 CE POINT EST DONC LE PREMIER DES DEUX SENS À EXISTER RÉELLEMENT, et non le second. L'autre sens — rattacher un
 * bien lève la marque interne — reste à trancher par Arno : le câbler RETIRERAIT une marque sur un geste humain,
 * ce qui est un changement de comportement qu'il n'a pas demandé.
 *
 * ═══ 🔴🔴 POURQUOI UNE CONFIRMATION, ET POURQUOI ELLE SUFFIT À AUTORISER LE RETRAIT ══════════════════════════════
 *
 * La projection d'une fenêtre ne retire QUE les liens qu'elle a posés elle-même (`MOTIF_POSE_PAR_SUIVI`) : « un
 * rattachement posé à la main n'est jamais déplacé par un changement de fenêtre » (règle d'Arno, lot
 * PREUVE-SUIVI-CONVERSATION). Un seul geste y échappe — « Toute la conversation » — et il y échappe pour une raison
 * précise : *c'est le seul qui annonce sa portée et demande une confirmation écrite.*
 *
 * 🔴 CE GESTE-CI EST DANS LE MÊME CAS, ET C'EST CE QUI LE REND LÉGITIME. Il nomme les biens qu'il va détacher, un
 * par un, et attend un « Confirmer ». Sans la confirmation, il n'aurait pas le droit de toucher un lien humain ;
 * avec elle, il l'a — et il laisse un « Annuler » derrière lui.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 LE MOTIF ÉCRIT EN BASE SUR CHAQUE LIEN RETIRÉ. Il dit QUI a décidé et POURQUOI, et il se relit dans le journal
 * six mois plus tard sans connaître ce lot.
 *
 * ⚠️ IL EST DISTINCT DE `MOTIF_RETIRE_PAR_SUIVI` (la projection d'une fenêtre), et il doit le rester : les deux ne
 * se défont pas de la même façon, et confondre leurs traces rendrait l'« Annuler » incapable de savoir ce qu'il a
 * le droit de remettre.
 */
export const MOTIF_DETACHE_PAR_INTERNE = 'détaché en marquant le mail « interne »';

/** Combien de secondes l'« Annuler » reste offert après le geste. Demande d'Arno : « pendant quelques secondes ». */
export const SECONDES_ANNULER = 12;

/** Un bien que le geste va détacher, ou vient de détacher. */
export interface BienDetache { lienId: number; libelle: string }

/**
 * ══ 🔴 LE MESSAGE DE CONFIRMATION, MOT POUR MOT CELUI D'ARNO. PUR. ══════════════════════════════════════════════
 *
 * « Marquer interne détachera : <liste des biens> »
 *
 * 🔴 LA LISTE EST NOMMÉE, JAMAIS COMPTÉE. « détachera 3 biens » n'apprend rien : on ne peut pas décider sans savoir
 * LESQUELS. C'est tout l'objet de la confirmation.
 *
 * ⚠️ RENDRE `null` QUAND IL N'Y A RIEN À DÉTACHER, et c'est la seconde phrase d'Arno : « Si aucun bien n'est
 * rattaché : comportement actuel inchangé, SANS MESSAGE. » Une boîte de confirmation vide serait un geste de plus
 * pour rien, sur le cas le plus fréquent.
 */
export function messageDetachement(biens: readonly BienDetache[]): string | null {
  if (biens.length === 0) return null;
  return `Marquer interne détachera : ${biens.map((b) => b.libelle).join(', ')}`;
}

/**
 * CE QU'ON DIT APRÈS LE GESTE, et qui accompagne l'« Annuler ». PUR.
 *
 * 🔴 LE NOMBRE SUFFIT ICI, à la différence de la confirmation : la décision est prise, et la liste vient d'être lue
 * juste avant. Ce qu'il faut maintenant, c'est un compte rendu court et une sortie.
 */
export function motApresDetachement(nb: number): string {
  if (nb === 0) return 'Mail marqué « interne ».';
  return `Mail marqué « interne » · ${nb} bien${nb > 1 ? 's' : ''} détaché${nb > 1 ? 's' : ''}.`;
}

/**
 * ══ 🔴 CE QUE « ANNULER » REMET, ET CE QU'IL NE PEUT PAS REMETTRE ═══════════════════════════════════════════════
 *
 * Arno : « qui remet EXACTEMENT les rattachements d'avant ».
 *
 * 🔴 LES LIENS SONT REMIS À `confirme`, PAR LA PORTE EXISTANTE — la même que celle qui les a retirés. Le
 * rattachement est donc bien celui d'avant : même lien, même bien, même mail, même origine, même date de création.
 *
 * ⚠️ UNE CHOSE NE REVIENT PAS À L'IDENTIQUE, ET IL FAUT LE SAVOIR : `statut_le`, `statut_par` et `statut_motif`
 * portent désormais la trace du retrait PUIS du rétablissement. C'est la règle du module (« on ne supprime jamais,
 * on date et on signe »), et c'est préférable : un historique qui s'effacerait quand on annule ne serait plus un
 * historique. Le lien, lui, est exactement le même.
 */
export const MOTIF_REMIS_APRES_ANNULATION = 'remis : « interne » annulé dans les secondes qui suivaient';

/** Le mot de l'annulation. PUR. */
export function motApresAnnulation(nb: number): string {
  if (nb === 0) return 'Marque « interne » retirée.';
  return `Marque « interne » retirée · ${nb} bien${nb > 1 ? 's' : ''} remis${nb > 1 ? '' : ''}.`;
}
