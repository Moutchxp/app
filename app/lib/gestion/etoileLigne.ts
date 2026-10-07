import { dateHeureComplete } from './ecran';

/**
 * ══ 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — CE QUE L'ÉTOILE D'UNE LIGNE DIT, ET DE QUEL MAIL ══════════════════════════
 *
 * Module PUR : aucune I/O, aucun React, aucun `pg`. Il est donc lisible des DEUX côtés — le serveur qui compose les
 * lignes (`boiteRepo`, `rechercheBoite`) et l'écran qui les met à jour après un clic (`BoiteMail`, `BarreLigne`).
 * C'est tout l'objet du lot : **une seule écriture de la règle**, et non deux qui finiraient par diverger.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fil 383 « Fenêtre cassée ») : la ligne de la Réception affiche une étoile rouge
 * PLEINE. On ouvre la conversation : le mail que la ligne montre (houda ghannam, 06/10 17:26) n'a AUCUNE étoile.
 * Elle est sur un autre mail du même échange (didier.caussanel, 24 sept. 21:08).
 *
 * 🔴 LA CAUSE : la ligne disait « au moins un mail de l'échange est étoilé » (`boiteRepo.sqlEtoile`). C'est la règle
 * de Gmail pour le FILTRE — et elle RESTE celle du filtre, qui doit faire remonter l'échange entier. Mais affichée
 * sur la LIGNE, elle promet quelque chose que le mail montré ne tient pas.
 *
 * ═══ 🔴 RÈGLE D'ARNO — TROIS ÉTATS, ET AUCUN N'EST MÉMORISÉ ════════════════════════════════════════════════════
 *
 *   ① PLEINE — le mail AFFICHÉ par la ligne est lui-même étoilé ;
 *   ② CREUSE — le mail affiché ne l'est pas, mais un AUTRE mail de la conversation l'est ;
 *   ③ AUCUNE — aucun mail de la conversation n'est étoilé.
 *
 * 🔴 C'EST UN CALCUL, PAS UN ÉTAT. Rien n'est écrit en base pour « creuse » : elle apparaît et disparaît toute
 * seule dès que la liste des mails étoilés change. Mémoriser le troisième état aurait créé une vérité de plus à
 * tenir d'accord avec les deux autres — exactement ce qui a produit le défaut qu'on répare.
 *
 * ⚠️ « LE MAIL AFFICHÉ PAR LA LIGNE » N'EST PAS REDÉFINI ICI : c'est `LigneBoite.messageAffiche`, la règle du lot
 * MESSAGE-CLIQUÉ (sous Réception le dernier message REÇU, sous Envoyés le dernier ENVOYÉ, ailleurs le dernier de
 * l'échange). On la REÇOIT, on ne la rejoue pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Un mail étoilé d'un échange, tel que la ligne a besoin de le connaître : de quoi se situer (l'identifiant) et de
 * quoi se NOMMER dans la bulle d'aide (l'expéditeur, la date).
 */
export interface MailEtoile {
  messageId: number;
  de: string;
  deNom: string | null;
  /** Date ISO, telle que la base et la conversation la rendent déjà. */
  recuLe: string;
}

/**
 * ══ 🔴🔴 LES **DEUX** INFORMATIONS, ET PAS UNE DE PLUS ═══════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « une seule source de calcul pour les deux informations (étoile du mail affiché / étoile
 * ailleurs dans l'échange), à la place du booléen unique ». Les voici, et le dessin se DÉDUIT des deux
 * (`sorteEtoileLigne`) — il n'est jamais rangé à côté.
 *
 * 🔴 `ailleurs` VOYAGE AUSSI QUAND LE MAIL AFFICHÉ EST ÉTOILÉ, et ce n'est pas du zèle : c'est ce qui permet à une
 * ligne PLEINE de redevenir CREUSE quand on lui retire son étoile alors qu'un autre mail garde la sienne. Sans
 * cette information, l'écran devrait deviner — ou relire.
 */
export interface EtatEtoileLigne {
  /** Le mail AFFICHÉ par la ligne porte-t-il l'étoile ? C'est lui, et lui seul, que le clic touche. */
  duMessage: boolean;
  /** Le mail étoilé le plus récent qui n'est PAS celui affiché. `null` = il n'y en a aucun. */
  ailleurs: MailEtoile | null;
}

export const ETOILE_LIGNE_VIDE: EtatEtoileLigne = { duMessage: false, ailleurs: null };

/** Ce que la ligne DESSINE. Déduit, jamais rangé : trois mots pour deux booléens, et aucun état impossible. */
export function sorteEtoileLigne(etat: EtatEtoileLigne): 'pleine' | 'creuse' | 'aucune' {
  if (etat.duMessage) return 'pleine';
  return etat.ailleurs === null ? 'aucune' : 'creuse';
}

/**
 * LE CALCUL, ET IL EST LE SEUL. `etoiles` = les mails étoilés de la conversation, dans n'importe quel ordre.
 *
 * 🔴 L'AUTRE MAIL RETENU EST LE PLUS RÉCENT, et l'ordre est TOTAL (date, puis identifiant) : deux mails reçus à la
 * même seconde existent, et la bulle ne doit pas nommer l'un ou l'autre selon l'humeur de la requête.
 */
export function etoileDeLaLigne(
  etoiles: readonly MailEtoile[], messageAffiche: number,
): EtatEtoileLigne {
  const autres = etoiles.filter((m) => m.messageId !== messageAffiche);
  const ailleurs = autres.length === 0 ? null : [...autres].sort((a, b) => (a.recuLe === b.recuLe
    ? b.messageId - a.messageId
    : (a.recuLe < b.recuLe ? 1 : -1)))[0];
  return { duMessage: etoiles.some((m) => m.messageId === messageAffiche), ailleurs };
}

/** Le nom qu'on donne à un expéditeur dans la bulle. Le nom s'il y en a un, l'adresse sinon — jamais les deux. */
export function nomDuMailEtoile(m: MailEtoile): string {
  const nom = m.deNom?.trim();
  return nom ? nom : m.de;
}

/**
 * LA BULLE D'AIDE DE L'ÉTOILE. Demande d'Arno, mot pour mot pour le cas « creuse » : « Un autre message de cette
 * conversation est étoilé (expéditeur, date) ».
 *
 * ⚠️ « AUCUNE » REND UNE CHAÎNE VIDE, et non une phrase : il n'y a alors pas d'étoile à survoler. Rendre un texte
 * aurait invité à dessiner une étoile pour le porter.
 *
 * ⚠️ UNE LIGNE PLEINE NE NOMME PAS L'AUTRE MAIL, même quand il y en a un : l'étoile qu'on survole est celle du mail
 * montré, et c'est d'elle qu'on veut savoir quelque chose. Le reste de la conversation s'ouvre d'un clic.
 */
export function bulleEtoileLigne(etat: EtatEtoileLigne): string {
  const sorte = sorteEtoileLigne(etat);
  if (sorte === 'pleine') return 'Ce message est étoilé.';
  if (sorte === 'aucune' || etat.ailleurs === null) return '';
  return 'Un autre message de cette conversation est étoilé '
    + `(${nomDuMailEtoile(etat.ailleurs)}, ${dateHeureComplete(etat.ailleurs.recuLe)}).`;
}

/**
 * ══ 🔴🔴 CE QUE LE CLIC FAIT, ET SUR QUOI ═══════════════════════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO : « on agit UNIQUEMENT sur le mail affiché par la ligne (pleine → vide, vide ou creuse → pleine),
 * jamais sur un autre mail de l'échange ». Donc : tout ce qui n'est pas « pleine » se clique pour POSER.
 *
 * 🔴 LE CAS QUI MOTIVE CETTE FONCTION, C'EST « CREUSE ». Dessinée en contour, elle ressemble à une étoile éteinte,
 * et l'ancien `!etat.etoilee` l'aurait lue comme « l'échange est étoilé, donc on retire » — c'est-à-dire qu'il
 * aurait décroché l'étoile d'un mail qu'on ne regardait même pas.
 */
export function clicPoseLEtoile(etat: EtatEtoileLigne): boolean {
  return !etat.duMessage;
}

/**
 * ══ 🔴🔴 L'ÉTAT DE LA LIGNE APRÈS UN SIGNAL D'ÉTOILE ════════════════════════════════════════════════════════════
 *
 * Même règle que ci-dessus, appliquée à ce qu'un geste vient d'annoncer (voir `signalEtoile`). Elle vit ici, et non
 * dans l'écran, pour que la liste affiche APRÈS UN CLIC exactement ce que le serveur lui aurait rendu.
 *
 * 🔴 TROIS CAS, DU PLUS SÛR AU MOINS SÛR :
 *   ① L'ÉMETTEUR CONNAÎT TOUS LES MAILS ÉTOILÉS (`etoiles`) — c'est la conversation ouverte, qui les tient. On
 *      recalcule tout : c'est le cas qui fait disparaître une « creuse » quand on retire l'étoile de l'autre mail.
 *   ② IL NE CONNAÎT QUE LE MAIL QU'IL A TOUCHÉ, ET C'EST CELUI DE LA LIGNE : son étoile change, et ce qui se passe
 *      ailleurs dans l'échange n'a pas bougé — on le garde tel quel. C'est le clic sur la ligne elle-même, et c'est
 *      ce qui fait qu'une ligne PLEINE redevient CREUSE plutôt que de s'éteindre.
 *   ③ LE GESTE A PORTÉ SUR L'ÉCHANGE ENTIER (`messageId: null`) — c'est la porte d'avant la migration 277, où
 *      l'étoile EST celle de l'échange et où la question « quel mail ? » n'existe pas. On la traite comme telle :
 *      l'échange s'allume ou s'éteint, et l'éteindre efface aussi ce qui était ailleurs (cette porte retire
 *      l'étoile de TOUS les messages du fil). C'est exactement le comportement d'avant ce lot.
 *   ④ ON NE SAIT PAS (le mail touché n'est pas celui que cette ligne affiche) : la ligne GARDE son état, et la
 *      relecture suivante la remet droite. Deviner éteindrait une ligne encore étoilée — ou l'inverse.
 */
export function etoileLigneApresSignal(
  avant: EtatEtoileLigne,
  messageAffiche: number,
  signal: { messageId: number | null; etoilee: boolean; etoiles: readonly MailEtoile[] | null },
): EtatEtoileLigne {
  if (signal.etoiles !== null) return etoileDeLaLigne(signal.etoiles, messageAffiche);
  if (signal.messageId === null) {
    return { duMessage: signal.etoilee, ailleurs: signal.etoilee ? avant.ailleurs : null };
  }
  if (signal.messageId !== messageAffiche) return avant;
  return { duMessage: signal.etoilee, ailleurs: avant.ailleurs };
}
