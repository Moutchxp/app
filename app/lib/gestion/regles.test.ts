import { describe, it, expect } from 'vitest';
import { appliquerRegles, regleReconnait, type RegleExclusion } from './regles';

/**
 * LOT 3 — l'application des règles d'exclusion. Ce qui est en jeu : une règle ne SUPPRIME rien, elle tient un message
 * hors de la FILE. Le pire défaut possible serait qu'une règle trop large fasse disparaître du travail réel : les cas
 * ci-dessous vérifient d'abord qu'aucune règle ne mord au-delà de ce qu'elle dit.
 */

const regle = (o: Partial<RegleExclusion> & { type: RegleExclusion['type']; valeur: string }): RegleExclusion =>
  ({ id: 1, sens: 'les_deux', motif: 'motif de test', ...o });

const msg = (o: Partial<Parameters<typeof regleReconnait>[1]> = {}) =>
  ({ sens: 'recu' as const, deAdresse: 'locataire@orange.fr', objet: 'Problème de chauffage', entetes: {}, ...o });

describe('gabarit d’objet — la règle qui porte le gros du bruit sortant', () => {
  const r = regle({ type: 'gabarit_objet', valeur: 'Document CRITERIMMO' });

  it('reconnaît l’objet EXACT, et aussi ses variantes de réponse/transfert (même gabarit)', () => {
    expect(regleReconnait(r, msg({ objet: 'Document CRITERIMMO' }))).toBe(true);
    expect(regleReconnait(r, msg({ objet: 'Re: Document CRITERIMMO' }))).toBe(true);
    expect(regleReconnait(r, msg({ objet: 'TR : Document CRITERIMMO' }))).toBe(true);
    expect(regleReconnait(r, msg({ objet: 'document criterimmo' }))).toBe(true); // casse indifférente
  });

  it('ne mord PAS sur un objet qui contient seulement ces mots — c’est le gabarit ENTIER qui compte', () => {
    expect(regleReconnait(r, msg({ objet: 'Question sur un Document CRITERIMMO reçu hier' }))).toBe(false);
    expect(regleReconnait(r, msg({ objet: 'Documents CRITERIMMO' }))).toBe(false);
    expect(regleReconnait(r, msg({ objet: null }))).toBe(false);
  });

  it('le gabarit COUPE à la première séparation : « Document CRITERIMMO — Mme Martin » est le même envoi', () => {
    expect(regleReconnait(r, msg({ objet: 'Document CRITERIMMO — Mme Martin' }))).toBe(true);
  });
});

describe('domaine et adresse d’expéditeur', () => {
  it('le domaine mord sur le domaine seul, jamais sur une adresse qui lui ressemble', () => {
    const r = regle({ type: 'domaine_expediteur', valeur: 'criterimmo.fr' });
    expect(regleReconnait(r, msg({ deAdresse: 'a.jorel@criterimmo.fr' }))).toBe(true);
    expect(regleReconnait(r, msg({ deAdresse: 'A.Jorel@CRITERIMMO.FR' }))).toBe(true);
    expect(regleReconnait(r, msg({ deAdresse: 'contact@pas-criterimmo.fr' }))).toBe(false);
    expect(regleReconnait(r, msg({ deAdresse: 'criterimmo.fr@autre.com' }))).toBe(false); // le domaine, pas le texte
  });

  it('l’adresse exige l’adresse ENTIÈRE', () => {
    const r = regle({ type: 'adresse_expediteur', valeur: 'no-reply@monga.io' });
    expect(regleReconnait(r, msg({ deAdresse: 'No-Reply@Monga.io' }))).toBe(true);
    expect(regleReconnait(r, msg({ deAdresse: 'interventions@monga.io' }))).toBe(false);
  });
});

describe('signal d’en-tête — une seule définition, partagée avec la sonde', () => {
  it('reconnaît l’en-tête nommé par la règle', () => {
    const r = regle({ type: 'signal_entete', valeur: 'list-unsubscribe' });
    expect(regleReconnait(r, msg({ entetes: { 'List-Unsubscribe': '<https://x/y>' } }))).toBe(true);
    expect(regleReconnait(r, msg({ entetes: { 'x-mailer': 'Logiciel' } }))).toBe(false);
  });

  it('ne mord pas sur une DÉCLARATION DE NON-automatisme (auto-submitted: no)', () => {
    const r = regle({ type: 'signal_entete', valeur: 'auto-submitted' });
    expect(regleReconnait(r, msg({ entetes: { 'auto-submitted': 'auto-generated' } }))).toBe(true);
    expect(regleReconnait(r, msg({ entetes: { 'auto-submitted': 'no' } }))).toBe(false);
  });

  it('la valeur spéciale « adresse sans réponse » regarde l’expéditeur', () => {
    const r = regle({ type: 'signal_entete', valeur: 'adresse sans réponse' });
    expect(regleReconnait(r, msg({ deAdresse: 'no-reply@monga.io' }))).toBe(true);
    expect(regleReconnait(r, msg({ deAdresse: 'locataire@orange.fr' }))).toBe(false);
  });

  it('ne mord JAMAIS sur un en-tête de REDIRECTION : la sonde les a vus sur 100 % des messages', () => {
    const r = regle({ type: 'signal_entete', valeur: 'delivered-to' });
    expect(regleReconnait(r, msg({ entetes: { 'delivered-to': 'a.jorel@sansvisavis.com' } }))).toBe(false);
  });
});

describe('le sens de la règle', () => {
  const interne = regle({ type: 'domaine_expediteur', valeur: 'criterimmo.fr', sens: 'recu' });

  it('une règle « reçu » ne touche pas un message envoyé, et inversement', () => {
    const m = { deAdresse: 'gestion@criterimmo.fr', objet: null, entetes: {} };
    expect(appliquerRegles([interne], { ...m, sens: 'recu' })).not.toBeNull();
    expect(appliquerRegles([interne], { ...m, sens: 'envoye' })).toBeNull();
  });

  it('« les_deux » s’applique aux deux sens', () => {
    const r = regle({ type: 'gabarit_objet', valeur: 'Document CRITERIMMO', sens: 'les_deux' });
    for (const sens of ['recu', 'envoye'] as const) {
      expect(appliquerRegles([r], { sens, deAdresse: 'x@y.fr', objet: 'Document CRITERIMMO', entetes: {} })).not.toBeNull();
    }
  });
});

describe('la cascade', () => {
  it('rend la PREMIÈRE règle qui reconnaît, avec une COPIE de son motif (pas un pointeur vers un texte qui bouge)', () => {
    const regles = [
      regle({ id: 7, type: 'domaine_expediteur', valeur: 'monga.io', motif: 'notifications de plateforme' }),
      regle({ id: 9, type: 'signal_entete', valeur: 'list-unsubscribe', motif: 'diffusion de masse' }),
    ];
    const r = appliquerRegles(regles, msg({ deAdresse: 'no-reply@monga.io', entetes: { 'list-unsubscribe': '<u>' } }));
    expect(r).toEqual({ regleId: 7, motif: 'notifications de plateforme' }); // l'ordre d'entrée décide, pas le hasard
  });

  it('aucune règle ne reconnaît → le message entre dans la file', () => {
    expect(appliquerRegles([regle({ type: 'gabarit_objet', valeur: 'Autre chose' })], msg())).toBeNull();
    expect(appliquerRegles([], msg())).toBeNull();
  });

  it('une règle à valeur vide ne mord sur RIEN (une saisie ratée ne doit pas vider la file)', () => {
    expect(appliquerRegles([regle({ type: 'domaine_expediteur', valeur: '   ' })], msg())).toBeNull();
  });
});
