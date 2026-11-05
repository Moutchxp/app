import { describe, expect, it } from 'vitest';
import {
  AUCUN_MAIL_PARTENAIRES, AUCUN_MAIL_PARTI, lienDestinataires, mailInterneSortie, mailsDepuisAvis, MESSAGE_SANS_PARTENAIRES,
  messagesConfirmation, TITRE_ENREGISTRE, TITRE_TRANSMIS, titreConfirmation, type MailParti,
} from './confirmationEnvois';

/** 🔴 Arno (05/11/2026) — la modale de confirmation : la vérité vient du serveur ; jamais « transmis » sur un échec. */
const m = (sorte: string, envoye = true, a = ['x@exemple.test']): MailParti => ({ sorte, objet: 'o', a, cc: ['gestion@criterimmo.fr'], envoye, motif: envoye ? null : 'Gmail injoignable' });

describe('titre et messages, pour les 3 types d’action', () => {
  for (const partenaire of ['nouvelle_location', 'preavis_adhoc', 'sortie_adhoc']) {
    it(`${partenaire} — avec envoi réussi : « transmis »`, () => {
      const i = { informer: true, mails: [m(partenaire)], motifGlobal: null };
      expect(titreConfirmation(i)).toBe(TITRE_TRANSMIS);
      expect(messagesConfirmation(i)).toEqual([]);
    });
    it(`${partenaire} — envoi partenaires en échec : « Enregistré », en rouge avec l’adresse`, () => {
      const i = { informer: true, mails: [m(partenaire, false, ['p@exemple.test'])], motifGlobal: null };
      expect(titreConfirmation(i)).toBe(TITRE_ENREGISTRE);
      expect(messagesConfirmation(i)).toEqual([{ texte: 'L’envoi à nos partenaires a échoué (p@exemple.test) : rien ne leur a été transmis.', alerte: true }]);
    });
  }
  it('sans envoi demandé, des mails internes partis : le message d’Arno', () => {
    const i = { informer: false, mails: [m('preavis_locataires')], motifGlobal: null };
    expect(titreConfirmation(i)).toBe(TITRE_ENREGISTRE);
    expect(messagesConfirmation(i)).toEqual([{ texte: MESSAGE_SANS_PARTENAIRES, alerte: false }]);
  });
  it('sans envoi demandé et AUCUN mail parti (nouvelle location « Enregistrer ») : on ne prétend aucune transmission', () => {
    const i = { informer: false, mails: [], motifGlobal: null };
    expect(messagesConfirmation(i)).toEqual([{ texte: AUCUN_MAIL_PARTENAIRES, alerte: false }, { texte: AUCUN_MAIL_PARTI, alerte: false }]);
  });
  it('envoi demandé mais aucun mail partenaire rendu (liste vide, hors gestion) : jamais « transmis »', () => {
    const i = { informer: true, mails: [m('sortie_interne')], motifGlobal: null };
    expect(titreConfirmation(i)).toBe(TITRE_ENREGISTRE);
    expect(messagesConfirmation(i)).toEqual([{ texte: AUCUN_MAIL_PARTENAIRES, alerte: false }]);
  });
  it('les mails n’ont pas pu partir du tout : la raison, en rouge', () => {
    const i = { informer: true, mails: [], motifGlobal: 'migration 457 manquante' };
    expect(titreConfirmation(i)).toBe(TITRE_ENREGISTRE);
    expect(messagesConfirmation(i)).toContainEqual({ texte: 'Les mails n’ont pas pu partir : migration 457 manquante', alerte: true });
  });
});

describe('lecture des réponses du serveur', () => {
  it('mails du préavis / de la sortie, tels que rendus', () => {
    expect(mailsDepuisAvis({ etat: 'ok', envois: [m('preavis_adhoc')] })).toEqual({ mails: [m('preavis_adhoc')], motifGlobal: null });
    expect(mailsDepuisAvis({ etat: 'echec', motif: 'x' })).toEqual({ mails: [], motifGlobal: 'x' });
    expect(mailsDepuisAvis(undefined)).toEqual({ mails: [], motifGlobal: null });
  });
  it('le récapitulatif interne de la sortie : ses adresses réelles ; ignoré → rien', () => {
    expect(mailInterneSortie({ envoye: true, motif: null, destinataires: ['a@x.fr'], objet: 'Sortie' }))
      .toEqual({ sorte: 'sortie_interne', objet: 'Sortie', a: ['a@x.fr'], cc: [], envoye: true, motif: null });
    expect(mailInterneSortie({ envoye: false, ignore: true, motif: null })).toBeNull();
    expect(mailInterneSortie(undefined)).toBeNull();
    expect(mailInterneSortie({ etat: 'sans_adresse' } as never)).toBeNull();
  });
  it('le lien vers la bonne liste de « Destinataires mails »', () => {
    expect(lienDestinataires('nouvelle_location')).toBe('/admin/location/outils/parametres?onglet=destinataires');
    expect(lienDestinataires('preavis')).toBe('/admin/location/outils/parametres?onglet=destinataires&liste=preavis');
    expect(lienDestinataires('sortie')).toBe('/admin/location/outils/parametres?onglet=destinataires&liste=sorties');
  });
});
