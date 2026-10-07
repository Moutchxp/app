/**
 * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LES MOTS DU « BROUILLON EN ATTENTE ». Module PUR. ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « PICTO “BROUILLON EN ATTENTE” (un petit crayon ou une feuille, aria-label et bulle
 * “Brouillon de réponse en attente”) : sur la ligne du listing de la Réception et des autres dossiers, juste à
 * GAUCHE du bloc trombone / nombre / statut ; sur la ligne du mail concerné dans la liste des mails d'une
 * conversation ; en haut du mail ouvert, une mention “Brouillon de réponse en attente — voir en bas” qui fait
 * défiler jusqu'à la zone de réponse. »
 *
 * 🔴 TROIS ENDROITS, UN SEUL VOCABULAIRE. Trois chaînes écrites à trois endroits auraient fini par se contredire —
 * et c'est le texte le plus rassurant qu'on aurait cru. Elles vivent donc ici, et les trois écrans les lisent.
 *
 * ⚠️ LE PICTO N'EST JAMAIS SEUL À PORTER L'INFORMATION : il a un `aria-label` et une bulle, et là où la place le
 * permet le MOT « Brouillon » reste à côté. Un crayon seul ne se lit ni en niveaux de gris, ni au lecteur d'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le picto lui-même. Un crayon : c'est le geste d'écrire, pas celui de ranger. */
export const PICTO_BROUILLON = '✎';

/** Le nom du picto, pour la bulle et pour les lecteurs d'écran. Mot pour mot la demande d'Arno. */
export const AIDE_BROUILLON_EN_ATTENTE = 'Brouillon de réponse en attente';

/**
 * LA MENTION EN HAUT DU MAIL OUVERT, et ce qu'elle promet.
 *
 * ⚠️ « VOIR EN BAS » EST UNE PROMESSE QUE L'ÉCRAN TIENT : le clic fait défiler jusqu'à la zone de réponse. Une
 * mention qui dirait où regarder sans y emmener ferait chercher.
 */
export const MENTION_BROUILLON_VOIR_EN_BAS = 'Brouillon de réponse en attente — voir en bas';

/**
 * ══ 🔴🔴 LOT BROUILLON-ACCES-SUPPRESSION, POINT 1 — LA PASTILLE OUVRE LE BROUILLON ══════════════════════════════
 *
 * RÈGLE D'ARNO (07/10/2026) : « Au clic, le brouillon s'ouvre, déplié, sous le mail concerné, dans l'éditeur de
 * réponse habituel avec son contenu déjà enregistré. La page défile pour le centrer à l'écran, et le curseur est
 * placé dans le texte. La petite mention “✎ Brouillon” sous l'objet du message fait la même chose au clic. »
 *
 * 🔴 LA CAUSE DU CLIC MORT, ÉCRITE ICI PARCE QUE C'EST ICI QUE LA PROMESSE EST FAITE. La pastille ne faisait QUE
 * défiler vers le pied du message — et ce pied est VIDE tant que l'éditeur n'a pas été monté. Arrivé par une
 * adresse qui désigne le mail (`?fil=…&message=…`), le mail est déplié d'office, SANS passer par le geste qui
 * rouvre le brouillon : il n'y avait donc rien sous le message, et le défilement visait un bloc de zéro pixel.
 *
 * 🔴 « VOIR EN BAS » DEVIENT DONC « OUVRIR », et la mention le dit : une pastille qui emmène vers un endroit vide
 * est pire qu'une pastille muette — on croit avoir mal cliqué, puis on doute de l'écran.
 */
export const AIDE_OUVRIR_BROUILLON = 'Ouvrir le brouillon de réponse';

/**
 * ══ 🔴🔴 LOT BROUILLON-ACCES-SUPPRESSION, POINT 2 — SUPPRIMER DÉFINITIVEMENT UN BROUILLON ═══════════════════════
 *
 * RÈGLE D'ARNO (07/10/2026) : « Un bouton “Supprimer le brouillon”, à côté des boutons existants (sans en retirer
 * aucun). Au clic, une confirmation : “Supprimer définitivement ce brouillon ?” avec Annuler et Supprimer. »
 *
 * 🔴 CE N'EST PAS LE GESTE DE LA CORBEILLE, et les deux restent côte à côte. La corbeille de la barre du bas MET À LA
 * CORBEILLE (`motsJeterBrouillon`) : la ligne est datée, elle se réintègre. Celui-ci SUPPRIME — la ligne quitte la
 * base. Deux gestes, deux mots, aucune ambiguïté : « définitivement » n'apparaît que sur celui qui l'est.
 */
export const MOTS_SUPPRIMER_BROUILLON = {
  /** Le libellé du bouton, mot pour mot la demande d'Arno. */
  bouton: 'Supprimer le brouillon',
  /** La question de la confirmation, mot pour mot. */
  question: 'Supprimer définitivement ce brouillon ?',
  /** Le mot qui renonce. */
  annuler: 'Annuler',
  /** Le mot qui confirme. */
  confirmer: 'Supprimer',
} as const;

/**
 * ══ 🔴🔴 LE SORT DU BROUILLON DANS GMAIL, ET POURQUOI IL A TROIS VALEURS ════════════════════════════════════════
 *
 * Arno demande la suppression « en base et dans Gmail (le même chemin que celui qui l'a créé/mis à jour) ». Ce
 * chemin-là est `enregistrerBrouillon`, et il n'écrit QUE dans notre table : `gestion_brouillon` ne porte aucun
 * identifiant Google, et rien n'a jamais été poussé chez eux (décision d'Arno du 29/09/2026, écrite en toutes
 * lettres dans `abandonnerBrouillon`). Il n'y a donc, aujourd'hui, RIEN à supprimer dans Gmail.
 *
 * 🔴 ALORS ON LE DIT AU LIEU DE L'INVENTER. `sans_objet` est une réponse, pas un échec déguisé en succès : le
 * brouillon n'existe pas chez Google, il n'avait pas à y être supprimé. Le jour où la synchronisation
 * (`drafts.create/update/delete`) arrivera, elle rendra `supprime` ou `echec` par cette MÊME porte — et l'écran
 * n'aura pas une ligne à changer.
 *
 * ⚠️ `echec` N'EST PAS UNE VARIANTE DE `supprime` : il garde le brouillon, en base ET à l'écran. Supprimer chez
 * nous ce qui reste chez Google ferait réapparaître le brouillon à la relève suivante, sans son contexte.
 */
export type SortGmailBrouillon = 'sans_objet' | 'supprime' | 'echec';

/** Ce que l'écran fait d'une tentative de suppression : ce qu'il dit, et s'il garde le brouillon sous les yeux. */
export interface SuiteSuppressionBrouillon {
  /** La phrase montrée à l'écran. Jamais vide : un geste sans compte rendu se refait. */
  phrase: string;
  /** Le brouillon reste-t-il affiché ? `true` ⇒ rien n'a été supprimé, on peut réessayer. */
  garderAffiche: boolean;
}

/**
 * 🔴 LA SUITE DU GESTE, DÉCIDÉE ICI ET NULLE PART AILLEURS. Arno : « Si la suppression dans Gmail échoue,
 * afficher “Brouillon non supprimé dans Gmail, réessayer” et garder le brouillon affiché. » PUR.
 *
 * ⚠️ LA PHRASE DE L'ÉCHEC EST CELLE D'ARNO, AU MOT : c'est elle qui dit quoi faire (« réessayer »), et c'est tout
 * ce qu'on attend d'un message d'erreur.
 */
export function suiteSuppressionBrouillon(sort: SortGmailBrouillon): SuiteSuppressionBrouillon {
  if (sort === 'echec') {
    return { phrase: 'Brouillon non supprimé dans Gmail, réessayer', garderAffiche: true };
  }
  return { phrase: 'Brouillon supprimé définitivement.', garderAffiche: false };
}

/**
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LA GRANDE CORBEILLE D'UN MESSAGE ═══════════════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « aria-label et bulle “Mettre ce message à la corbeille” ».
 *
 * 🔴 « CE MESSAGE », ET NON « CET ÉCHANGE ». C'est toute la différence avec la corbeille d'une ligne de liste, et
 * une corbeille dessinée ne dit pas ce qu'elle jette : le mot, lui, le dit. Un seul endroit l'écrit, pour que la
 * bulle et le lecteur d'écran ne puissent pas diverger.
 */
export const AIDE_CORBEILLE_MESSAGE = 'Mettre ce message à la corbeille';

/** Le bandeau qui suit le geste, et qui le défait. Quelques secondes, puis il s'efface de lui-même. */
export const BANDEAU_MESSAGE_CORBEILLE = 'Message mis à la corbeille';

/**
 * Combien de temps le bandeau reste. « Quelques secondes » (Arno) : dix, le temps de lire la phrase et d'atteindre
 * « Annuler » sans se presser — et c'est déjà le délai du bandeau de l'éditeur. Un seul rythme dans tout le module.
 */
export const DELAI_BANDEAU_CORBEILLE_MS = 10_000;
