/**
 * ══ 🔴🔴 LOT OPTION-C — CHAQUE TITRE DIT CE QU'IL COMPTE. Module PUR ════════════════════════════════════════════
 *
 * Aucune I/O, aucune base, aucun réseau, aucun React : importable depuis un `'use client'` sans risque (règle du
 * module depuis l'incident du 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026) — OPTION C, à la question posée par le lot RECEPTION-UNE-SEULE-SOURCE :
 *
 *     « Les deux unités restent (écran partagé = mails reçus, décision STATUT-PAR-MAIL ; plein écran =
 *       conversations) et chaque titre dit ce qu'il compte : “N mails reçus” et “N conversations”. »
 *
 * 🔴 CE QU'ELLE RÈGLE, ET POURQUOI UN NOMBRE NU NE SUFFISAIT PAS. L'écran partagé annonçait « 16 980 » et le plein
 * écran « 10 232 » pour la MÊME boîte de réception. Les deux étaient justes — l'un compte des MAILS, l'autre des
 * CONVERSATIONS — mais rien à l'écran ne le disait, et un nombre plus petit à droite se lit « il manque des
 * mails ». C'est exactement la phrase d'Arno le 03/10 : « j'ai l'impression qu'un mail manque. »
 *
 * 🔴 LES DEUX MOTS SONT ÉCRITS ICI, ET NULLE PART AILLEURS. Deux libellés recopiés dans deux composants auraient
 * fini par dire « mails » d'un côté et « messages » de l'autre — et l'on aurait de nouveau comparé deux nombres
 * sans savoir s'ils comptent la même chose. Une seule écriture, deux emplois.
 *
 * ⚠️ LE SINGULIER EST TRAITÉ, et ce n'est pas de la coquetterie : « 1 mails reçus » dans un en-tête de colonne se
 * remarque tout de suite et fait douter du reste de l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * CE QUE COMPTE L'ÉCRAN PARTAGÉ : des MAILS REÇUS, un par ligne (lot STATUT-PAR-MAIL). PUR.
 *
 * ⚠️ « reçus » S'ACCORDE AVEC « mails », pas avec le nombre : au singulier, « 1 mail reçu ».
 */
export function motMailsRecus(n: number): string {
  return n === 1 ? '1 mail reçu' : `${n} mails reçus`;
}

/**
 * CE QUE COMPTE LE PLEIN ÉCRAN : des CONVERSATIONS, une par ligne (le prédicat `NOT EXISTS` de `sqlPageBoite` ne
 * garde qu'un message par échange, sous TOUTES les étiquettes). PUR.
 *
 * 🔴 « conversation » ET NON « échange ». Le mot « échange » est celui du code et du domaine ; « conversation » est
 * celui qu'Arno a écrit, et c'est aussi celui de Gmail — donc celui que lit quelqu'un qui regarde l'écran.
 */
export function motConversations(n: number): string {
  return n === 1 ? '1 conversation' : `${n} conversations`;
}
