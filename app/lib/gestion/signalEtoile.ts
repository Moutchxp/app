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

/** Ce que porte le signal : l'échange touché, et l'état que le serveur a CONFIRMÉ. */
export interface SignalEtoile {
  filId: number;
  etoilee: boolean;
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
