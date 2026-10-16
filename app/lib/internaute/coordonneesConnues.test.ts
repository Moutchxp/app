import { describe, expect, it } from 'vitest';
import {
  champsIdentiteManquants, champsVidesACompleter, consentementDejaValable, lireReponseCoordonnees, type CoordonneesConnues,
} from './coordonneesConnues';

const COMPLET: CoordonneesConnues = {
  prenom: 'Arno', nom: 'Essai', email: 'a@example.com', telephone: '+33612345678',
  consentementsValables: ['recontact_interne'], derniereResidence: '1 rue de la Paix 75002 Paris',
};

describe('coordonnées connues d’un internaute connecté', () => {
  it('compte complet : rien à demander', () => {
    expect(champsIdentiteManquants(COMPLET)).toEqual([]);
  });
  it('il manque le téléphone (ou un nom vide/blanc) : seuls ceux-là sont demandés', () => {
    expect(champsIdentiteManquants({ ...COMPLET, telephone: null })).toEqual(['telephone']);
    expect(champsIdentiteManquants({ ...COMPLET, prenom: '  ', nom: null })).toEqual(['prenom', 'nom']);
  });
});

describe('complétion du compte : cases vides seulement', () => {
  it('ne complète que ce qui est vide sur le compte et saisi', () => {
    expect(champsVidesACompleter({ prenom: 'Arno', nom: 'Essai', telephone: null }, { prenom: 'Autre', nom: 'Autre', telephone: '+33611111111' }))
      .toEqual({ telephone: '+33611111111' });
  });
  it('jamais d’écrasement d’un champ déjà rempli', () => {
    expect(champsVidesACompleter({ prenom: 'Arno', nom: 'Essai', telephone: '+33612345678' }, { prenom: 'X', nom: 'Y', telephone: '+33699999999' }))
      .toEqual({});
  });
  it('jamais l’e-mail, même s’il est fourni', () => {
    const patch = champsVidesACompleter({ prenom: null, nom: null, telephone: null }, { prenom: 'A', nom: 'B', telephone: null, email: 'x@y.z' } as never);
    expect(patch).toEqual({ prenom: 'A', nom: 'B' });
    expect('email' in patch).toBe(false);
  });
  it('une saisie vide ne complète rien', () => {
    expect(champsVidesACompleter({ prenom: null, nom: null, telephone: null }, { prenom: ' ', nom: '', telephone: null })).toEqual({});
  });
});

describe('consentements', () => {
  it('accordé et valable sur le compte → pas redemandé ; sinon proposé', () => {
    expect(consentementDejaValable(COMPLET, 'recontact_interne')).toBe(true);
    expect(consentementDejaValable(COMPLET, 'email_marketing')).toBe(false);
  });
  it('non connecté → toujours proposé (rien ne change)', () => {
    expect(consentementDejaValable(null, 'recontact_interne')).toBe(false);
  });
});

describe('lecture de la réponse GET /api/internaute/coordonnees', () => {
  it('non connecté / illisible → null', () => {
    expect(lireReponseCoordonnees({ connecte: false })).toBeNull();
    expect(lireReponseCoordonnees(null)).toBeNull();
    expect(lireReponseCoordonnees('x')).toBeNull();
  });
  it('connecté → valeurs nettoyées, finalités inconnues écartées', () => {
    expect(lireReponseCoordonnees({ connecte: true, prenom: ' Arno ', nom: '', email: 'a@example.com', telephone: null,
      consentementsValables: ['recontact_interne', 'inventee'], derniereResidence: '' }))
      .toEqual({ prenom: 'Arno', nom: null, email: 'a@example.com', telephone: null, consentementsValables: ['recontact_interne'], derniereResidence: null });
  });
});
