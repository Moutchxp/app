/**
 * MODULE « GESTION » — LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 1 : LES COMPTEURS DE LA COLONNE, EN DIRECT.
 * Module PUR — aucune I/O, aucune base, aucun réseau, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « mettre un brouillon à la corbeille ne met pas à jour les compteurs (Brouillons,
 * Corbeille…). Il faut recharger la page. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE. Les sept nombres de la colonne viennent d'UNE lecture
 * (`/api/admin/gestion/boite/comptes`), faite une fois en entrant en plein écran et gardée par un numéro de
 * version. Un seul geste la redemandait : le classement (lot STATUT-LIGNE-APRES-CLASSEMENT). Tous les autres —
 * corbeille, restauration, envoi, brouillon, lu/non lu, spam — laissaient les nombres tels quels. Le compteur
 * n'était donc pas faux : il était VIEUX, ce qui est pire, parce que rien ne le dit.
 *
 * RÈGLE D'ARNO : « TOUS les compteurs de la colonne se mettent à jour IMMÉDIATEMENT après toute action […]. Mise
 * à jour optimiste, puis relecture serveur pour confirmer (même source de vérité que les listes). »
 *
 * ═══ 🔴🔴 POURQUOI LES DEUX TEMPS, ET PAS SEULEMENT LA RELECTURE ══════════════════════════════════════════════════
 *
 * MESURÉ LE 03/10/2026 : `comptesBoite()` prend 123 à 258 ms sur la base d'Arno (57 476 messages). C'est peu pour
 * une page, c'est beaucoup pour un chiffre qui doit bouger SOUS LE DOIGT : un quart de seconde d'immobilité se
 * lit comme « il ne s'est rien passé », et c'est exactement la plainte à laquelle ce lot répond.
 *
 * D'où le delta : on applique tout de suite ce qu'on SAIT du geste, et la relecture confirme. Si les deux
 * divergent (un autre onglet a travaillé, la relève a posé un mail), c'est la relecture qui gagne — elle vient de
 * la même source que les listes, et c'est elle la vérité.
 *
 * ⚠️ UN DELTA N'EST JAMAIS DEVINÉ À PARTIR DU MESSAGE AFFICHÉ. Il est NOMMÉ par le geste qui l'émet. Déduire
 * « corbeille » d'une phrase française marcherait jusqu'au jour où quelqu'un reformule la phrase — et le compteur
 * se tromperait sans que personne ne sache pourquoi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les nombres de la colonne, tels que l'écran les tient. `null`/absent = « on ne sait pas », jamais « zéro ». */
export interface ComptesColonne {
  lisibles: number;
  automatiques: number;
  envoyes: number;
  reception: number;
  corbeille: number | null;
  spam?: number;
  aClasser?: number;
}

/**
 * CE QU'UN GESTE CHANGE, compteur par compteur. Toutes les entrées sont facultatives : un geste ne touche que ce
 * qu'il touche, et un champ absent veut dire « celui-là ne bouge pas ».
 *
 * ⚠️ `brouillons` ET `aRattacher` N'APPARTIENNENT PAS À `ComptesColonne` : ils viennent d'autres lectures (le
 * contexte de rédaction, les chiffres de rattachement). Ils voyagent tout de même ici, parce que c'est le MÊME
 * geste qui les déplace et qu'un second type les aurait séparés sans raison.
 */
export interface DeltaCompteurs {
  lisibles?: number;
  automatiques?: number;
  envoyes?: number;
  reception?: number;
  corbeille?: number;
  spam?: number;
  aClasser?: number;
  brouillons?: number;
}

/**
 * ══ APPLIQUER UN DELTA. PUR. ═════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 ON NE DESCEND JAMAIS SOUS ZÉRO. Un compteur négatif est un bogue qui s'affiche : il vaut mieux montrer 0 une
 * demi-seconde — et laisser la relecture corriger — que « −1 échange », qui ferait douter de tout l'écran.
 *
 * ⚠️ UN COMPTEUR INCONNU RESTE INCONNU. `corbeille: null` veut dire « migration 251 absente » : lui ajouter 1
 * fabriquerait un nombre à partir de rien, et ferait apparaître une entrée de colonne qui ne doit pas être là.
 * Même règle pour `spam` et `aClasser`, absents des réponses plus anciennes.
 */
export function appliquerDelta(
  comptes: ComptesColonne | null, delta: DeltaCompteurs | undefined,
): ComptesColonne | null {
  if (comptes === null || delta === undefined) return comptes;
  const ajuster = (valeur: number, d: number | undefined): number =>
    (d === undefined ? valeur : Math.max(0, valeur + d));
  return {
    ...comptes,
    lisibles: ajuster(comptes.lisibles, delta.lisibles),
    automatiques: ajuster(comptes.automatiques, delta.automatiques),
    envoyes: ajuster(comptes.envoyes, delta.envoyes),
    reception: ajuster(comptes.reception, delta.reception),
    corbeille: comptes.corbeille === null ? null : ajuster(comptes.corbeille, delta.corbeille),
    spam: comptes.spam === undefined ? undefined : ajuster(comptes.spam, delta.spam),
    aClasser: comptes.aClasser === undefined ? undefined : ajuster(comptes.aClasser, delta.aClasser),
  };
}

/** Le total des brouillons, ajusté du même delta. `null` = pas encore connu : on n'invente rien. PUR. */
export function appliquerDeltaBrouillons(total: number | null, delta: DeltaCompteurs | undefined): number | null {
  if (total === null || delta?.brouillons === undefined) return total;
  return Math.max(0, total + delta.brouillons);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES GESTES NOMMÉS — ÉCRITS ICI, ET NULLE PART AILLEURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Chaque constante dit CE QUE LE GESTE DÉPLACE, et rien d'autre. Les écrire une seule fois est ce qui empêche
   qu'un même geste compte « +1 corbeille » ici et « −1 réception » là.

   ⚠️ UN GESTE DONT L'EFFET DÉPEND DU CONTEXTE N'A PAS DE DELTA, ET C'EST VOLONTAIRE. Mettre un MAIL à la
   corbeille retire l'échange de la Réception SEULEMENT si c'était son dernier message visible — l'écran ne le
   sait pas, le serveur si. On s'abstient alors de deviner : la relecture, elle, dira juste. Un delta faux
   afficherait un chiffre qui saute, et c'est pire qu'un chiffre qui attend 150 ms. */

/**
 * ══ 🔴🔴 UN BROUILLON PART À LA CORBEILLE — ET « CORBEILLE » MONTE BIEN D'UN CRAN ════════════════════════════════
 *
 * ⚠️ VÉRIFIÉ SUR LA VRAIE ROUTE PLUTÔT QUE SUPPOSÉ, ET J'AI FAILLI ME TROMPER DEUX FOIS. La requête de
 * `boiteRepo` compte des ÉCHANGES (`count(DISTINCT fil_id)` sur les messages à la corbeille) et rend 34 ; j'en
 * avais conclu qu'un brouillon jeté n'y entrait pas. Mais la ROUTE, elle, rend `corbeille: 71` — elle y AJOUTE
 * les brouillons jetés, qu'elle compte à part (`brouillonsJetes: 37`), et c'est ce nombre-là que la colonne
 * affiche. 34 + 37 = 71.
 *
 * 🔴 LA LEÇON EST PLUS GÉNÉRALE QUE CE DELTA : le compteur affiché n'est pas toujours la requête qu'on a sous
 * les yeux. On lit la ROUTE, qui est ce que l'écran consomme.
 */
export const DELTA_BROUILLON_CORBEILLE: DeltaCompteurs = { brouillons: -1, corbeille: 1 };

/** …et le retour, à l'identique en sens inverse. */
export const DELTA_BROUILLON_RESTAURE: DeltaCompteurs = { brouillons: 1, corbeille: -1 };

/**
 * Le MÊME geste, vu depuis la LISTE des brouillons (le bouton « Mettre à la corbeille » d'une ligne).
 *
 * ⚠️ UN SEUL NOM POUR UN SEUL EFFET : il est écrit à part pour que l'écran qui l'emploie se lise tout seul, mais
 * il vaut exactement `DELTA_BROUILLON_CORBEILLE`. Les faire diverger serait le début de deux vérités.
 */
export const DELTA_BROUILLON_JETE: DeltaCompteurs = DELTA_BROUILLON_CORBEILLE;

/**
 * Un brouillon ABANDONNÉ (jamais envoyé, laissé vide) : il disparaît sans passer par la corbeille.
 *
 * ⚠️ DISTINCT DU PRÉCÉDENT, et il faut les deux : « jeter » garde le brouillon et le rend réintégrable
 * (migration 276) ; « abandonner » le retire purement et simplement. Les confondre ferait monter « Corbeille »
 * d'un cran qui n'existe pas.
 */
export const DELTA_BROUILLON_ABANDONNE: DeltaCompteurs = { brouillons: -1 };

/** Un brouillon NEUF : « Brouillons » monte dès la première frappe enregistrée. */
export const DELTA_BROUILLON_NEUF: DeltaCompteurs = { brouillons: 1 };

/** Un ENVOI : le brouillon quitte « Brouillons », le message rejoint « Envoyés ». */
export const DELTA_ENVOI: DeltaCompteurs = { brouillons: -1, envoyes: 1 };

/** Un ÉCHANGE part à la corbeille. Voir l'encadré : seule « Corbeille » bouge à coup sûr. */
export const DELTA_FIL_CORBEILLE: DeltaCompteurs = { corbeille: 1 };

/** …et le retour. */
export const DELTA_FIL_RESTAURE: DeltaCompteurs = { corbeille: -1 };

/** Un échange marqué SPAM. L'entrée « Spam » monte ; d'où il sort dépend du dossier, et la relecture le dira. */
export const DELTA_SPAM: DeltaCompteurs = { spam: 1 };

/** …et le retour du spam. */
export const DELTA_SPAM_RETIRE: DeltaCompteurs = { spam: -1 };
