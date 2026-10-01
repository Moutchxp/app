/**
 * ══ 🔴🔴 LOT FLECHES-RETOUR — « ← » RAMÈNE À L'ÉCRAN PRÉCÉDENT, PAS À UNE DESTINATION FIXE ════════════════════
 *
 * RÈGLE D'ARNO (01/10/2026) : « Toute flèche ou tout bouton de retour ramène à l'ÉCRAN PRÉCÉDENT réellement
 * visité, dans l'état exact où on l'a quitté : même dossier ou onglet, même filtre, même recherche, même page de
 * liste, même position de défilement, même mail sélectionné. Jamais vers une destination fixe (accueil,
 * Réception…) quand on venait d'ailleurs. »
 *
 * ═══ POURQUOI UN MODULE PUR, ET UN SEUL ═════════════════════════════════════════════════════════════════════════
 *
 * Avant ce lot, chaque écran avait SON retour, écrit à la main dans `GestionVue` : la conversation revenait à son
 * étiquette courante (donc « Réception » même si l'on venait de « À rattacher »), l'annuaire revenait à sa liste
 * (donc jamais au mail d'où l'on venait). Cinq rappels différents pour une seule question — « d'où venais-je ? » —
 * et aucun des cinq ne la posait vraiment. La réponse n'est pas dans l'écran courant : elle est dans ce qu'on a
 * quitté pour y venir, et c'est l'HISTORIQUE du navigateur qui le sait.
 *
 * ═══ LES TROIS DÉCISIONS, ET RIEN D'AUTRE ═══════════════════════════════════════════════════════════════════════
 *
 *   ① `parentDe` — en allant d'un écran à un autre, QUEL écran faudra-t-il retrouver ? Descendre (ouvrir un mail,
 *      une fiche, changer d'écran) pose un parent ; se déplacer LATÉRALEMENT (d'un mail à l'autre, d'un filtre à
 *      l'autre) hérite du parent déjà posé — sans quoi « ← » ferait reculer d'un mail au lieu de rendre la liste.
 *   ② `repliDe` — ouverture directe par une adresse collée : il n'y a RIEN derrière. On ne sort pas de
 *      l'application et on ne rend pas une page vide ; on remonte d'un cran logique (le dossier du mail, la liste
 *      de l'annuaire, la boîte).
 *   ③ `decisionRetour` — faut-il reculer dans l'historique (le navigateur rend alors la position de défilement
 *      lui-même, et « ← » devient exactement le bouton « Précédent ») ou aller droit à l'écran parent ?
 *
 * 🔴 AUCUN IMPORT DE REACT NI DE `window` : ce fichier décide, l'écran agit. C'est ce qui le rend éprouvable sans
 * navigateur — et c'est aussi ce qui garantit qu'il n'existe qu'UNE définition de « revenir ».
 */
import { ETAT_DEFAUT, memeEtat, type EtatEcranUrl } from './ecranUrl';

/**
 * CE QU'UNE ENTRÉE D'HISTORIQUE RETIENT, en plus de l'adresse.
 *
 * ⚠️ ELLE DOIT RESTER SÉRIALISABLE : le navigateur la range dans son historique, la relit après un rechargement
 * et la recopie dans l'onglet dupliqué. Un objet simple, donc — jamais une fonction, jamais une référence React.
 */
export interface MemoireEntree {
  /** L'écran à retrouver. `null` = on est entré ici par une adresse collée : il n'y a rien derrière. */
  parent: EtatEcranUrl | null;
  /**
   * Le parent est-il l'entrée JUSTE AVANT dans l'historique ?
   *
   * 🔴 C'EST CE DRAPEAU QUI FAIT QUE « ← » ET « PRÉCÉDENT » DONNENT LE MÊME RÉSULTAT. Quand il est vrai, le retour
   * recule d'un cran, et le navigateur rend lui-même la position de défilement de la liste — ce qu'aucune
   * navigation « vers l'avant » ne sait faire. Quand il est faux (on est arrivé ici d'un mail voisin, pas du
   * parent), reculer rendrait le MAIL précédent : on va alors droit au parent.
   */
  parentEstPrecedent: boolean;
}

export const MEMOIRE_VIDE: MemoireEntree = { parent: null, parentEstPrecedent: false };

/** Un mail est-il ouvert dans cet état ? */
const aUnFil = (e: EtatEcranUrl): boolean => e.filOuvert !== null;
/** Une fiche de l'annuaire est-elle ouverte ? */
const aUneFiche = (e: EtatEcranUrl): boolean => (e.fiche ?? null) !== null;

/**
 * ══ ① QUEL PARENT POUR LE PROCHAIN ÉCRAN ? ══════════════════════════════════════════════════════════════════════
 *
 * 🔴 LA DISTINCTION QUI PORTE TOUT : DESCENDRE ou SE DÉPLACER.
 *
 *   · DESCENDRE — on ouvre quelque chose qui n'était pas ouvert (un mail depuis une liste, une fiche depuis un
 *     mail), ou l'on change d'écran. Le parent devient l'écran qu'on quitte : c'est lui qu'on voudra retrouver.
 *   · SE DÉPLACER — on passe d'un mail à un autre, d'un filtre à un autre, d'une fiche à une autre, SANS changer
 *     de niveau. Le parent ne bouge pas : il reste la liste d'où l'on est parti.
 *
 * ⚠️ SANS CETTE SECONDE RÈGLE, « ← » RECULERAIT D'UN MAIL. Demande d'Arno, mot pour mot : « Mail ouvert depuis
 * Précédent/Suivant : ← retourne à la liste, pas au mail précédent. » C'est exactement ce que l'héritage protège.
 *
 * ⚠️ FERMER NE PASSE PAS PAR ICI. Fermer un mail, c'est `retour()` — pas un `aller()` vers la liste. Si une voie
 * programmatique le fait quand même (un échange mis à la corbeille disparaît sous les yeux), on remonte d'un
 * niveau : le parent de la liste est celui que la liste avait déjà.
 */
export function parentDe(
  courant: EtatEcranUrl, suivant: EtatEcranUrl, parentCourant: EtatEcranUrl | null,
): EtatEcranUrl | null {
  // Le même écran exactement : rien n'a bougé, le parent non plus.
  if (memeEtat(courant, suivant)) return parentCourant;

  /**
   * ── ON REMONTE : ce qui était ouvert ne l'est plus, SUR LE MÊME ÉCRAN. Le parent de la destination est celui
   * qu'avait le courant.
   *
   * ⚠️ « SUR LE MÊME ÉCRAN » EST INDISPENSABLE, et l'essai de l'annuaire l'a montré : aller d'un MAIL à une FICHE
   * ferme bien le mail, mais c'est une DESCENTE vers un autre écran — et c'est le mail qu'il faudra retrouver.
   * Sans cette condition, « Mail → fiche du bien → ← » rendait la liste de l'annuaire, soit le défaut d'Arno.
   */
  if (aUnFil(courant) && !aUnFil(suivant) && courant.ecran === suivant.ecran) return parentCourant;
  if (courant.ecran === 'annuaire' && suivant.ecran === 'annuaire' && aUneFiche(courant) && !aUneFiche(suivant)) {
    return parentCourant;
  }

  // ── ON SE DÉPLACE AU MÊME NIVEAU : d'un mail à l'autre, d'une fiche à l'autre. Le parent est hérité.
  if (aUnFil(courant) && aUnFil(suivant) && courant.ecran === suivant.ecran) return parentCourant;
  if (courant.ecran === 'annuaire' && suivant.ecran === 'annuaire' && aUneFiche(courant) && aUneFiche(suivant)) {
    return parentCourant;
  }
  // Changer d'étiquette, de filtre, d'étoile dans la même liste : on reste au même niveau.
  if (courant.ecran === suivant.ecran && !aUnFil(courant) && !aUnFil(suivant)
    && !aUneFiche(courant) && !aUneFiche(suivant)) {
    return parentCourant;
  }

  // ── ON DESCEND : tout le reste. L'écran qu'on quitte est celui qu'on voudra retrouver.
  return courant;
}

/**
 * ══ ② LE REPLI, QUAND IL N'Y A RIEN DERRIÈRE ════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Ouverture directe par URL (lien collé, nouvel onglet, sans historique dans l'appli) → ← :
 * repli raisonnable sur l'écran parent logique (ex. le dossier du mail), jamais une page vide ni la sortie de
 * l'appli. »
 *
 * 🔴 ON REMONTE D'UN CRAN, JAMAIS À L'ACCUEIL. Le dossier du mail qu'on lisait, la liste de l'annuaire qu'on
 * consultait : l'écran qui CONTIENT ce qu'on regarde, et qui est donc celui qu'on aurait traversé pour y venir.
 */
export function repliDe(courant: EtatEcranUrl): EtatEcranUrl {
  // Un mail ouvert : son dossier, avec son étiquette et ses filtres — exactement ce qui l'entoure.
  if (aUnFil(courant)) return { ...courant, filOuvert: null, messageOuvert: null, brouillonOuvert: null };
  // Une fiche de l'annuaire : la liste de l'annuaire.
  if (courant.ecran === 'annuaire' && aUneFiche(courant)) return { ...courant, fiche: null };
  /**
   * Les écrans qui n'ont rien d'ouvert — l'historique d'une cible, la file à trier, l'annuaire nu, les événements.
   * Leur contenant est le module lui-même : on rend l'écran d'arrivée, jamais une page blanche.
   *
   * ⚠️ `ecran: 'partage'` POUR LA BOÎTE ELLE-MÊME. Sans mail ouvert, la boîte EST l'écran d'arrivée : y « revenir »
   * ne serait pas un retour. On remonte alors d'un cran de plus, vers l'écran partagé, qui la contient.
   */
  if (courant.ecran === 'boite') return { ...ETAT_DEFAUT, ecran: 'partage' };
  return { ...ETAT_DEFAUT };
}

/**
 * ══ ③ RECULER, OU ALLER AU PARENT ? ═════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 RECULER EST TOUJOURS PRÉFÉRABLE QUAND C'EST POSSIBLE, et pour deux raisons que rien d'autre ne donne :
 *   · le navigateur rend la POSITION DE DÉFILEMENT de l'écran qu'on retrouve — exigence d'Arno, et une navigation
 *     « vers l'avant » ne peut que la recalculer de travers ;
 *   · « ← » et le bouton « Précédent » font alors LE MÊME GESTE, donc le même résultat. Autre exigence d'Arno.
 *
 * ⚠️ MAIS PAS QUAND L'ENTRÉE PRÉCÉDENTE N'EST PAS LE PARENT : on est arrivé ici depuis un mail voisin, et reculer
 * rendrait ce mail au lieu de la liste. On va alors droit au parent, en avant.
 */
export type DecisionRetour =
  | { sorte: 'reculer' }
  | { sorte: 'aller'; etat: EtatEcranUrl };

export function decisionRetour(courant: EtatEcranUrl, memoire: MemoireEntree | null): DecisionRetour {
  const m = memoire ?? MEMOIRE_VIDE;
  if (m.parent === null) return { sorte: 'aller', etat: repliDe(courant) };
  if (m.parentEstPrecedent) return { sorte: 'reculer' };
  return { sorte: 'aller', etat: m.parent };
}

/**
 * CE QU'IL FAUT RANGER DANS LA NOUVELLE ENTRÉE D'HISTORIQUE au moment d'aller quelque part. PUR : l'écran se
 * contente de recopier le résultat dans `history.pushState`.
 */
export function memoirePour(
  courant: EtatEcranUrl, suivant: EtatEcranUrl, memoireCourante: MemoireEntree | null,
): MemoireEntree {
  const parent = parentDe(courant, suivant, (memoireCourante ?? MEMOIRE_VIDE).parent);
  return {
    parent,
    // Le parent est l'entrée juste avant SI c'est précisément l'écran qu'on quitte à l'instant.
    parentEstPrecedent: parent !== null && memeEtat(parent, courant),
  };
}

/**
 * LIT une mémoire rangée par le navigateur. TOLÉRANTE : une entrée posée avant ce lot, une entrée d'une autre
 * application, un objet abîmé par un rechargement — tout cela rend « aucune mémoire », donc le repli. Jamais une
 * exception : une flèche de retour qui jette est pire qu'une flèche qui retombe sur le dossier.
 */
export function lireMemoire(brut: unknown): MemoireEntree | null {
  if (brut === null || typeof brut !== 'object') return null;
  const o = brut as { parent?: unknown; parentEstPrecedent?: unknown };
  if (o.parent === null || o.parent === undefined) return null;
  if (typeof o.parent !== 'object') return null;
  const p = o.parent as Partial<EtatEcranUrl>;
  if (typeof p.ecran !== 'string' || typeof p.etiquette !== 'object' || p.etiquette === null) return null;
  return {
    parent: p as EtatEcranUrl,
    parentEstPrecedent: o.parentEstPrecedent === true,
  };
}
