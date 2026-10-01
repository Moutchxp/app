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

/** Le classement porté par une période ou une exception. */
export interface Classement {
  sorte: SorteClassement;
  /** Les biens, quand `sorte === 'biens'`. Vide pour les deux autres sortes. */
  biens: readonly BienClasse[];
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
 */
export function blocSuiviVisible(o: { estPremierMail: boolean; dejaClassee: boolean }): boolean {
  return !o.estPremierMail && o.dejaClassee;
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
  /** Le mail AVANT lequel la ligne s'affiche. */
  avantMessageId: number;
  /** « 10 rue Chateaubriand — Parking », « Interne », « Hors gestion » — déjà composé. */
  versQuoi: string;
  parLibelle: string | null;
  le: string | null;
}

/** Le texte d'un classement, en une ligne. PUR. */
export function motClassement(c: Classement): string {
  if (c.sorte === 'interne') return 'Interne';
  if (c.sorte === 'hors_gestion') return 'Hors gestion';
  const noms = c.biens.map((b) => b.libelle.trim()).filter((l) => l !== '');
  return noms.length === 0 ? 'aucun bien' : noms.join(', ');
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
