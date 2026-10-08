/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LA BULLE DE SURVOL ET SA TOLÉRANCE DE TRAJET — LOT FRISE-BULLE-ET-ENREGISTRER (08/10/2026) ══════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot :
 *   « Au survol d'un point, la bulle (texte + liens “Modifier”, “Retirer”, pièces) se ferme dès que la souris
 *     quitte le point → on ne peut jamais cliquer dans la bulle. La bulle reste ouverte tant que la souris est
 *     sur le point OU sur la bulle, avec une tolérance de trajet (petit délai ~300 ms à la sortie + pas de vide
 *     entre point et bulle). […] Même comportement pour la bulle du “i” des carrés. Aucun lien ni action de la
 *     bulle n'est retiré. »
 *
 * 🔴 CE QUE CE DÉFAUT COÛTAIT, EXACTEMENT. La bulle d'un point porte « Modifier », « Retirer » et ses pièces.
 * Elle se fermait sur `onMouseLeave` du point lui-même : entre le point (11 px) et la bulle, rendue SOUS la
 * frise, la souris traverse un vide — et la bulle disparaissait en route. Ces liens existaient donc sans être
 * atteignables à la souris : seul le CLIC, qui épingle, y donnait accès, et rien ne le disait.
 *
 * 🔴 POURQUOI UNE MACHINE À ÉTATS PURE, ET NON TROIS `setTimeout` DANS L'ÉCRAN. La règle tient en une phrase —
 * « la bulle ne se ferme que si, le délai écoulé, la souris n'est NI sur la cible NI sur la bulle » — mais elle
 * se trompe facilement : la fermeture différée doit être ANNULÉE par une entrée, et une entrée sur la bulle ne
 * doit pas changer la cible affichée. Écrite dans l'écran, elle y aurait vécu en trois `useRef` qu'aucune
 * épreuve ne peut interroger. Ici, chaque transition est une fonction qu'on éprouve en une ligne.
 *
 * ⚠️ AUCUN `setTimeout` DANS CE FICHIER : il ne connaît pas le temps, il dit seulement ce qu'il faut faire
 * quand le délai échoit. Le minuteur vit dans le crochet `useBulleSurvol`, qui est le seul à savoir que le
 * navigateur existe. C'est la même séparation que `glisserCarte.ts` et `useGlisserCarte.ts`.
 */

/**
 * 🔴 300 ms, LE CHIFFRE D'ARNO (« un petit délai ~300 ms à la sortie »). C'est aussi l'ordre de grandeur usuel
 * d'un menu qui se referme : assez pour traverser un vide de quelques dizaines de pixels sans courir, trop court
 * pour qu'une bulle oubliée reste sur l'écran quand on est passé à autre chose.
 */
export const DELAI_FERMETURE_BULLE_MS = 300;

/**
 * Ce que l'on sait à un instant donné.
 *
 * · `cible` — la clé de ce que l'on survole (`p12` pour un point, `c34` pour un carré), ou `null` : c'est ce que
 *   la bulle montre. Elle ne change JAMAIS quand on entre dans la bulle : on y lit ce qu'on y est venu lire.
 * · `surLaCible` / `surLaBulle` — les deux zones qui gardent la bulle ouverte. Deux témoins, et non un seul :
 *   on passe de l'une à l'autre sans jamais être sur les deux, ni sur aucune pendant le trajet.
 * · `fermetureDemandee` — une sortie a eu lieu, le minuteur court. Une entrée l'annule.
 */
export interface EtatBulle {
  readonly cible: string | null;
  readonly surLaCible: boolean;
  readonly surLaBulle: boolean;
  readonly fermetureDemandee: boolean;
}

export const BULLE_FERMEE: EtatBulle = {
  cible: null, surLaCible: false, surLaBulle: false, fermetureDemandee: false,
};

/**
 * La souris entre sur une cible (un point, le « i » d'un carré).
 *
 * ⚠️ ELLE ANNULE TOUTE FERMETURE EN ATTENTE, y compris celle d'une AUTRE cible : revenir en arrière puis aller
 * sur le point voisin ne doit pas fermer la bulle une fraction de seconde plus tard, alors qu'on en regarde
 * déjà une autre. C'est le défaut classique des menus à délai.
 *
 * ⚠️ ELLE NE PREND PAS L'ÉTAT COURANT, et c'est volontaire : une entrée EFFACE tout ce qui précède. Lui passer
 * l'ancien état laisserait croire qu'elle en garde quelque chose.
 */
export function surEntreeCible(cle: string): EtatBulle {
  return { cible: cle, surLaCible: true, surLaBulle: false, fermetureDemandee: false };
}

/** La souris quitte la cible : on ne ferme pas, on le DEMANDE. Le minuteur tranchera. */
export function surSortieCible(etat: EtatBulle): EtatBulle {
  if (etat.cible === null) return etat;
  return { ...etat, surLaCible: false, fermetureDemandee: true };
}

/**
 * La souris entre dans la bulle elle-même.
 *
 * 🔴 C'EST TOUT L'OBJET DU LOT : c'est cette transition qui rend les liens « Modifier » et « Retirer »
 * atteignables. La cible affichée ne change pas — on continue de montrer ce qu'on montrait.
 *
 * ⚠️ ELLE NE RALLUME RIEN SI LA BULLE EST DÉJÀ FERMÉE : une entrée sur un fantôme (la bulle a disparu sous la
 * souris, le minuteur ayant échu) ne doit pas la faire revenir.
 */
export function surEntreeBulle(etat: EtatBulle): EtatBulle {
  if (etat.cible === null) return etat;
  return { ...etat, surLaBulle: true, fermetureDemandee: false };
}

/** La souris quitte la bulle : même traitement que la cible — on diffère. */
export function surSortieBulle(etat: EtatBulle): EtatBulle {
  if (etat.cible === null) return etat;
  return { ...etat, surLaBulle: false, fermetureDemandee: true };
}

/**
 * Le délai est écoulé.
 *
 * 🔴 ON NE FERME QUE SI PERSONNE N'EST DESSUS. Les deux témoins sont relus ICI, et non au moment de la sortie :
 * entre la sortie et l'échéance, la souris a pu entrer dans la bulle — et dans ce cas la fermeture a déjà été
 * annulée, mais la garde reste, parce qu'un minuteur en retard est la chose la plus banale du monde.
 */
export function surDelaiEchu(etat: EtatBulle): EtatBulle {
  if (!etat.fermetureDemandee) return etat;
  if (etat.surLaCible || etat.surLaBulle) return { ...etat, fermetureDemandee: false };
  return BULLE_FERMEE;
}

/** Tout refermer d'un coup — Échap, un clic ailleurs, l'ouverture d'un panneau. */
export function fermerLaBulle(): EtatBulle {
  return BULLE_FERMEE;
}

/**
 * Faut-il armer un minuteur ? Le crochet pose cette question à chaque état : c'est la seule chose qu'il a besoin
 * de savoir du temps, et elle se lit ici plutôt que de se deviner là-bas.
 */
export function minuteurArme(etat: EtatBulle): boolean {
  return etat.fermetureDemandee && !etat.surLaCible && !etat.surLaBulle;
}
