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
import { motSortieDesBiens } from './sortirDuSuivi';

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

/**
 * Un bien que le geste va détacher, ou vient de détacher.
 *
 * 🔴 LOT INTERNE-GLISSIERE-ET-STATUT-COHERENT — `messageId` et `recuLe` disent DE QUEL MAIL le lien sera retiré. Sans
 * eux, le panneau écrivait « Sortir ce mail du suivi de … » pour un bien porté par un AUTRE mail de la conversation
 * (constat d'Arno, mail 58109 : le lot 236 était porté par le mail de 17:49). Facultatifs : une réponse d'API plus
 * ancienne ne les porte pas, et le texte retombe alors sur une forme qui ne nomme aucun mail.
 */
export interface BienDetache { lienId: number; libelle: string; messageId?: number | null; recuLe?: string | null }

/**
 * ══ 🔴🔴 LOT INTERNE-PAR-DEFAUT-VERS-L-AVANT — LE PREMIER MAIL D'UNE CONVERSATION. PUR. ══════════════════════════════
 * `mails` est dans l'ordre CHRONOLOGIQUE. Vide (conversation inconnue) ⇒ on le tient pour premier : la portée ne
 * couvre alors que lui, et rien ne remonte dans le passé.
 */
export function estPremierMail(messageId: number, mails: readonly number[]): boolean {
  return mails.length === 0 || mails[0] === messageId;
}

/**
 * ══ 🔴🔴 LOT RATTACHEMENT-CONVERSATION (16/10/2026) — FAUT-IL DEMANDER LA PORTÉE D'UN « INTERNE » ? PUR. ═════════════
 *
 * RÈGLE D'ARNO (C) : conversation SANS suivi de fond, « À classer », qui contient déjà plusieurs mails — quand on classe
 * un mail qui n'est PAS le premier, l'application demande quel type de suivi appliquer (One shot, Ce mail + futurs
 * échanges, Toute la conversation). Le premier mail fixe, lui, le suivi de fond de toute la conversation (A) ; et une
 * conversation qui a déjà un suivi de fond garde les règles d'aujourd'hui (B).
 *
 * « SANS SUIVI DE FOND » = aucune fenêtre (période ou exception), aucun rattachement validé, aucune marque « Interne »
 * de l'échange. `mails` est dans l'ordre CHRONOLOGIQUE ; vide (conversation inconnue) ⇒ on ne demande rien.
 */
export function porteeInterneADemander(o: {
  messageId: number; mails: readonly number[]; nbPeriodes: number; nbExceptions: number;
  rattachee: boolean; interneEchange: boolean;
}): boolean {
  const sansFond = o.nbPeriodes === 0 && o.nbExceptions === 0 && !o.rattachee && !o.interneEchange;
  return sansFond && o.mails.length > 1 && o.mails.includes(o.messageId) && !estPremierMail(o.messageId, o.mails);
}

/** Le bandeau du premier mail marqué directement (Arno) : « Conversation marquée Interne — Annuler », 10 secondes. */
export const MOT_BANDEAU_DIRECT = 'Conversation marquée Interne';
export const SECONDES_BANDEAU_DIRECT = 10;

/** La portée du marquage, dite en une phrase (texte d'explication sous la glissière du panneau « Interne »). PUR. */
export function phrasePorteeInterne(choix: 'mail' | 'suite' | 'conversation'): string {
  if (choix === 'mail') return 'Ce mail sera marqué Interne. Les autres mails de la conversation ne changent pas.';
  if (choix === 'suite') {
    return 'Ce mail et les mails suivants de cette conversation seront marqués Interne, ainsi que ses prochains échanges. '
      + 'Les mails plus anciens ne changent pas.';
  }
  return 'Tous les mails de cette conversation seront marqués Interne, ainsi que ses prochains échanges.';
}

/** « 12/10 à 17:49 », à l'heure de Paris. PUR. */
export function dateCourteMail(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
  return `${f({ day: '2-digit', month: '2-digit' })} à ${f({ hour: '2-digit', minute: '2-digit' })}`;
}

export const AUCUN_BIEN_RETIRE = 'Aucun bien n’est retiré du suivi.';

/**
 * ══ 🔴🔴 LOT INTERNE-GLISSIERE-ET-STATUT-COHERENT — CE QUI VA CHANGER, MAIL PAR MAIL. PUR. ══════════════════════════
 *
 * RÈGLE D'ARNO : « Ne jamais écrire “Sortir CE mail du suivi de X” si ce mail n'est pas suivi par X. Lister précisément
 * ce qui va changer » — une phrase par mail touché, dans l'ordre des mails :
 *   · « Ce mail sortira du suivi de X (restaurable). » pour le mail cliqué ;
 *   · « Le mail du 12/10 à 17:49 de cette conversation sortira du suivi de X (restaurable). » pour un autre ;
 *   · « Aucun bien n'est retiré du suivi. » quand il n'y a rien.
 */
export function phrasesDetachement(messageId: number, biens: readonly BienDetache[]): string[] {
  if (biens.length === 0) return [AUCUN_BIEN_RETIRE];
  const parMail = new Map<string, { mail: number | null; recuLe: string | null; libelles: string[] }>();
  for (const b of biens) {
    const cle = b.messageId == null ? '?' : String(b.messageId);
    const g = parMail.get(cle) ?? { mail: b.messageId ?? null, recuLe: b.recuLe ?? null, libelles: [] };
    if (!g.libelles.includes(b.libelle)) g.libelles.push(b.libelle);
    parMail.set(cle, g);
  }
  const groupes = [...parMail.values()].sort((a, b) => (a.recuLe ?? '').localeCompare(b.recuLe ?? ''));
  return groupes.map((g) => {
    const quoi = g.libelles.join(', de ');
    if (g.mail === messageId) return `Ce mail sortira du suivi de ${quoi} (restaurable).`;
    if (g.mail === null) return `Sortira du suivi : ${g.libelles.join(', ')} (restaurable).`;
    const quand = g.recuLe === null ? `nº ${g.mail}` : `du ${dateCourteMail(g.recuLe)}`;
    return `Le mail ${quand} de cette conversation sortira du suivi de ${quoi} (restaurable).`;
  });
}

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
/* 🔴🔴 LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS — CE QU'ELLE DISAIT AVANT : « Marquer interne détachera : <liste> ».
   « Interne » ne détache plus aucun bien : il sort le mail du suivi de chacun d'eux, restaurable (décision d'Arno), et la
   question est celle des six gestes, mot pour mot. */
export function messageDetachement(biens: readonly BienDetache[]): string | null {
  if (biens.length === 0) return null;
  return motSortieDesBiens(biens.map((b) => b.libelle));
}

/**
 * CE QU'ON DIT APRÈS LE GESTE, et qui accompagne l'« Annuler ». PUR.
 *
 * 🔴 LE NOMBRE SUFFIT ICI, à la différence de la confirmation : la décision est prise, et la liste vient d'être lue
 * juste avant. Ce qu'il faut maintenant, c'est un compte rendu court et une sortie.
 */
export function motApresDetachement(nb: number): string {
  if (nb === 0) return 'Mail marqué « interne ».';
  // LOT HISTORIQUE-SORTIE-PAR-BIEN — CE QU'ELLE DISAIT AVANT : « · N bien(s) détaché(s) ».
  return `Mail marqué « interne » · sorti du suivi de ${nb} bien${nb > 1 ? 's' : ''} (restaurable).`;
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
