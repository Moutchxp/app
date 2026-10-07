/* 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — un mail étoilé a UNE forme, définie dans le module PUR `etoileLigne`. */
import type { MailEtoile } from './etoileLigne';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — « L'ÉTOILE DE CET ÉCHANGE VIENT DE CHANGER » ═════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg`. Il ne porte qu'un registre d'auditeurs en
 * mémoire du navigateur — donc importable depuis un `'use client'` (règle du dépôt depuis l'incident du
 * 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « C'est la MÊME fonction et le MÊME état que l'étoile de la barre de survol des
 * lignes et que l'étoile rouge affichée sur la ligne : une seule porte d'écriture, un seul état. Cliquer l'une
 * allume ou éteint les trois en direct (ligne, barre de survol, mail ouvert), dans les deux sens. »
 *
 * 🔴 POURQUOI UN SIGNAL, ET NON UN RAPPEL DE PLUS DANS LES PROPRIÉTÉS. Les trois étoiles ne vivent pas dans le
 * même arbre : la ligne et sa barre de survol sont dans `BoiteMail`, le mail ouvert dans `Conversation` — et
 * `Conversation` est montée à CÔTÉ de `BoiteMail` (écran partagé : `GestionVue` ; plein écran :
 * `PleinEcranBoite`), jamais dedans. Faire redescendre un état commun aurait demandé de le remonter dans les
 * DEUX parents, puis de le recâbler à l'identique dans `CarteVive` — trois chemins à tenir d'accord, et un
 * quatrième écran à ne pas oublier le jour où il montrera une conversation.
 *
 * ═══ 🔴 CE SIGNAL PORTE UNE VALEUR, LÀ OÙ CELUI DES PIÈCES DIT SEULEMENT « REDEMANDE » ══════════════════════════
 *
 * `signalPieceDrive` ne transporte rien : l'emplacement d'une pièce est une donnée riche, que seul le serveur
 * connaît. L'étoile d'un échange, elle, est UN booléen, et la porte d'écriture le reçoit CONFIRMÉ par Gmail
 * (`issue.etoilee`, voir `basculerEtoileDuFil`). Le transporter évite une relecture à chaque clic — et surtout il
 * évite que les trois étoiles passent par un état intermédiaire différent chacune, le temps de la réponse.
 *
 * ═══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 1 — ON ANNONCE **AVANT**, PUIS ON CORRIGE ══════════════════════
 *
 * CE QUI ÉTAIT ÉCRIT ICI : « on n'annonce que ce qui est écrit ; rien n'est émis avant la réponse du serveur ;
 * le bouton cliqué, lui, a le droit d'anticiper POUR LUI-MÊME ». L'intention était juste — ne pas allumer une
 * étoile sur un geste que Gmail peut refuser — et le résultat était exactement le défaut qu'Arno signale :
 * l'étoile cliquée s'allume tout de suite, les autres attendent l'aller-retour.
 *
 * 🔴 MESURÉ À L'ÉCRAN (fil 36748, le cas d'Arno, 06/10/2026) :
 *     · clic sur la GRANDE étoile  → elle bascule à 19 ms, l'écriture revient à 656 ms, la LIGNE bascule à 740 ms
 *     · clic sur la LIGNE          → elle bascule à 61 ms, la GRANDE bascule à 810 ms
 *   Soit **six à sept dixièmes de seconde** pendant lesquels deux étoiles du même mail se contredisent. C'est
 *   assez long pour être vu, et c'est précisément ce qu'Arno a vu.
 *
 * 🔴 RÈGLE D'ARNO (06/10/2026) : « UN SEUL état partagé côté écran par mail. Un clic sur n'importe laquelle met à
 * jour TOUTES les étoiles de ce mail dans la même image (aucun délai visible), puis enregistre en base. En cas
 * d'échec, toutes reviennent à l'état d'avant, avec un message court. »
 *
 * 🔴 D'OÙ DEUX ANNONCES PAR GESTE, et non une :
 *     ① l'annonce VOULUE, émise AVANT l'écriture — toutes les étoiles basculent dans la même image, y compris
 *        celle qu'on a cliquée (elle n'anticipe plus pour elle seule : elle écoute comme les autres) ;
 *     ② l'annonce de RETOUR, émise après la réponse : l'état confirmé si tout va bien, l'état d'AVANT si le
 *        serveur a refusé — et dans ce cas l'écran qui a cliqué dit pourquoi, en une phrase.
 *
 * ⚠️ L'OBJECTION D'HIER TIENT TOUJOURS, ET ELLE EST RÉPONDUE : une annonce optimiste allume bien les étoiles sur
 * un geste refusable. La différence est qu'elles se rallument TOUTES ensemble au refus, au lieu qu'une seule
 * sache se remettre droite pendant que les autres n'avaient jamais bougé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — LE SIGNAL DIT QUEL **MAIL**, ET PLUS SEULEMENT QUEL ÉCHANGE ══════════════════
 *
 * BUG CONSTATÉ PAR ARNO (07/10/2026, fil 36764 « Facture Huissier », 3 mails) : il clique la GRANDE étoile du
 * mail déplié du 06/10 16:31, et c'est l'étoile du mail du HAUT (07/10 09:32) qui s'allume en rouge.
 *
 * 🔴 LE SIGNAL EN ÉTAIT COMPLICE. Il ne portait que `{ filId, etoilee }` : aucun écran ne pouvait savoir DE QUEL
 * MAIL on parlait, et la conversation devait DEVINER — elle allumait « le dernier message de l'échange », parce
 * que c'est ce que la porte d'écriture d'un ÉCHANGE visait. Sur un fil d'un seul mail la devinette tombait juste ;
 * dès le second, elle désignait le mauvais.
 *
 * 🔴 RÈGLE D'ARNO : « une étoile ne concerne QUE le mail sur lequel on clique. Elle ne déborde jamais sur un autre
 * mail, ni de la conversation, ni d'ailleurs. » Le signal porte donc l'IDENTIFIANT DU MESSAGE, et les écrans n'ont
 * plus rien à deviner.
 */
export interface SignalEtoile {
  filId: number;
  /**
   * 🔴 LE MAIL TOUCHÉ, et lui seul. `null` = le geste a porté sur l'ÉCHANGE ENTIER — c'est le cas de la ligne de
   * la boîte et de sa barre de survol, où une ligne REPRÉSENTE une conversation (règle inchangée, cf. `boiteRepo`
   * et la porte `gesteEtoileFil`). Un écran qui affiche des mails applique alors la règle de cette porte : poser
   * va sur le dernier message, retirer passe sur tous.
   */
  messageId: number | null;
  /** L'état de CE mail (ou de l'échange entier quand `messageId` vaut `null`). */
  etoilee: boolean;
  /**
   * ══ 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — LES MAILS ÉTOILÉS DE L'ÉCHANGE, APRÈS CE GESTE ═══════════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI : `filEtoile: boolean | null`, « l'échange porte-t-il encore une étoile ? ». C'était la
   * réponse à l'ancienne question de la ligne. Depuis que la ligne a TROIS états (pleine / creuse / aucune), elle
   * n'en pose plus une mais deux : le mail que J'AFFICHE est-il étoilé, et lequel l'est AILLEURS ? Un booléen ne
   * peut pas y répondre, et surtout il ne peut pas NOMMER l'autre mail dans la bulle d'aide.
   *
   * 🔴 ON TRANSPORTE DONC LA LISTE, et chaque ligne en tire SA réponse avec `etoileDeLaLigne` — le même calcul que
   * le serveur. L'émetteur n'a pas à savoir quel mail telle liste affiche : il dit ce qui EST, pas ce qu'il faut
   * dessiner.
   *
   * ⚠️ `null` = L'ÉMETTEUR NE CONNAÎT PAS TOUTE LA CONVERSATION — c'est le cas d'un clic depuis une LIGNE, qui ne
   * connaît que le mail qu'elle montre. La ligne sait alors quand même se mettre à jour, parce que `messageId` et
   * `etoilee` lui suffisent pour SON mail (voir `etoileLigneApresSignal`). Hors de ce cas, on garde l'état qu'on a
   * et la relecture suivante remet droit : deviner éteindrait une ligne encore étoilée — ou l'inverse.
   */
  etoiles: readonly MailEtoile[] | null;
}

export type AuditeurEtoile = (s: SignalEtoile) => void;

/**
 * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte (ouvrir puis refermer une
 * conversation) ne doit pas laisser derrière lui un auditeur mort, et deux abonnements du même auditeur ne
 * doivent pas faire deux mises à jour.
 */
const auditeurs = new Set<AuditeurEtoile>();

/**
 * S'ABONNER. Rend la fonction de désabonnement — c'est le contrat d'un `useEffect`, et le seul qui garantisse
 * qu'un écran démonté cesse d'être appelé.
 */
export function ecouterEtoile(a: AuditeurEtoile): () => void {
  auditeurs.add(a);
  return () => { auditeurs.delete(a); };
}

/**
 * ANNONCER. Appelée par la porte d'écriture (`gesteEtoileFil`), et par elle seule.
 *
 * ⚠️ UNE COPIE DU REGISTRE AVANT DE PARCOURIR : un auditeur qui se désabonne en se démontant pendant l'annonce
 * modifierait l'ensemble en cours de lecture.
 *
 * ⚠️ UN AUDITEUR QUI JETTE N'EMPÊCHE PAS LES AUTRES D'ÊTRE PRÉVENUS : une étoile qui ne s'allume pas sur un écran
 * ne doit pas laisser les deux autres dans l'état d'avant — ce serait précisément le désaccord qu'on répare.
 */
export function annoncerEtoile(s: SignalEtoile): void {
  for (const a of [...auditeurs]) {
    try { a(s); } catch { /* un écran en faute ne fait pas taire les autres */ }
  }
}
