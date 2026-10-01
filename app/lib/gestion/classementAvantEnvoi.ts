/**
 * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — « ENVOYER » EST INACTIF TANT QUE LE MAIL N'EST PAS CLASSÉ. PUR. ═════════════
 *
 * DEMANDE D'ARNO, MOT POUR MOT : « “Envoyer” est inactif tant que le bloc “Classer ce mail” n'est pas une case
 * VERTE (“Interne”, ou “Rattaché” avec au moins un bien). Infobulle et ligne rouge sous le bouton : “Classez ce
 * mail avant de l'envoyer : Rattacher ou Interne.” […] et le serveur la vérifie aussi (refus avec motif). »
 *
 * ═══ 🔴 POURQUOI UN MODULE PUR, ET POURQUOI CELUI-LÀ ════════════════════════════════════════════════════════════
 *
 * La MÊME question est posée à trois endroits qui ne se ressemblent pas : la fenêtre de rédaction (pour griser le
 * bouton), la route d'envoi (pour refuser une requête qui n'est pas passée par l'écran), et le travailleur de la
 * file (qui reprend un envoi différé, parfois des minutes plus tard). Trois réponses écrites trois fois auraient
 * fini par ne plus dire la même chose — et c'est toujours le serveur qui aurait eu raison, au pire moment.
 *
 * ⚠️ AUCUNE E/S, AUCUNE HORLOGE, AUCUN DOM. C'est une DÉCISION : elle doit pouvoir se rejouer sur une table de cas.
 *
 * ═══ 🔴🔴 LES TROIS FAÇONS D'ÊTRE CLASSÉ, ET POURQUOI IL EN FAUT TROIS ══════════════════════════════════════════
 *
 *   · RATTACHÉ      — au moins un BIEN est coché. C'est le cas ordinaire du courrier de gestion.
 *   · INTERNE       — un mot à un collègue : il ne concerne aucun bien, et c'est une réponse, pas une absence.
 *   · HORS GESTION  — ce mail ne concerne aucun bien non plus, mais pour une autre raison (prospection, divers).
 *     🔴 IL N'EST JAMAIS PROPOSÉ À LA MAIN DANS LA FENÊTRE DE RÉDACTION : il n'arrive que par HÉRITAGE, quand on
 *     répond dans une conversation déjà marquée ainsi (demande d'Arno). On ne crée pas un troisième bouton pour
 *     un état qu'on ne choisit pas ici.
 *
 * ⚠️ « À CLASSER » N'EST PAS UN QUATRIÈME ÉTAT : c'est l'ABSENCE des trois, et c'est précisément ce que ce lot
 * refuse désormais de laisser partir.
 */

/** L'état du bloc « Classer ce mail », tel que l'écran le peint et que le serveur le relit. */
export type EtatClassement = 'rien' | 'rattache' | 'interne' | 'hors_gestion';

/** Ce qu'il faut savoir d'un brouillon pour trancher. Volontairement étroit : rien du corps, rien des adresses. */
export interface ClassementBrouillon {
  cibles?: readonly { sorte: string }[] | null;
  interne?: boolean | null;
  horsGestion?: boolean | null;
}

/**
 * L'ÉTAT DU BLOC. PUR.
 *
 * 🔴 L'ORDRE DE PRIORITÉ N'EST PAS DÉCORATIF. Les trois états s'excluent par construction (l'écran lève les biens
 * quand on choisit « Interne », et réciproquement), mais une donnée venue du réseau peut porter les deux. On
 * tranche alors pour le PLUS INFORMATIF : un bien rattaché dit quelque chose du courrier, « interne » dit qu'il
 * n'y a rien à dire. Garder la contradiction, ou refuser, ferait d'un cas impossible une panne visible.
 */
export function etatClassement(b: ClassementBrouillon): EtatClassement {
  if ((b.cibles ?? []).some((c) => c.sorte === 'lot')) return 'rattache';
  if (b.interne === true) return 'interne';
  if (b.horsGestion === true) return 'hors_gestion';
  return 'rien';
}

/** Ce mail est-il classé ? PUR. C'est la seule question que pose le bouton « Envoyer ». */
export function classementFait(b: ClassementBrouillon): boolean {
  return etatClassement(b) !== 'rien';
}

/**
 * 🔴 LA PHRASE D'ARNO, ÉCRITE UNE SEULE FOIS. Infobulle du bouton, ligne rouge sous le bouton, et motif du refus
 * rendu par le serveur : trois endroits, un seul texte. Deux formulations pour le même refus feraient douter qu'il
 * s'agisse du même.
 */
export const MOTIF_NON_CLASSE = 'Classez ce mail avant de l’envoyer : Rattacher ou Interne.';

/**
 * 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — CE QUE DIT LA CARTE « PROPOSITIONS » QUAND ELLE EST VIDE.
 *
 * LA PHRASE EST CELLE D'ARNO, AU MOT PRÈS (01/10/2026). Elle remplace « 0 bien(s) coché(s) sur 0 affiché(s) », un
 * compteur qui ne comptait rien et qui donnait à une fenêtre vide l'air d'une fenêtre pleine : on y cherchait des
 * cases qui n'existaient pas. Une phrase qui dit QUOI FAIRE vaut mieux qu'un nombre qui dit zéro.
 *
 * ⚠️ ELLE VIT ICI, avec les autres phrases du classement, et non dans le composant : c'est la seule façon qu'une
 * épreuve puisse la citer sans la recopier — et une phrase recopiée finit par différer d'un mot.
 */
export const AUCUNE_PROPOSITION = 'Aucune proposition disponible pour ce mail. '
  + 'Utilise le moteur de recherche ci-dessous pour sélectionner le ou les biens en relation avec ce mail.';

/**
 * LE GARDE, CÔTÉ SERVEUR comme côté écran : `null` = rien à redire, sinon le motif à rendre. PUR.
 *
 * ⚠️ IL NE REGARDE QUE CE QUI SERA RÉELLEMENT ÉCRIT (biens, « interne », « hors gestion »), jamais un drapeau que
 * l'écran aurait posé pour lui-même. Un garde qui croit l'appelant sur parole n'est pas un garde.
 */
export function refusSiNonClasse(b: ClassementBrouillon): string | null {
  return classementFait(b) ? null : MOTIF_NON_CLASSE;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'HÉRITAGE — RÉPONDRE DANS UNE CONVERSATION DÉJÀ CLASSÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Réponse / Répondre à tous / Transférer : si la conversation est déjà rattachée, interne ou
   hors gestion, la case est pré-remplie en vert dans le même état (avec Réinitialiser). Sinon, même obligation que
   pour un nouveau message. »

   🔴 POURQUOI C'EST INDISPENSABLE, ET PAS UN CONFORT. Sans cela, le blocage de l'envoi retomberait sur le cas le
   plus fréquent du module — répondre — et obligerait à reclasser à la main un courrier déjà classé. On aurait
   remplacé une file de mails « à classer » par une file de gestes à refaire.

   ⚠️ ON HÉRITE DU MESSAGE AUQUEL ON RÉPOND, pas « de la conversation en général ». Un fil peut porter des
   rattachements différents d'un mail à l'autre ; prendre l'union donnerait à la réponse des biens dont le message
   qu'on a sous les yeux ne parle pas. « Interne », lui, porte sur l'ÉCHANGE (migration 281) : c'est le seul des
   trois qui se lise au niveau du fil, et c'est voulu. */

/** Ce qu'on sait de la conversation au moment d'ouvrir la fenêtre. Tout est facultatif : on hérite de ce qu'on a. */
export interface ConversationClassee {
  /** Les biens rattachés AU MESSAGE auquel on répond (liens vivants, cible de sorte `lot`). */
  biens?: readonly { sorte: string; cle: string | null; id: number | null; libelle: string }[] | null;
  /** L'ÉCHANGE est-il marqué « interne » ? `null` = on ne sait pas (migration 281 absente, lecture en échec). */
  filInterne?: boolean | null;
  /** LE MESSAGE auquel on répond est-il marqué « hors gestion » ? `null` = on ne sait pas. */
  messageHorsGestion?: boolean | null;
}

/** Le classement pré-rempli d'une réponse. PUR. Vide partout ⇒ la case reste aux deux boutons. */
export interface ClassementHerite {
  cibles: { sorte: 'lot'; cle: string | null; id: number | null; libelle: string }[];
  interne: boolean;
  horsGestion: boolean;
}

/**
 * CE DONT UNE RÉPONSE HÉRITE. PUR.
 *
 * 🔴 UN SEUL DES TROIS, JAMAIS DEUX. Le bloc « Classer ce mail » ne montre qu'une case verte : lui en donner deux
 * états à la fois enregistrerait une contradiction (c'est la règle du lot CLASSER-DEUX-BOUTONS). L'ordre est celui
 * de `etatClassement`, pour que l'héritage et la relecture disent toujours la même chose.
 *
 * ⚠️ UN BIEN SANS LIBELLÉ N'EST PAS HÉRITÉ : il s'afficherait comme une ligne vide sous la case verte, et serait
 * reposé tel quel à l'envoi. Mieux vaut demander le geste que recopier un trou.
 */
export function classementHerite(c: ConversationClassee): ClassementHerite {
  const vide: ClassementHerite = { cibles: [], interne: false, horsGestion: false };
  const vus = new Set<string>();
  const biens = (c.biens ?? [])
    .filter((b) => b.sorte === 'lot' && (b.libelle ?? '').trim() !== '')
    .map((b) => ({ sorte: 'lot' as const, cle: b.cle ?? null, id: b.id ?? null, libelle: b.libelle.trim() }))
    .filter((b) => {
      const k = `${b.cle ?? ''}|${b.id ?? 0}`;
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  if (biens.length > 0) return { ...vide, cibles: biens };
  if (c.filInterne === true) return { ...vide, interne: true };
  if (c.messageHorsGestion === true) return { ...vide, horsGestion: true };
  return vide;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'ANIMATION « D — ÉLASTIQUE », VALIDÉE PAR ARNO — SES DURÉES, ÉCRITES UNE SEULE FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO, AU MILLISECONDE PRÈS :
     · la case choisie passe de la MOITIÉ à TOUTE LA LARGEUR en 300 ms, easing cubic-bezier(.34,1.56,.64,1)
       (léger dépassement) ;
     · l'AUTRE case s'efface en 180 ms ;
     · puis un rebond simple de 260 ms, ease-out, sur l'échelle : 1 -> 1.04 -> 0.986 -> 1 ;
     · total environ 560 ms.

   🔴 POURQUOI DES CONSTANTES, ET NON DES CHIFFRES DANS LA FEUILLE DE STYLE. Le composant doit savoir QUAND
   l'animation est finie (pour retirer sa classe), et la feuille de style doit savoir COMBIEN DE TEMPS elle dure.
   Deux chiffres écrits séparément finissent par diverger d'une dizaine de millisecondes, et la case reste figée
   dans son état d'arrivée — un défaut qu'on ne voit qu'une fois sur dix.

   ⚠️ IDENTIQUE DANS LES DEUX SENS. « Interne » étend vers la GAUCHE, « Rattaché » vers la DROITE : seule l'origine
   de la transformation change, jamais les durées. */

/** De la moitié à toute la largeur. */
export const ANIM_ETENDRE_MS = 300;
/** L'autre case s'efface pendant ce temps-là, en même temps. */
export const ANIM_EFFACER_MS = 180;
/** Le rebond, APRÈS l'extension. */
export const ANIM_REBOND_MS = 260;
/** Le dépassement demandé par Arno : léger, et il n'est écrit qu'ici. */
export const ANIM_COURBE_ELASTIQUE = 'cubic-bezier(.34,1.56,.64,1)';
/** Ce que dure le geste entier — c'est ce délai que le composant attend avant de retirer sa classe. */
export const ANIM_TOTAL_MS = ANIM_ETENDRE_MS + ANIM_REBOND_MS;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — L'AUTRE SENS : LA SCISSION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (01/10/2026) : « Ajoute l'animation inverse, quand le gros bouton vert se scinde en Rattacher
   (rouge) et Interne (blanc). Mouvement miroir de D : le vert “Rattaché” se rétracte vers la moitié GAUCHE et
   redevient le bouton rouge ; le vert “Interne” se rétracte vers la moitié DROITE et redevient le bouton blanc ;
   l'autre bouton réapparaît en fondu ; même courbe, mêmes durées, petit rebond final sur les deux boutons.
   Passage direct de Rattaché à Interne (ou l'inverse) : scission, puis réunion du côté de l'autre bouton. »

   ═══ 🔴🔴 L'INVENTAIRE DES CHEMINS, ET POURQUOI IL N'Y A RIEN À ÉNUMÉRER DANS LE CODE ══════════════════════════

   Arno demande l'inventaire de TOUS les chemins qui ramènent un mail à « À classer ». Les voici, mesurés dans le
   module le 01/10/2026 :
     ① décocher le dernier bien dans la modale, puis « Valider — aucun bien » ;
     ② cliquer la case verte « Interne » (elle est un bouton : un clic la défait) ;
     ③ cliquer la case verte « Hors gestion » ;
     ④ « Annuler » / « Retirer » un rattachement depuis le bloc gris ou la fiche ;
     ⑤ retirer le dernier bien par le bloc « Suivi dans la conversation » (une période qui ne porte plus rien) ;
     ⑥ un mail dont le classement hérité disparaît quand la conversation change d'avis.

   🔴 ET ILS PASSENT TOUS PAR LE MÊME ENTONNOIR : `etatClassement`. L'animation ne se branche donc sur AUCUN d'eux
   en particulier — elle observe la TRANSITION d'état, qui est la seule chose que ces six chemins ont en commun.
   Les brancher un par un aurait demandé six signaux depuis six endroits, et le septième chemin — celui qu'on
   ajoutera dans six mois — serait né sans animation, sans que personne le remarque.

   ⚠️ C'EST AUSSI CE QUI INTERDIT LA DOUBLE ANIMATION. Un rafraîchissement de la liste qui rend le MÊME état ne
   produit aucune étape : `etapesAnimation` rend une liste VIDE, et le composant ne touche pas à sa file.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les deux sens du mouvement. `reunion` = deux boutons → une case verte ; `scission` = l'inverse. */
export type GesteAnimation = 'reunion' | 'scission';

export interface EtapeAnimation {
  geste: GesteAnimation;
  /**
   * LA CASE VERTE CONCERNÉE — celle qui naît (réunion) ou celle qui s'en va (scission). C'est elle qui décide du
   * CÔTÉ : « Rattaché » tient la moitié gauche (le bouton rouge), « Interne » et « Hors gestion » la droite.
   */
  etat: Exclude<EtatClassement, 'rien'>;
}

/**
 * 🔴 CE QU'IL FAUT JOUER POUR PASSER DE `avant` À `apres`. PUR.
 *
 * ⚠️ UN PASSAGE DIRECT ENTRE DEUX CASES VERTES FAIT DEUX ÉTAPES, dans cet ordre : la scission de l'ancienne, puis
 * la réunion de la nouvelle. C'est la demande d'Arno au mot près, et c'est aussi la seule lecture honnête du
 * geste — on ne glisse pas d'un classement à l'autre, on en défait un et on en pose un autre.
 */
export function etapesAnimation(avant: EtatClassement, apres: EtatClassement): EtapeAnimation[] {
  if (avant === apres) return [];
  const etapes: EtapeAnimation[] = [];
  if (avant !== 'rien') etapes.push({ geste: 'scission', etat: avant });
  if (apres !== 'rien') etapes.push({ geste: 'reunion', etat: apres });
  return etapes;
}

/**
 * DE QUEL CÔTÉ LA CASE VERTE VIT. PUR.
 *
 * « Rattaché » vient du bouton ROUGE, qui est à GAUCHE ; « Interne » du bouton BLANC, à DROITE. « Hors gestion »
 * suit « Interne » : il se pose par le même chemin (le lien de la modale) et n'a pas de bouton à lui.
 */
export function coteDeLaCase(e: Exclude<EtatClassement, 'rien'>): 'gauche' | 'droite' {
  return e === 'rattache' ? 'gauche' : 'droite';
}
