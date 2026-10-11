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
