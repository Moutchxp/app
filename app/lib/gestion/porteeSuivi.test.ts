import { describe, it, expect } from 'vitest';
import {
  definitionDe, modificationEnCours, motBoutonFinal, motConfirmationConversation, positionActive, positionSuivante,
  POSITIONS_PORTEE, QUESTION_RETOUR_ORIGINE,
} from './porteeSuivi';
import { BANDEAU_MODIFICATION_PONCTUELLE } from './sortirDuSuivi';

/** 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — la portée en quatre positions, sans écran. */

describe('les quatre positions, de gauche à droite, et leurs définitions mot pour mot', () => {
  it('ordre, libellés et fenêtre écrite', () => {
    expect(POSITIONS_PORTEE.map((p) => [p.libelle, p.choix])).toEqual([
      ['Origine', null], ['One shot', 'mail'], ['Ce mail + futurs échanges', 'suite'], ['Toute la conversation', 'conversation'],
    ]);
  });
  it('les définitions d’Arno', () => {
    expect(definitionDe('origine').definition).toBe('Le suivi reste tel qu’il était. Aucune modification n’est enregistrée.');
    expect(definitionDe('one_shot').definition).toBe(BANDEAU_MODIFICATION_PONCTUELLE);
    expect(definitionDe('one_shot').definition).toBe('Modification ponctuelle : elle ne concerne QUE ce mail. Aucun autre mail, aucune conversation et aucun suivi ne sont modifiés.');
    expect(definitionDe('suite').definition).toBe('À partir de ce mail, et pour tous les prochains échanges de cette conversation, le suivi rattachera les biens choisis ci-dessus. Les mails plus anciens ne changent pas.');
    expect(definitionDe('conversation').definition).toBe('Les biens choisis ci-dessus s’appliquent à toute la conversation, anciens mails compris. Sur les anciens mails, les biens ajoutés sont ajoutés et les biens retirés passent en « sorti du suivi » (restaurable), jamais effacés.');
    expect(QUESTION_RETOUR_ORIGINE).toBe('Revenir au suivi d’origine ? Vos modifications seront abandonnées');
  });
});

describe('modification et position', () => {
  it('une case décochée, un bien ajouté ou un événement voulu sont des modifications ; l’ordre ne compte pas', () => {
    expect(modificationEnCours({ avant: ['a'], apres: null, evenementVoulu: false })).toBe(false);
    expect(modificationEnCours({ avant: ['a', 'b'], apres: ['b', 'a'], evenementVoulu: false })).toBe(false);
    expect(modificationEnCours({ avant: ['a'], apres: [], evenementVoulu: false })).toBe(true);
    expect(modificationEnCours({ avant: ['a'], apres: ['a', 'c'], evenementVoulu: false })).toBe(true);
    expect(modificationEnCours({ avant: ['a'], apres: ['a'], evenementVoulu: true })).toBe(true);
  });
  it('sans modification, seule ① est active ; avec, les quatre', () => {
    expect(POSITIONS_PORTEE.map((p) => positionActive(p.cle, false))).toEqual([true, false, false, false]);
    expect(POSITIONS_PORTEE.map((p) => positionActive(p.cle, true))).toEqual([true, true, true, true]);
  });
  it('🔴 bascule automatique sur ② à la première modification ; retour à ① sans modification', () => {
    expect(positionSuivante('origine', true)).toBe('one_shot');
    expect(positionSuivante('suite', true)).toBe('suite');
    expect(positionSuivante('conversation', false)).toBe('origine');
  });
  it('le bouton final', () => {
    expect(motBoutonFinal(false)).toBe('Valider le maintien du suivi actuel');
    expect(motBoutonFinal(true)).toBe('Valider la modification du suivi');
  });
});

describe('④ la confirmation, avec le nombre de mails mis à jour', () => {
  const mails = Array.from({ length: 13 }, (_, i) => 100 + i);
  it('« 12 mails de cette conversation seront mis à jour »', () => {
    expect(motConfirmationConversation({ mails, exceptions: [], messageId: 112 })).toBe('12 mails de cette conversation seront mis à jour.');
  });
  it('les exceptions conservées sont dites, et ne sont pas comptées', () => {
    const exceptions = [{ messageId: 101, classement: { sorte: 'interne' as const, biens: [] } }];
    expect(motConfirmationConversation({ mails, exceptions, messageId: 112 }))
      .toBe('11 mails de cette conversation seront mis à jour ; 1 exception est conservée.');
  });
  it('un seul autre mail, ou aucun', () => {
    expect(motConfirmationConversation({ mails: [1, 2], exceptions: [], messageId: 2 })).toBe('1 mail de cette conversation sera mis à jour.');
    expect(motConfirmationConversation({ mails: [2], exceptions: [], messageId: 2 })).toBe('Aucun autre mail de cette conversation ne sera mis à jour.');
  });
});
