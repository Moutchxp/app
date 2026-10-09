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

/**
 * ══ 🔴🔴 LOT FILTRE-NON-LUS-BLOQUANT — CE QU'ON MONTRE, ET SUR COMBIEN. PUR ═════════════════════════════════════
 *
 * ARNO (09/10/2026) : « Le compteur d'en-tête dit “27 non lus sur 10281 conversations” (ou équivalent juste), pas
 * seulement “27 conversations”. »
 *
 * 🔴 C'EST LA MÊME MALADIE QUE L'OPTION C, UN CRAN PLUS LOIN. « 27 conversations » au-dessus d'un dossier qui en
 * annonce 10 281 ne ment pas, mais ne dit pas qu'on regarde une PARTIE : on croit que la boîte a fondu. Le
 * dénominateur est ce qui transforme un nombre inquiétant en une information.
 *
 * ⚠️ `total === null` ⇒ ON S'ARRÊTE À CE QU'ON SAIT (« 27 non lus »), plutôt que d'inventer un dénominateur. Un
 * « sur 0 » ou un « sur ? » serait pire que le nombre nu — c'est la règle de tout le module : une étiquette sans
 * nombre vaut mieux qu'un faux.
 *
 * ⚠️ LE TOTAL EST CELUI DU DOSSIER, pas celui de la page : il vient de la colonne de gauche, qui l'a compté sans
 * filtre. C'est l'appelant qui le fournit — ce module ne sait pas compter, il sait écrire.
 */
export function motNonLusSur(nonLus: number, total: number | null): string {
  const gauche = nonLus === 1 ? '1 non lu' : `${nonLus} non lus`;
  return total === null ? gauche : `${gauche} sur ${motConversations(total)}`;
}
