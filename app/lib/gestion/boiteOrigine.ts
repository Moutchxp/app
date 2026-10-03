/**
 * ══ 🔴🔴 LOT REINTEGRER — « LE MAIL REVIENT À SA PLACE D'ORIGINE : <BOÎTE> ». Module PUR ══════════════════════════
 *
 * Aucune I/O, aucune base, aucun réseau, aucun React : importable depuis un `'use client'` (règle du module depuis
 * l'incident du 24/09/2026, consigné dans AGENTS.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « pour chaque mail de la corbeille, une action “Réintégrer” dans le menu “…” qui le
 * remet à sa place d'origine : la boîte ou catégorie d'où il vient (Réception, Courrier automatique, Envoyés, Spam,
 * etc.), avec son statut d'avant (À classer / Classé / Interne, lu / non lu, étoile). […] Vérifie la mécanique :
 * d'où vient l'information d'origine ? Est-elle mémorisée au moment de la mise à la corbeille ? »
 *
 * ═══ 🔴🔴 LA RÉPONSE, ÉTABLIE EN LISANT LE CODE : L'ORIGINE N'EST PAS MÉMORISÉE, ELLE EST INTRINSÈQUE ════════════
 *
 * Il n'y a RIEN à enregistrer au moment de la mise à la corbeille, et c'est une propriété du schéma, pas une
 * chance. Les boîtes de ce module ne sont pas des dossiers où l'on RANGE un mail : ce sont des LECTURES, chacune
 * définie par un prédicat sur des colonnes du message lui-même (voir `sqlEtiquette`, `boiteRepo`) :
 *
 *     Réception             sens = 'recu' OU nous sommes destinataire
 *     Envoyés               sens = 'envoye'
 *     Courrier automatique  aucun message de l'échange n'est lisible (exclu_le)
 *     Spam                  spam_le IS NOT NULL
 *     Corbeille             corbeille_le IS NOT NULL
 *
 * 🔴 ET LA MISE À LA CORBEILLE N'ÉCRIT QU'UNE SEULE DE CES COLONNES. Vérifié dans `marquerCorbeille`
 * (`corbeilleRepo`) : un `UPDATE` qui pose `corbeille_le` (et `maj_le`), et rien d'autre. `sens`, `exclu_le` et
 * `spam_le` ne sont JAMAIS touchés — par aucun des trois chemins (la grande corbeille de l'en-tête, l'icône de la
 * barre de survol, la sélection multiple : les trois appellent la même route, donc la même fonction).
 *
 * 🔴 EFFACER `corbeille_le` REND DONC EXACTEMENT SA PLACE AU MAIL, par construction. Et son STATUT avec : les
 * rattachements (`gestion_rattachement`), la marque « Interne » (`gestion_fil_interne`), « Hors gestion »
 * (`gestion_hors_gestion`) et l'étoile (`gestion_etoile`) vivent dans d'autres tables, qu'aucune ligne du chemin de
 * la corbeille n'atteint. Le LU/NON LU, lui, est celui de GMAIL, et `messages.trash`/`untrash` ne touchent que le
 * libellé TRASH — ni UNREAD, ni STARRED.
 *
 * 🔴 AUCUNE DÉDUCTION N'EST DONC NÉCESSAIRE, pas même pour les mails DÉJÀ à la corbeille. MESURÉ SUR LA BASE
 * D'ARNO le 03/10/2026 : 38 mails à la corbeille, **0 d'origine inconnue** — 37 de Réception (35 échanges) et 1
 * d'Envoyés. La « simulation de déduction » demandée n'a pas d'objet : il n'y a rien à deviner.
 *
 * ═══ CE QUE CE MODULE FAIT, ALORS ═══════════════════════════════════════════════════════════════════════════════
 *
 * Il NOMME la boîte d'origine, pour que le menu puisse la dire. Il ne la décide pas — il la LIT, sur les mêmes
 * signaux que les prédicats ci-dessus. C'est la seule part qui manquait : la mécanique, elle, fonctionnait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les boîtes d'où un mail peut venir. `corbeille` n'en est pas une : c'est là qu'il est. */
export type BoiteOrigine = 'reception' | 'envoyes' | 'automatique' | 'spam';

/**
 * CE QU'IL FAUT SAVOIR DU MAIL POUR NOMMER SA BOÎTE — et rien de plus. Les trois signaux sont exactement ceux que
 * les prédicats des listes interrogent.
 */
export interface SignauxOrigine {
  /** Le sens du mail que la ligne représente (lot MESSAGE-CLIQUÉ). */
  sens: 'recu' | 'envoye';
  /** Ce mail porte-t-il la marque SPAM de Gmail ? `false` sans la migration 263 : on n'invente pas un état. */
  spam: boolean;
  /** Combien de messages LISIBLES compte son échange. `0` = tout l'échange est du courrier automatique. */
  lisibles: number;
}

/**
 * ══ LA BOÎTE D'ORIGINE D'UN MAIL. PUR. ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 L'ORDRE DES TROIS TESTS N'EST PAS UN GOÛT, IL EST CELUI DES PRÉDICATS :
 *
 *   ① SPAM D'ABORD. Toutes les autres listes l'écartent (`m.spam_le IS NULL`), et « Spam » est la forme POSITIVE
 *      de cette exclusion. Un mail à la fois spam et écarté par une règle n'apparaît QUE dans Spam : le nommer
 *      « Courrier automatique » enverrait le chercher dans une liste qui ne le montre pas.
 *   ② PUIS LE COURRIER AUTOMATIQUE. Son prédicat porte sur l'ÉCHANGE (« aucun message lisible »), pas sur le
 *      mail : c'est pour cela que le signal est un NOMBRE et non un booléen.
 *   ③ PUIS LE SENS. C'est le dernier, parce que c'est le seul qui soit toujours renseigné.
 *
 * ⚠️ RÉCEPTION ET ENVOYÉS NE SONT PAS DISJOINTES depuis le lot BOITE-SENS : un mail que nous nous sommes adressé
 * est dans les deux. On nomme alors celle que le SENS désigne — c'est la boîte où la ligne se trouvait quand on
 * l'a jetée, et c'est celle qu'on regarde. Dire « les deux » dans une aide de menu n'aiderait personne.
 */
export function boiteOrigine(s: SignauxOrigine): BoiteOrigine {
  if (s.spam) return 'spam';
  if (s.lisibles <= 0) return 'automatique';
  return s.sens === 'envoye' ? 'envoyes' : 'reception';
}

/**
 * LE NOM DE LA BOÎTE, TEL QUE LA COLONNE DE GAUCHE L'ÉCRIT. PUR.
 *
 * 🔴 LES MÊMES MOTS QUE LA COLONNE, AU CARACTÈRE PRÈS. Une aide qui dirait « la boîte de réception » quand
 * l'entrée de gauche dit « Réception » ferait chercher une troisième liste. Un test les compare à
 * `LISTES_CHERCHABLES`, qui porte déjà ces libellés pour la recherche.
 */
export function nomBoiteOrigine(b: BoiteOrigine): string {
  switch (b) {
    case 'reception': return 'Réception';
    case 'envoyes': return 'Envoyés';
    case 'automatique': return 'Courrier automatique';
    case 'spam': return 'Spam';
  }
}

/** Le MOT de l'entrée de menu. Le même que pour les brouillons (demande d'Arno), et écrit une seule fois. */
export const LIBELLE_REINTEGRER = 'Réintégrer';

/**
 * L'AIDE DE L'ENTRÉE, mot pour mot celle d'Arno : « Le mail revient à sa place d'origine : <nom de la boîte> ».
 * PUR.
 *
 * ⚠️ `null` ⇒ ON NE NOMME PAS DE BOÎTE. C'est le cas d'un appelant qui ne connaît pas les signaux (un écran plus
 * ancien, ou la migration 263 absente, qui rend la marque spam illisible). La phrase reste vraie et s'arrête là :
 * inventer « Réception » parce que c'est le cas le plus fréquent enverrait chercher dans la mauvaise liste une
 * fois sur mille — et ce sont ces fois-là qui coûtent.
 */
export function aideReintegrer(b: BoiteOrigine | null): string {
  const base = 'Le mail revient à sa place d’origine';
  return b === null ? `${base}.` : `${base} : ${nomBoiteOrigine(b)}.`;
}

/**
 * LA PHRASE DU BANDEAU, après un « Réintégrer » réussi. PUR.
 *
 * ⚠️ ELLE DIT OÙ LE MAIL EST PARTI, et c'est tout l'intérêt : la liste qu'on regarde est la Corbeille, donc le
 * mail vient d'en DISPARAÎTRE sous les yeux. Sans le nom de la boîte, il faudrait le chercher.
 */
export function bandeauReintegre(b: BoiteOrigine | null): string {
  return b === null
    ? 'Mail réintégré : il a retrouvé sa place.'
    : `Mail réintégré dans « ${nomBoiteOrigine(b)} », avec son statut et son étoile.`;
}
