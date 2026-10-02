/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — UNE CONVERSATION CHANGE DE SUJET, ET SON CLASSEMENT AVEC. PUR. ══════════════
 *
 * RÈGLES D'ARNO (01/10/2026), validées : « Une conversation peut changer de sujet. Son classement (biens
 * rattachés, Interne, Hors gestion) se découpe en PÉRIODES successives. Chaque mail retient la règle sous
 * laquelle il a été classé, et alimente l'historique des biens de SA période. Un changement en cours de route
 * n'efface jamais le passé (sauf “Toute la conversation”). »
 *
 * ═══ 🔴🔴 LE MODÈLE, EN TROIS OBJETS ET PAS UN DE PLUS ══════════════════════════════════════════════════════════
 *
 *   · UNE PÉRIODE commence à un mail (inclus) et court jusqu'au mail qui ouvre la suivante, ou jusqu'à la fin de
 *     la conversation. Elle porte UN classement : des biens, « interne », ou « hors gestion ».
 *   · UNE EXCEPTION porte sur UN mail et sur lui seul. Elle ne déplace aucune période : le mail suivant reprend
 *     la règle d'avant. C'est le « Ce mail uniquement » d'Arno.
 *   · LA PROJECTION dit, pour chaque mail, le classement qui s'applique : son exception s'il en a une, sinon la
 *     période en cours à sa date.
 *
 * 🔴 POURQUOI LA PROJECTION EST LE CŒUR, et non une commodité d'affichage. Tout le reste de l'application lit le
 * classement d'un MAIL — la capsule de la liste, l'historique d'un bien, les compteurs, l'arbre du Drive. En
 * projetant les périodes sur les mails, on répond à la demande d'Arno « un mail est dans l'historique d'un bien
 * si sa période ou son exception contient ce bien » SANS toucher à une seule de ces lectures. La période décide,
 * le mail porte — et ce qui lit le mail n'a rien à apprendre.
 *
 * ⚠️ L'ORDRE DES MAILS EST CELUI DE LA CONVERSATION, pas celui des identifiants. Un mail capturé en retard porte
 * un identifiant plus grand mais une date antérieure ; ranger par identifiant placerait une période au mauvais
 * endroit. L'appelant donne donc les mails DÉJÀ TRIÉS, et ce module ne les retrie pas — il n'a pas les dates.
 *
 * ⚠️ AUCUNE E/S, AUCUNE HORLOGE : c'est une DÉCISION, et elle doit se rejouer sur le scénario d'Arno, à la main.
 */

/** Ce qu'une période ou une exception peut porter. Les trois réponses du bloc « Classer ce mail ». */
export type SorteClassement = 'biens' | 'interne' | 'hors_gestion';

/** Un bien, réduit à ce qui l'identifie et à ce qui le nomme. */
export interface BienClasse {
  cle: string;
  libelle: string;
}

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — UNE PERSONNE DU DOSSIER QUE LA FENÊTRE PORTE AUSSI ═══════════════════════════
 *
 * Demande d'Arno : « “Suivi automatique” ouvre une fenêtre (même mécanisme que “Ce mail et la conversation à
 * venir”) qui porte le(s) bien(s) ET les relations aux personnes. »
 *
 * ⚠️ `role` N'EST PAS ICI, ET C'EST LE POINT. Le rôle instantané est RECALCULÉ à la date de CHAQUE mail que la
 * fenêtre couvre (« rôle instantané recalculé à la date de chaque mail », Arno). Le figer dans la fenêtre
 * donnerait à un mail de mars le rôle calculé en janvier — exactement ce que l'instantané doit éviter.
 */
export interface PersonneClassee {
  sorte: 'proprietaire' | 'locataire';
  /** La CLÉ de la carte : `wippimmo_id` pour un propriétaire, `cle_personne` pour un locataire. */
  cle: string;
  libelle: string;
  /** Le contact externe par qui le mail est passé. `null` = aucun n'a été mémorisé, ce qui est permis. */
  contactExterneId?: number | null;
}

/** Le classement porté par une période ou une exception. */
export interface Classement {
  sorte: SorteClassement;
  /** Les biens, quand `sorte === 'biens'`. Vide pour les deux autres sortes. */
  biens: readonly BienClasse[];
  /**
   * 🔴 LOT CONTACTS-EXTERNES — LES PERSONNES DU DOSSIER QUE CE CLASSEMENT CONCERNE AUSSI. FACULTATIF, et absent
   * de l'immense majorité des classements : un mail ordinaire n'a pas d'intermédiaire.
   *
   * ⚠️ ELLES NE REMPLACENT JAMAIS LES BIENS, elles s'y ajoutent (règle n° 1 du lot). Un classement qui porterait
   * des personnes SANS bien serait refusé par la base (migration 293) — et il n'a pas de sens : une intervention
   * est « ce mail, rattaché à ce logement, concerne aussi cette personne ».
   *
   * ⚠️ CHAMP OPTIONNEL, ET DÉLIBÉRÉMENT : tout le code écrit avant ce lot construit des `Classement` sans lui, et
   * doit continuer de compiler et de se comporter à l'identique. `undefined` et `[]` veulent dire la même chose.
   */
  personnes?: readonly PersonneClassee[];
}

/** Une période : elle commence à un mail, et court jusqu'à la suivante. */
export interface Periode {
  id: number;
  /** Le mail À PARTIR DUQUEL elle s'applique, celui-ci compris. */
  depuisMessageId: number;
  classement: Classement;
  /** Qui l'a décidée, et quand — pour le repère affiché dans le fil. */
  parLibelle?: string | null;
  le?: string | null;
}

/** Une exception : elle porte sur UN mail, et ne déplace aucune période. */
export interface ExceptionMail {
  messageId: number;
  classement: Classement;
  parLibelle?: string | null;
  le?: string | null;
}

/** Les trois choix du bloc « Suivi dans la conversation », dans l'ordre d'Arno. */
export type ChoixSuivi = 'mail' | 'suite' | 'conversation';

/** Le choix coché d'avance : « Ce mail et la conversation à venir » (demande d'Arno). */
export const SUIVI_DEFAUT: ChoixSuivi = 'suite';

/** Un classement vide, qui ne classe rien. Écrit une fois : trois endroits le comparent. */
export const SANS_CLASSEMENT: Classement = { sorte: 'biens', biens: [] };

export function classementVide(c: Classement): boolean {
  return c.sorte === 'biens' && c.biens.length === 0;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA PROJECTION — QUEL CLASSEMENT S'APPLIQUE À QUEL MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE CLASSEMENT EFFECTIF DE CHAQUE MAIL. PUR.
 *
 * 🔴 L'EXCEPTION L'EMPORTE SUR LA PÉRIODE, et c'est toute sa définition : « Ce mail seul est classé ainsi. La
 * période en cours ne change pas : le mail suivant reprend la règle d'avant. »
 *
 * ⚠️ UN MAIL ANTÉRIEUR À TOUTE PÉRIODE N'EST PAS CLASSÉ. C'est le cas d'une conversation dont le classement n'a
 * commencé qu'au troisième mail : les deux premiers restent « à classer », et c'est la vérité — leur inventer
 * un classement rétroactif serait exactement ce que « un changement n'efface jamais le passé » interdit.
 */
export function projeter(
  mails: readonly number[],
  periodes: readonly Periode[],
  exceptions: readonly ExceptionMail[],
): Map<number, Classement> {
  const parMail = new Map<number, Classement>();
  const exceptionDe = new Map(exceptions.map((e) => [e.messageId, e.classement]));
  // ⚠️ LES PÉRIODES SONT LUES DANS L'ORDRE DES MAILS, jamais dans celui de leur création : c'est la position de
  //   `depuisMessageId` dans la conversation qui décide, et elle seule.
  const rang = new Map(mails.map((m, i) => [m, i]));
  const ouvertes = [...periodes]
    .filter((p) => rang.has(p.depuisMessageId))
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number));

  let courante: Classement | null = null;
  let i = 0;
  for (const m of mails) {
    while (i < ouvertes.length && ouvertes[i].depuisMessageId === m) {
      courante = ouvertes[i].classement;
      i += 1;
    }
    const exception = exceptionDe.get(m);
    if (exception !== undefined) { parMail.set(m, exception); continue; }
    if (courante !== null) parMail.set(m, courante);
  }
  return parMail;
}

/**
 * LES MAILS DE L'HISTORIQUE D'UN BIEN. PUR.
 *
 * Demande d'Arno : « un mail est dans l'historique d'un bien si sa période ou son exception contient ce bien ».
 * C'est exactement la projection, lue dans l'autre sens.
 */
export function mailsDuBien(
  mails: readonly number[], periodes: readonly Periode[], exceptions: readonly ExceptionMail[], cle: string,
): number[] {
  const parMail = projeter(mails, periodes, exceptions);
  return mails.filter((m) => {
    const c = parMail.get(m);
    return c !== undefined && c.sorte === 'biens' && c.biens.some((b) => b.cle === cle);
  });
}

/**
 * LA PÉRIODE EN COURS À LA FIN DE LA CONVERSATION — celle dont héritera le prochain mail. PUR.
 *
 * Demande d'Arno (point 3) : « Un nouveau mail d'une conversation hérite automatiquement de la période EN COURS
 * (la dernière ouverte), jamais d'une exception. »
 *
 * 🔴 « JAMAIS D'UNE EXCEPTION » EST LA MOITIÉ QUI COMPTE. Une exception dit « ce mail-là, et pas les autres » :
 * la propager au suivant la transformerait en période, c'est-à-dire en l'exact contraire de ce qu'on a demandé.
 */
/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT BULLE-INFO-ET-S12 — QUAND LA FENÊTRE ET L'EXPÉDITEUR NE DISENT PAS LA MÊME CHOSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   LA QUESTION, POSÉE PAR LE SCÉNARIO S12 du lot PREUVE-SUIVI-CONVERSATION : un mail arrive dans une conversation
   qui a une fenêtre en cours, et l'adresse de son expéditeur désigne un AUTRE bien. Les deux liens coexistaient,
   sans que rien ne dise lequel faisait foi.

   🔴🔴 DÉCISION D'ARNO (01/10/2026) : « LA FENÊTRE GAGNE. Le mail est rattaché aux biens de la fenêtre. Si
   l'adresse de l'expéditeur désigne un AUTRE bien, ce bien devient une proposition DÉCOCHÉE (pas de lien
   confirmé). »

   🔴 POURQUOI C'EST LA BONNE RÉPONSE, et pas l'inverse. Une fenêtre est une décision HUMAINE, prise en lisant la
   conversation : quelqu'un a dit « à partir d'ici, cet échange parle de ce logement ». Une adresse d'expéditeur
   est une déduction du moteur — juste la plupart du temps, mais déduite. Entre une décision et une déduction, la
   décision l'emporte ; et la déduction n'est pas jetée pour autant, elle attend un clic.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * CE QU'IL FAUT FAIRE D'UN BIEN QUE L'EXPÉDITEUR DÉSIGNE, pour un mail couvert (ou non) par une fenêtre. PUR.
 *
 * ⚠️ `undefined` = AUCUNE FENÊTRE NE COUVRE CE MAIL, et c'est le cas de l'immense majorité du courrier : on rend
 * alors `confirme`, c'est-à-dire exactement le comportement d'avant cette règle.
 *
 * ⚠️ UNE FENÊTRE « INTERNE » OU « HORS GESTION » NE PORTE AUCUN BIEN : tout bien que l'expéditeur désigne y est
 * donc « un autre bien », et se propose. C'est cohérent — quelqu'un a dit que cet échange ne concernait aucun
 * logement ; le moteur n'a pas à le contredire tout seul.
 */
export function faceALaFenetre(fenetre: Classement | undefined, cle: string): 'confirme' | 'propose' {
  if (fenetre === undefined) return 'confirme';
  if (fenetre.sorte !== 'biens') return 'propose';
  return fenetre.biens.some((b) => b.cle === cle) ? 'confirme' : 'propose';
}

export function periodeEnCours(
  mails: readonly number[], periodes: readonly Periode[],
): Periode | null {
  const rang = new Map(mails.map((m, i) => [m, i]));
  const ouvertes = [...periodes]
    .filter((p) => rang.has(p.depuisMessageId))
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number));
  return ouvertes.length === 0 ? null : ouvertes[ouvertes.length - 1];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE BLOC « SUIVI DANS LA CONVERSATION » — QUAND IL APPARAÎT, ET CE QU'IL FAIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE BLOC EST-IL VISIBLE ? PUR.
 *
 * Demande d'Arno, et les DEUX conditions sont nécessaires : « Il n'apparaît dans la modale que si DEUX
 * conditions sont réunies : le mail n'est pas le premier de la conversation, ET on modifie un classement déjà
 * validé sur cette conversation. Sinon, il est absent, et le premier classement vaut pour ce mail et toute la
 * suite. »
 *
 * 🔴 POURQUOI LES DEUX. Sur le PREMIER mail, il n'y a pas de passé à préserver : les trois choix diraient la
 * même chose. Et sur une conversation JAMAIS classée, il n'y a pas de règle à modifier : poser la première vaut
 * pour tout ce qui suit. Montrer trois options qui font la même chose, c'est demander d'arbitrer pour rien.
 *
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT — UNE TROISIÈME CONDITION, ET C'EST LA PLUS IMPORTANTE ═══════════════
 *
 * CONSTAT D'ARNO (02/10/2026), fil 3490 / message 57368 : « Le bloc s'affiche dès l'ouverture de la modale, sans
 * qu'aucune case ait été touchée. »
 *
 * POURQUOI. `dejaClassee` valait « cette conversation a au moins une période ou une exception » — or depuis la
 * reprise de la migration 290, TOUTE conversation déjà classée en a une (le fil 3490 en a trois, et le 57368 est
 * son 4ᵉ mail). Les deux conditions étaient donc vraies à l'ouverture, et le bloc s'affichait d'emblée : il
 * demandait d'arbitrer la portée d'un changement qui n'avait pas eu lieu.
 *
 * 🔴 LA RÈGLE D'ARNO : « le bloc n'apparaît QUE lorsque la sélection de biens de la liste du haut est DIFFÉRENTE
 * du rattachement validé en vigueur pour ce mail ». Il apparaît au moment du changement et disparaît si l'on
 * revient exactement à l'état de départ.
 *
 * ⚠️ LA RÉFÉRENCE EST LE RATTACHEMENT **VALIDÉ**, PAS LA PRÉ-COCHE DU MOTEUR. Une proposition cochée d'avance et
 * laissée telle quelle ne compte pas comme un changement : personne n'a rien décidé. C'est la moitié de la règle
 * qu'on perdrait le plus facilement, et celle qui ferait réapparaître le défaut sous une autre forme.
 */
/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — LA SECONDE PORTE, AJOUTÉE LE 02/10/2026
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO, et c'est un AJOUT : la règle du 01/10 ne change pas d'un mot.

     ① CONVERSATION DÉJÀ RATTACHÉE (au moins une période, une exception OU un rattachement validé) : rien ne
        bouge. Pas de bloc au 1er mail ; à partir du 2e, il n'apparaît que si la sélection DIFFÈRE du
        rattachement validé, et il disparaît au retour à l'état de départ.

     ② CONVERSATION JAMAIS RATTACHÉE, expéditeur CONNU des fiches : le bloc est TOUJOURS affiché dès
        l'ouverture, quelle que soit la position du mail (1er compris), SANS condition de changement.

   🔴 POURQUOI ② EXISTE. Jusqu'ici, une conversation jamais classée ne montrait aucun bloc — et la raison tenait :
   « il n'y a pas de règle à modifier ». Mais le premier classement EST une règle, et c'est même la plus lourde :
   il décide si les mails à venir suivront. Le poser sans jamais pouvoir dire « ce mail uniquement » ou « toute la
   conversation » revenait à choisir pour la personne. Constat d'Arno sur le fil 193, le 02/10/2026.

   🔴🔴 POURQUOI « EXPÉDITEUR CONNU » GARDE CETTE PORTE, et ce n'est pas un détail : un expéditeur INCONNU ouvre
   l'ÉTAPE 2 (« Classer ce nouveau contact »), qui porte DÉJÀ son propre suivi à deux choix. Afficher les trois
   choix de l'étape 1 en plus donnerait DEUX blocs de suivi pour un seul geste, et deux réponses possibles à la
   même question. L'invariant est donc : le bloc à 3 choix et l'étape 2 ne s'affichent JAMAIS ensemble.

   ⚠️ « CONNU DES FICHES » EST LA LETTRE D'ARNO, et elle se mesure : l'adresse est contact d'au moins une fiche
   propriétaire ou locataire vivante. Ce n'est PAS « nous le connaissons de vue » — sur le fil 193 précisément,
   `frederic.racan@free.fr` n'est contact d'AUCUNE fiche (vérifié en base le 02/10/2026 : zéro ligne dans
   `gestion_annuaire_contact`, aucune fiche à ce nom, `partie` nulle sur les quatre mails du fil). Ce mail-là
   relève donc de l'étape 2, pas du bloc.

   ⚠️ CONSÉQUENCE À CONNAÎTRE : un mail que NOUS envoyons n'a pas d'expéditeur « connu des fiches » (notre adresse
   n'est contact d'aucune), donc pas de bloc sur une conversation jamais rattachée qu'il ouvrirait. C'est la
   lettre de la règle ; si Arno veut l'étendre, c'est une ligne — mais ce n'est pas ce qu'il a écrit.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export function blocSuiviVisible(o: {
  estPremierMail: boolean;
  /**
   * 🔴 « DÉJÀ RATTACHÉE » AU SENS D'ARNO : au moins une période, une exception, OU un rattachement VALIDÉ sur un
   * mail de cette conversation. Une proposition pré-cochée par le moteur n'en est pas un — personne n'a tranché.
   */
  dejaClassee: boolean;
  /**
   * 🔴🔴 LA RÉFÉRENCE : LES BIENS **VALIDÉS** POUR CE MAIL — confirmés à la main, ou posés par la fenêtre en
   * cours. SURTOUT PAS les cases pré-cochées par le moteur : une proposition n'est pas une décision, et la
   * laisser telle quelle n'est pas un changement.
   */
  reference: readonly string[];
  /**
   * Les biens cochés EN CE MOMENT dans la liste du haut. `null` = la modale n'a encore rien dit (elle n'est pas
   * ouverte, ou ses propositions se chargent) : sans sélection connue, il n'y a aucun changement à constater.
   */
  selection: readonly string[] | null;
  /**
   * 🔴🔴 RÈGLE ② — l'adresse de l'expéditeur est-elle contact d'une fiche propriétaire ou locataire ?
   *
   * ⚠️ FACULTATIF, ET ABSENT VAUT « NON ». Tout ce qui appelait cette fonction avant ce lot continue donc de se
   * comporter exactement comme avant : sur une conversation jamais rattachée, pas de bloc. C'est ce qui permet
   * d'ajouter cette porte sans toucher à un seul attendu existant.
   */
  expediteurConnu?: boolean;
}): boolean {
  /**
   * 🔴🔴 RÈGLE ② — LA CONVERSATION N'A JAMAIS ÉTÉ RATTACHÉE : le bloc est TOUJOURS là pour un expéditeur connu.
   *
   * Aucune condition de changement, et `estPremierMail` ne compte pas : il n'y a pas de passé à préserver, et le
   * classement qu'on s'apprête à poser est le PREMIER — c'est lui qui décidera pour la suite.
   */
  if (!o.dejaClassee) return o.expediteurConnu === true;
  // ── RÈGLE ① — INCHANGÉE DEPUIS LE 01/10/2026 ──────────────────────────────────────────────────────────────────
  if (o.estPremierMail) return false;
  if (o.selection === null) return false;
  return !memesBiens(o.selection, o.reference);
}

/** Deux ensembles de clés de biens désignent-ils la même chose ? L'ORDRE NE COMPTE PAS, les doublons non plus. PUR. */
export function memesBiens(a: readonly string[], b: readonly string[]): boolean {
  const ea = new Set(a);
  const eb = new Set(b);
  if (ea.size !== eb.size) return false;
  for (const c of ea) if (!eb.has(c)) return false;
  return true;
}

/** Le résultat d'un choix : ce qu'il faut écrire, et ce qu'il ne faut surtout pas toucher. */
export interface EffetDuChoix {
  /** Une période à ouvrir à partir de ce mail. `null` = aucune. */
  nouvellePeriode: { depuisMessageId: number; classement: Classement } | null;
  /** Une exception à poser sur ce mail. `null` = aucune. */
  nouvelleException: { messageId: number; classement: Classement } | null;
  /** Les périodes à REMPLACER (« Toute la conversation ») : leurs identifiants. */
  periodesRemplacees: number[];
  /** L'exception à retirer de ce mail, s'il en portait une et qu'on repose une règle de période. */
  exceptionRetiree: number | null;
}

/**
 * ══ 🔴🔴 CE QUE CHAQUE CHOIX FAIT, ÉCRIT UNE SEULE FOIS ════════════════════════════════════════════════════════
 *
 *   a) « Ce mail uniquement » = EXCEPTION. La période en cours ne bouge pas.
 *   b) « Ce mail et la conversation à venir » = NOUVELLE PÉRIODE à partir de ce mail. Le passé ne bouge pas.
 *   c) « Toute la conversation » = la nouvelle règle REMPLACE toutes les périodes… mais PAS les exceptions.
 *
 * 🔴🔴 « LES EXCEPTIONS NE SONT PAS ÉCRASÉES » EST LA RÈGLE LA PLUS FACILE À PERDRE, et c'est celle qu'Arno
 * souligne. Une exception est une décision prise mail par mail, souvent la plus réfléchie de la conversation :
 * un « tout reclasser » qui l'emporterait ferait disparaître le travail le plus fin au profit du plus large.
 *
 * ⚠️ UN MAIL QUI PORTAIT UNE EXCEPTION ET QU'ON RECLASSE EN PÉRIODE PERD SON EXCEPTION — sinon elle masquerait
 * aussitôt la règle qu'on vient de poser sur ce mail même, et le geste n'aurait aucun effet visible.
 */
export function effetDuChoix(o: {
  choix: ChoixSuivi;
  messageId: number;
  classement: Classement;
  periodes: readonly Periode[];
  exceptions: readonly ExceptionMail[];
}): EffetDuChoix {
  const portaitUneException = o.exceptions.some((e) => e.messageId === o.messageId);
  if (o.choix === 'mail') {
    return {
      nouvellePeriode: null,
      nouvelleException: { messageId: o.messageId, classement: o.classement },
      periodesRemplacees: [],
      exceptionRetiree: null,
    };
  }
  if (o.choix === 'suite') {
    return {
      nouvellePeriode: { depuisMessageId: o.messageId, classement: o.classement },
      nouvelleException: null,
      periodesRemplacees: [],
      exceptionRetiree: portaitUneException ? o.messageId : null,
    };
  }
  // c) TOUTE LA CONVERSATION : une seule période, depuis le premier mail, et toutes les autres remplacées.
  return {
    nouvellePeriode: { depuisMessageId: 0, classement: o.classement },
    nouvelleException: null,
    periodesRemplacees: o.periodes.map((p) => p.id),
    exceptionRetiree: portaitUneException ? o.messageId : null,
  };
}

/**
 * ══ 🔴 CE QUE L'ALERTE DE « TOUTE LA CONVERSATION » ANNONCE, MOT POUR MOT ══════════════════════════════════════
 *
 * Demande d'Arno : « une alerte dans la modale explique la conséquence (“Les N mails de cette conversation
 * seront reclassés sur … ; les M exceptions sont conservées”) et doit être confirmée d'une case ou d'un bouton.
 * Sans confirmation, “Valider” reste bloqué. »
 *
 * ⚠️ ON COMPTE LES MAILS RÉELLEMENT RECLASSÉS, c'est-à-dire tous SAUF ceux qui portent une exception : annoncer
 * un nombre plus grand que ce qui va changer serait une alerte qui exagère, et une alerte qui exagère ne se lit
 * plus. Et l'on ne dit « les M exceptions sont conservées » que lorsqu'il y en a.
 */
export function alerteTouteLaConversation(o: {
  mails: readonly number[];
  exceptions: readonly ExceptionMail[];
  /** Ce sur quoi on reclasse, déjà écrit par l'appelant (« 10 rue Chateaubriand — Parking », « Interne »…). */
  versQuoi: string;
  /** Le mail qu'on est en train de classer : il change, même s'il portait une exception. */
  messageId: number;
}): string {
  const avecException = new Set(o.exceptions.map((e) => e.messageId));
  avecException.delete(o.messageId);
  const reclasses = o.mails.filter((m) => !avecException.has(m)).length;
  const gardees = avecException.size;
  const phrase = `Les ${reclasses} mail${reclasses > 1 ? 's' : ''} de cette conversation seront reclassés sur `
    + `${o.versQuoi}`;
  if (gardees === 0) return `${phrase}.`;
  return `${phrase} ; ${gardees} exception${gardees > 1 ? 's' : ''} ${gardees > 1 ? 'sont' : 'est'} conservée${
    gardees > 1 ? 's' : ''}.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LES REPÈRES DANS LE FIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Demande d'Arno : « Entre deux mails, quand la période change, une fine ligne de séparation : “À partir d'ici :
   10 rue Chateaubriand — Parking” (ou “… : Interne”, “… : Hors gestion”), avec la date et qui l'a décidé. Un
   mail en exception porte une petite mention “exception : <biens>” dans son en-tête. » */

export interface RepereFil {
  /**
   * 🔴🔴 L'IDENTITÉ DE LA PÉRIODE QUI PRODUIT CETTE LIGNE — et c'est une correction, pas un confort.
   *
   * CONSTAT (02/10/2026, console du navigateur sur le fil 3490) : « Encountered two children with the same key,
   * rep-57368. » PLUSIEURS périodes peuvent commencer au MÊME mail — ce fil en a trois sur le message 57368 : une
   * posée par la reprise de la migration 290, deux posées à la main le même jour. L'écran les identifiait par le
   * mail, donc par la même clé pour les trois : React prévient que des enfants peuvent être dupliqués ou OMIS,
   * c'est-à-dire qu'une ligne « À partir d'ici » pouvait disparaître.
   *
   * ⚠️ `avantMessageId` NE PEUT PAS SERVIR D'IDENTITÉ, et c'est le fond de l'affaire : il dit OÙ la ligne se
   * pose, pas QUI elle est. L'identifiant de la période, lui, est unique par construction.
   */
  id: number;
  /** Le mail AVANT lequel la ligne s'affiche. */
  avantMessageId: number;
  /** « 10 rue Chateaubriand — Parking », « Interne », « Hors gestion » — déjà composé. */
  versQuoi: string;
  parLibelle: string | null;
  le: string | null;
}

/**
 * Le texte d'un classement, en une ligne. PUR.
 *
 * ══ 🔴 LOT CONTACTS-EXTERNES — LES PERSONNES S'AJOUTENT À LA PHRASE, ET SEULEMENT QUAND IL Y EN A ═════════════
 *
 * Demande d'Arno : « Repères “À partir d'ici : …” dans le fil : comme aujourd'hui, en mentionnant les personnes
 * et le contact externe. »
 *
 * ⚠️ UN CLASSEMENT SANS PERSONNE REND EXACTEMENT CE QU'IL RENDAIT AVANT CE LOT, caractère pour caractère. C'est
 * ce qui permet d'ajouter cette mention sans toucher à un seul attendu de `periodesConversation.test.ts` ni des
 * scénarios S1 à S13 — le champ est facultatif, et l'immense majorité du courrier n'a pas d'intermédiaire.
 *
 * ⚠️ « Interne » ET « Hors gestion » SORTENT AVANT, et c'est juste : une fenêtre qui dit « cet échange ne
 * concerne aucun logement » ne peut porter aucune intervention (la base l'exige, migration 293).
 */
export function motClassement(c: Classement): string {
  if (c.sorte === 'interne') return 'Interne';
  if (c.sorte === 'hors_gestion') return 'Hors gestion';
  const noms = c.biens.map((b) => b.libelle.trim()).filter((l) => l !== '');
  const base = noms.length === 0 ? 'aucun bien' : noms.join(', ');
  const qui = (c.personnes ?? []).map((p) => p.libelle.trim()).filter((l) => l !== '');
  return qui.length === 0 ? base : `${base} · pour ${qui.join(', ')}`;
}

/**
 * LES LIGNES DE SÉPARATION À AFFICHER. PUR.
 *
 * ⚠️ LA PREMIÈRE PÉRIODE NE PRODUIT PAS DE REPÈRE quand elle commence au premier mail : il n'y a pas de
 * « avant » dont elle se distinguerait, et « À partir d'ici » en tête de conversation ne sépare rien.
 */
export function reperesDuFil(
  mails: readonly number[], periodes: readonly Periode[],
): RepereFil[] {
  const rang = new Map(mails.map((m, i) => [m, i]));
  return [...periodes]
    .filter((p) => (rang.get(p.depuisMessageId) ?? -1) > 0)
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number))
    .map((p) => ({
      id: p.id,
      avantMessageId: p.depuisMessageId,
      versQuoi: motClassement(p.classement),
      parLibelle: p.parLibelle ?? null,
      le: p.le ?? null,
    }));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LA REPRISE DES DONNÉES EXISTANTES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Demande d'Arno (point 6) : « Reprends les rattachements actuels sans rien perdre : chaque conversation
   existante devient une période initiale, et un rattachement posé sur un seul mail est repris comme exception. »

   🔴 LE CRITÈRE DE SUCCÈS N'EST PAS « ça compile », C'EST « LA PROJECTION REND EXACTEMENT CE QU'IL Y AVAIT ».
   On déduit donc la reprise de l'état actuel, puis on la REPROJETTE et on compare : si un seul couple
   (mail, bien) diffère, la reprise est fausse. C'est ce que vérifie `repriseFidele`. */

/** L'état actuel d'une conversation : pour chaque mail, dans l'ordre, les biens qu'il porte. */
export interface ConversationExistante {
  mails: readonly { messageId: number; biens: readonly BienClasse[] }[];
}

export interface Reprise {
  periodes: { depuisMessageId: number; classement: Classement }[];
  exceptions: { messageId: number; classement: Classement }[];
}

const memeEnsemble = (a: readonly BienClasse[], b: readonly BienClasse[]): boolean => {
  if (a.length !== b.length) return false;
  const cles = new Set(b.map((x) => x.cle));
  return a.every((x) => cles.has(x.cle));
};

/**
 * CE QUE DEVIENT UNE CONVERSATION EXISTANTE. PUR.
 *
 * 🔴 LA RÈGLE, ET ELLE EST CHOISIE POUR NE RIEN PERDRE : la période initiale prend l'ensemble du PREMIER mail
 * classé ; chaque mail suivant dont l'ensemble DIFFÈRE de la période en cours devient une EXCEPTION — sauf quand
 * le même ensemble se répète ensuite, auquel cas c'était un changement durable, donc une PÉRIODE.
 *
 * ⚠️ « UN RATTACHEMENT POSÉ SUR UN SEUL MAIL EST REPRIS COMME EXCEPTION » : c'est exactement le cas d'un
 * ensemble qui n'apparaît qu'une fois. S'il revient, ce n'était pas une exception — c'était une période.
 *
 * ⚠️ UN MAIL SANS AUCUN BIEN, ALORS QUE LA PÉRIODE EN PORTE, EST UNE EXCEPTION VIDE : il n'était rattaché à
 * rien, et le laisser hériter de la période lui inventerait un classement qu'on n'a jamais posé.
 */
export function reprendre(c: ConversationExistante): Reprise {
  const out: Reprise = { periodes: [], exceptions: [] };
  const classes = c.mails.filter((m) => m.biens.length > 0);
  if (classes.length === 0) return out;

  // Combien de fois chaque ensemble apparaît : un ensemble vu UNE seule fois est une exception.
  const signature = (biens: readonly BienClasse[]): string =>
    [...new Set(biens.map((b) => b.cle))].sort().join('|');
  const combien = new Map<string, number>();
  for (const m of c.mails) combien.set(signature(m.biens), (combien.get(signature(m.biens)) ?? 0) + 1);

  let courante: readonly BienClasse[] | null = null;
  for (const m of c.mails) {
    if (m.biens.length === 0) {
      // Rien sur ce mail : exception vide SEULEMENT si une période est ouverte (sinon il n'y a rien à dire).
      if (courante !== null) out.exceptions.push({ messageId: m.messageId, classement: SANS_CLASSEMENT });
      continue;
    }
    if (courante !== null && memeEnsemble(m.biens, courante)) continue;
    const unique = (combien.get(signature(m.biens)) ?? 0) === 1;
    if (courante !== null && unique) {
      out.exceptions.push({ messageId: m.messageId, classement: { sorte: 'biens', biens: m.biens } });
      continue;
    }
    out.periodes.push({ depuisMessageId: m.messageId, classement: { sorte: 'biens', biens: m.biens } });
    courante = m.biens;
  }
  return out;
}

/**
 * 🔴🔴 LA REPRISE REND-ELLE EXACTEMENT L'ÉTAT D'AVANT ? PUR.
 *
 * C'est le seul contrôle qui vaille : on reprojette la reprise sur les mêmes mails et l'on compare couple par
 * couple. `false` ⇒ la reprise perdrait ou inventerait un rattachement, et il ne faut surtout pas l'appliquer.
 */
export function repriseFidele(c: ConversationExistante, r: Reprise): boolean {
  const mails = c.mails.map((m) => m.messageId);
  const periodes: Periode[] = r.periodes.map((p, i) => ({ id: i + 1, ...p }));
  const projetee = projeter(mails, periodes, r.exceptions);
  return c.mails.every((m) => {
    const c2 = projetee.get(m.messageId);
    const biens = c2 === undefined || c2.sorte !== 'biens' ? [] : c2.biens;
    return memeEnsemble(biens, m.biens);
  });
}
