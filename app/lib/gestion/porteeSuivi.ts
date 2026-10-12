import { BANDEAU_MODIFICATION_PONCTUELLE, MOT_MODIFICATION_PONCTUELLE_FAITE } from './sortirDuSuivi';
import type { ChoixSuivi, ExceptionMail } from './periodesConversation';
import { motBiensRattaches } from './changementsSuivi';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA PORTÉE DU SUIVI D'UN MAIL, EN QUATRE POSITIONS. Module PUR ══
 *
 * DEMANDE D'ARNO (11/10/2026) : « cette modale devient l'endroit unique pour choisir la portée du suivi d'un mail :
 * Origine, One shot, Ce mail + futurs échanges, Toute la conversation ». Une glissière, un bloc de définition propre à
 * chaque position, un bouton final.
 *
 * 🔴 AUCUN MÉCANISME NEUF : ② est l'exception « ce mail uniquement » (`choix: 'mail'`), ③ la fenêtre « la suite »
 * (`'suite'`, avec son accolade rouge et son point d'information, inchangés), ④ « toute la conversation »
 * (`'conversation'`). ① n'écrit rien. Ce module ne fait que DIRE et DÉCIDER ; l'écriture reste `/api/admin/gestion/suivi`.
 */

export type PositionPortee = 'origine' | 'one_shot' | 'suite' | 'conversation';

export interface DefinitionPosition {
  cle: PositionPortee;
  libelle: string;
  definition: string;
  /** La fenêtre de suivi que la validation écrit ; `null` pour ① (rien n'est écrit). */
  choix: ChoixSuivi | null;
}

/** De gauche à droite, mot pour mot (Arno). */
export const POSITIONS_PORTEE: readonly DefinitionPosition[] = [
  {
    cle: 'origine', libelle: 'Origine', choix: null,
    definition: 'Le suivi reste tel qu’il était. Aucune modification n’est enregistrée.',
  },
  {
    cle: 'one_shot', libelle: 'One shot', choix: 'mail',
    /* « texte actuel » (Arno) : le bandeau du mode ponctuel, lu à sa source. */
    definition: BANDEAU_MODIFICATION_PONCTUELLE,
  },
  {
    cle: 'suite', libelle: 'Ce mail + futurs échanges', choix: 'suite',
    /* 🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — « appliquera » devient « rattachera » (Arno). */
    /* 🔴 LOT BULLE-BIENS-RATTACHES — « le suivi » devient « le suivi de fond » (en gras à l'écran : MOT_FORT_SUITE). */
    definition: 'À partir de ce mail, et pour tous les prochains échanges de cette conversation, le suivi de fond rattachera '
      + 'les biens choisis ci-dessus. Les mails plus anciens ne changent pas.',
  },
  {
    cle: 'conversation', libelle: 'Toute la conversation', choix: 'conversation',
    definition: 'Les biens choisis ci-dessus s’appliquent à toute la conversation, anciens mails compris. Sur les '
      + 'anciens mails, les biens ajoutés sont ajoutés et les biens retirés passent en « sorti du suivi » '
      + '(restaurable), jamais effacés.',
  },
];

export function definitionDe(p: PositionPortee): DefinitionPosition {
  return POSITIONS_PORTEE.find((x) => x.cle === p) as DefinitionPosition;
}

/**
 * 🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — LA DÉFINITION AFFICHÉE, avec le nombre de biens cochés au bout de sa
 * 2ᵉ phrase pour ③ (Arno) : « … Les mails plus anciens ne changent pas — 2 biens rattachés. », mis à jour en direct.
 * Les autres positions sont dites telles quelles (④ n'emploie pas « appliquera » : inchangée). PUR.
 */
/** 🔴 LOT BULLE-BIENS-RATTACHES — les mots de la définition ③ écrits en GRAS (Arno). */
export const MOT_FORT_SUITE = 'suivi de fond';

/**
 * La définition affichée, découpée pour l'écran : le morceau `fort` est en gras (« suivi de fond » pour ③, rien pour
 * les autres positions). PUR.
 */
export function morceauxDefinition(p: PositionPortee, nbCoches: number): { texte: string; fort: boolean }[] {
  const d = definitionAffichee(p, nbCoches);
  const i = p === 'suite' ? d.indexOf(MOT_FORT_SUITE) : -1;
  if (i < 0) return [{ texte: d, fort: false }];
  return [
    { texte: d.slice(0, i), fort: false },
    { texte: MOT_FORT_SUITE, fort: true },
    { texte: d.slice(i + MOT_FORT_SUITE.length), fort: false },
  ].filter((m) => m.texte !== '');
}

export function definitionAffichee(p: PositionPortee, nbCoches: number): string {
  const d = definitionDe(p).definition;
  if (p !== 'suite') return d;
  return `${d.replace(/\.$/, '')} — ${motBiensRattaches(nbCoches)}.`;
}

/**
 * Y A-T-IL UNE MODIFICATION DANS LES BLOCS 1 À 4 ? PUR.
 * Une case cochée ou décochée, un bien ajouté (la sélection n'est plus celle de l'ouverture — comparée comme un
 * ENSEMBLE), ou un événement à lier / créer.
 */
export function modificationEnCours(o: {
  avant: readonly string[]; apres: readonly string[] | null; evenementVoulu: boolean;
}): boolean {
  if (o.evenementVoulu) return true;
  if (o.apres === null) return false;
  const a = new Set(o.avant);
  const b = new Set(o.apres);
  if (a.size !== b.size) return true;
  for (const c of a) if (!b.has(c)) return true;
  return false;
}

/** Une position est-elle sélectionnable ? Sans modification, seule ① l'est (les trois autres sont grisées). */
export function positionActive(p: PositionPortee, modification: boolean): boolean {
  return p === 'origine' || modification;
}

/**
 * LA POSITION À PRENDRE QUAND LES MODIFICATIONS CHANGENT. PUR.
 *   · dès la première modification, ① passe AUTOMATIQUEMENT sur ② ;
 *   · plus aucune modification (tout recoché comme à l'ouverture) : retour à ①, les autres redeviennent grisées.
 *   · sinon, la position choisie est gardée.
 */
export function positionSuivante(position: PositionPortee, modification: boolean): PositionPortee {
  if (!modification) return 'origine';
  return position === 'origine' ? 'one_shot' : position;
}

/**
 * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — LE PREMIER CLASSEMENT D'UN MAIL ══════════════════════════════════════
 *
 * DÉCISION D'ARNO (12/10/2026) : « Pour un mail JAMAIS classé, la position “Origine” signifie “laisser à classer,
 * aucun changement”. La glissière est placée par défaut sur “Ce mail + futurs échanges”, comme la règle actuelle du
 * premier classement » (`SUIVI_DEFAUT`, `'suite'`).
 *
 * 🔴 `voulue` VAUT `null` TANT QUE PERSONNE N'A TOUCHÉ LA GLISSIÈRE : c'est ce qui distingue le DÉFAUT d'un choix fait à
 * la main — et la règle de préséance de l'étape « Classer ce nouveau contact » en dépend (`porteeArbitre`).
 * ⚠️ HORS PREMIER CLASSEMENT, RIEN NE CHANGE : `null` se lit « Origine », et `positionSuivante` s'applique telle quelle.
 */
export function positionAffichee(
  voulue: PositionPortee | null, modification: boolean, premier: boolean,
): PositionPortee {
  if (!premier) return positionSuivante(voulue ?? 'origine', modification);
  /* 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE (accord d'Arno) — « Origine » n'existe pas au premier rattachement : la
     glissière est TOUJOURS sur « Ce mail + futurs échanges » à l'ouverture, et ne peut jamais se poser sur Origine. */
  return voulue === null || voulue === 'origine' ? 'suite' : voulue;
}

/** La bulle de survol d'« Origine », grisée au premier rattachement (Arno, mot pour mot). */
export const BULLE_ORIGINE_PREMIER = 'Pas d’origine : ce mail n’a encore jamais été rattaché.';

/** Au premier classement, les quatre positions se choisissent d'emblée (rien n'est écrit sans un bien coché). PUR. */
export function glissiereOuverte(modification: boolean, premier: boolean): boolean {
  return modification || premier;
}

/**
 * LA GLISSIÈRE ARBITRE-T-ELLE LA PORTÉE ? Oui dès qu'on l'a touchée, et toujours hors premier classement. Au premier
 * classement, sans clic, le choix de l'étape « Classer ce nouveau contact » garde la main — la préséance d'avant. PUR.
 */
export function porteeArbitre(voulue: PositionPortee | null, premier: boolean): boolean {
  return voulue !== null || !premier;
}

/** Le bloc des biens suivis, pour un mail jamais classé (Arno, mot pour mot). */
export const AUCUN_BIEN_SUIVI = 'Aucun bien suivi pour l’instant';

/**
 * La définition affichée. 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — au premier rattachement, « Origine » ne peut plus
 * être choisie : son texte propre (« Le mail reste à classer… ») a été retiré avec elle (accord d'Arno). PUR.
 */
export function morceauxDefinitionPortee(
  p: PositionPortee, nbCoches: number, premier: boolean,
): { texte: string; fort: boolean }[] {
  return morceauxDefinition(premier && p === 'origine' ? 'suite' : p, nbCoches);
}

/**
 * ══ 🔴🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — LE BOUTON DU BLOC « PORTÉE DU SUIVI » ═══════════════════
 *
 * RÈGLE D'ARNO (12/10/2026), pour un PREMIER rattachement (mail jamais classé) :
 *   ① aucun bien coché, glissière sur One shot / Ce mail + futurs échanges / Toute la conversation : bouton BLANC à
 *      contour et texte rouges, « Sélectionner minimum un bien », INACTIF (le clic n'écrit rien, il appelle l'œil
 *      vers les blocs de biens) ;
 *   ② au moins un bien coché : bouton PLEIN rouge, libellé selon la position ;
 *   ③ « Origine » : 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — elle n'est plus choisissable au premier rattachement
 *      (accord d'Arno) : son bouton « Valider le maintien du suivi actuel » et sa mention ont été retirés avec elle.
 *
 * 🔴 POUR UNE MODIFICATION (mail déjà classé), RIEN NE CHANGE : décocher tous les biens EST le geste existant qui
 * retire ce mail du suivi de ses biens (« sorti du suivi », restaurable) — c'est par lui qu'on passe de « Rattaché »
 * à « Interne ». Le bouton blanc ne s'y applique donc jamais : les libellés de modification sont gardés. PUR.
 */
export const MOT_SELECTIONNER_UN_BIEN = 'Sélectionner minimum un bien';
export const MOTS_VALIDER_PREMIER: Readonly<Record<Exclude<PositionPortee, 'origine'>, string>> = {
  one_shot: 'Valider le rattachement one shot',
  suite: 'Valider le rattachement de fond',
  /* 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — « de toute la conversation » (Arno). */
  conversation: 'Valider le rattachement de toute la conversation',
};

export interface EtatBoutonPortee {
  mot: string;
  /** `plein` : rouge, texte blanc ; `vide` : blanc, contour et texte rouges. */
  aspect: 'plein' | 'vide';
  /** Inactif : le clic n'écrit rien (il appelle l'œil vers les biens). */
  inactif: boolean;
  /** La mention discrète sous le bouton, ou `null`. */
  mention: string | null;
}

export function etatBoutonPortee(o: {
  premier: boolean; position: PositionPortee; modification: boolean; nbCoches: number;
}): EtatBoutonPortee {
  if (!o.premier) return { mot: motBoutonFinal(o.modification), aspect: 'plein', inactif: false, mention: null };
  /* Au premier rattachement, « Origine » n'est jamais la position (`positionAffichee`) : par sûreté, elle se lit « suite ». */
  const p = o.position === 'origine' ? 'suite' : o.position;
  if (o.nbCoches === 0) return { mot: MOT_SELECTIONNER_UN_BIEN, aspect: 'vide', inactif: true, mention: null };
  return { mot: MOTS_VALIDER_PREMIER[p], aspect: 'plein', inactif: false, mention: null };
}

export const MOT_VALIDER_MAINTIEN = 'Valider le maintien du suivi actuel';
export const MOT_VALIDER_MODIFICATION = 'Valider la modification du suivi';
export function motBoutonFinal(modification: boolean): string {
  return modification ? MOT_VALIDER_MODIFICATION : MOT_VALIDER_MAINTIEN;
}

export const QUESTION_RETOUR_ORIGINE = 'Revenir au suivi d’origine ? Vos modifications seront abandonnées';

/**
 * ④ — LA CONFIRMATION, AVEC LE NOMBRE DE MAILS QUI SERONT MIS À JOUR. PUR.
 * « 12 mails de cette conversation seront mis à jour » (Arno) : les AUTRES mails de la conversation — celui-ci est
 * déjà dit par les blocs du dessus —, moins ceux qui portent une exception, qui est conservée (règle existante de
 * « toute la conversation »).
 */
export function motConfirmationConversation(o: {
  mails: readonly number[]; exceptions: readonly ExceptionMail[]; messageId: number;
}): string {
  const avecException = new Set(o.exceptions.map((e) => e.messageId));
  avecException.delete(o.messageId);
  const autres = o.mails.filter((m) => m !== o.messageId && !avecException.has(m)).length;
  const phrase = autres === 0
    ? 'Aucun autre mail de cette conversation ne sera mis à jour'
    : `${autres} mail${autres > 1 ? 's' : ''} de cette conversation ${autres > 1 ? 'seront mis' : 'sera mis'} à jour`;
  const g = avecException.size;
  return g === 0 ? `${phrase}.`
    : `${phrase} ; ${g} exception${g > 1 ? 's' : ''} ${g > 1 ? 'sont conservées' : 'est conservée'}.`;
}

export const MOT_CONFIRMER_CONVERSATION = 'Je confirme la mise à jour de toute la conversation.';

/** Ce qu'on dit après le geste, au-dessus de l'« Annuler » : un mot par portée. */
export function motApresValidation(choix: ChoixSuivi): string {
  if (choix === 'mail') return MOT_MODIFICATION_PONCTUELLE_FAITE;
  if (choix === 'suite') return 'Suivi modifié à partir de ce mail, pour les prochains échanges de la conversation.';
  return 'Toute la conversation a été mise à jour.';
}
