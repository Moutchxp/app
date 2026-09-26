import { describe, it, expect } from 'vitest';
import {
  adresseDe, estInterne, expediteurTransfere, reconnaitre, releverAdresses,
  type AdresseRelevee, type ContactConnu, type OccupationConnue,
} from './adressesMessage';

/**
 * LOT DRIVE-2-bis — LE RELEVÉ EXHAUSTIF DES ADRESSES, ÉPROUVÉ SANS RÉSEAU NI BASE.
 *
 * 🔒 Aucune donnée réelle : tout est inventé (domaine `fictif.fr`).
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI :
 *   ① chaque adresse garde son RÔLE — c'est lui qui permettra de reconstituer qui écrivait à qui ;
 *   ② l'expéditeur d'un mail TRANSFÉRÉ est lu dans le corps, mais PRUDEMMENT : au moindre doute, rien ;
 *   ③ nos adresses sont retenues et MARQUÉES, jamais employées comme clé ;
 *   ④ un locataire est rattaché au bien qu'il occupait À LA DATE DU MAIL, jamais à celui d'aujourd'hui.
 */

const GESTION = 'gestion@criterimmo.fr';

describe('🔴 ① extraire une adresse, sous toutes ses formes', () => {
  it('« Nom <adresse> », « <adresse> », « adresse » nue', () => {
    expect(adresseDe('Jean Dupont <jean@fictif.fr>')).toBe('jean@fictif.fr');
    expect(adresseDe('<jean@fictif.fr>')).toBe('jean@fictif.fr');
    expect(adresseDe('jean@fictif.fr')).toBe('jean@fictif.fr');
    expect(adresseDe('  JEAN@FICTIF.FR  ')).toBe('jean@fictif.fr');
  });

  it('🔴 ce qui est entre CHEVRONS l’emporte — un nom d’affichage peut contenir une autre adresse', () => {
    expect(adresseDe('contact@ancien.fr (ne plus utiliser) <vrai@fictif.fr>')).toBe('vrai@fictif.fr');
  });

  it('ce qui n’est pas une adresse rend null', () => {
    for (const non of ['', '   ', 'Jean Dupont', 'sans arobase', '@fictif.fr', 'jean@']) {
      expect(adresseDe(non), non).toBeNull();
    }
  });
});

describe('🔴 ③ nos adresses sont RETENUES, mais marquées « interne »', () => {
  it('gestion@, les deux domaines maison et le partenaire interne', () => {
    for (const a of ['gestion@criterimmo.fr', 'compta@criterimmo.fr', 'x@sansvisavis.com', 'y@mail.sansvisavis.com']) {
      expect(estInterne(a, GESTION), a).toBe(true);
    }
    expect(estInterne('adhoc@partenaire-fictif.fr', GESTION, ['adhoc@partenaire-fictif.fr'])).toBe(true);
    expect(estInterne('jean@fictif.fr', GESTION)).toBe(false);
  });

  it('elles figurent QUAND MÊME dans le relevé — elles font partie de l’échange', () => {
    const r = releverAdresses({
      de: 'gestion@criterimmo.fr', destA: ['jean@fictif.fr'], destCc: [], repondreA: [], corps: '',
    }, GESTION);
    expect(r.map((x) => x.adresse)).toEqual(['gestion@criterimmo.fr', 'jean@fictif.fr']);
    expect(r[0].interne).toBe(true);
    expect(r[1].interne).toBe(false);
  });
});

describe('🔴 ① chaque adresse garde son rôle', () => {
  const r = releverAdresses({
    de: 'Jean <jean@fictif.fr>',
    destA: ['gestion@criterimmo.fr', 'Claire <claire@fictif.fr>'],
    destCc: ['syndic@fictif.fr'],
    repondreA: ['jean.pro@fictif.fr'],
    corps: '',
  }, GESTION);

  it('expéditeur, destinataire, copie, répondre-à', () => {
    const par = (role: string) => r.filter((x) => x.role === role).map((x) => x.adresse);
    expect(par('expediteur')).toEqual(['jean@fictif.fr']);
    expect(par('destinataire')).toEqual(['gestion@criterimmo.fr', 'claire@fictif.fr']);
    expect(par('copie')).toEqual(['syndic@fictif.fr']);
    expect(par('repondre_a')).toEqual(['jean.pro@fictif.fr']);
  });

  it('l’adresse BRUTE est conservée, nom d’affichage compris', () => {
    expect(r.find((x) => x.adresse === 'jean@fictif.fr')?.adresseBrute).toBe('Jean <jean@fictif.fr>');
  });

  it('🔴 une même adresse sous DEUX rôles fait DEUX lignes — ce sont deux faits différents', () => {
    const d = releverAdresses({
      de: 'jean@fictif.fr', destA: [], destCc: [], repondreA: ['jean@fictif.fr'], corps: '',
    }, GESTION);
    expect(d).toHaveLength(2);
    expect(d.map((x) => x.role).sort()).toEqual(['expediteur', 'repondre_a']);
  });

  it('la même adresse deux fois dans le MÊME rôle ne fait qu’une ligne', () => {
    const d = releverAdresses({
      de: 'x@fictif.fr', destA: ['jean@fictif.fr', 'JEAN@fictif.fr', 'Jean <jean@fictif.fr>'],
      destCc: [], repondreA: [], corps: '',
    }, GESTION);
    expect(d.filter((x) => x.role === 'destinataire')).toHaveLength(1);
  });

  it('🔴 le Cci n’est PAS relevé : il ne fait pas partie de ce que les autres ont vu', () => {
    const m = { de: 'x@fictif.fr', destA: [], destCc: [], repondreA: [], corps: '' };
    expect(releverAdresses(m, GESTION).map((x) => x.role)).not.toContain('cci');
  });
});

describe('🔴 ② l’expéditeur d’un mail TRANSFÉRÉ, lu prudemment', () => {
  it('le format Gmail français', () => {
    const corps = 'Bonjour, voir ci-dessous.\n\n---------- Message transféré ----------\n'
      + 'De : Artisan Plomberie <artisan@fictif.fr>\nDate : 3 mars 2024\nObjet : Devis\n\nVoici le devis.';
    expect(expediteurTransfere(corps)).toEqual({ adresse: 'artisan@fictif.fr', brut: 'Artisan Plomberie <artisan@fictif.fr>' });
  });

  it('le format anglais, et « Message d’origine » d’Outlook', () => {
    expect(expediteurTransfere('---------- Forwarded message ---------\nFrom: a@fictif.fr\n')?.adresse).toBe('a@fictif.fr');
    expect(expediteurTransfere('-----Message d’origine-----\nDe : b@fictif.fr\n')?.adresse).toBe('b@fictif.fr');
    expect(expediteurTransfere('-----Original Message-----\nFrom: c@fictif.fr\n')?.adresse).toBe('c@fictif.fr');
  });

  it('🔴 SANS marqueur de transfert, on ne lit RIEN — même s’il y a une ligne « De : »', () => {
    expect(expediteurTransfere('De : quelquun@fictif.fr\nBonjour')).toBeNull();
    expect(expediteurTransfere('Bonjour,\n\nCordialement\nJean\nDe : jean@fictif.fr')).toBeNull();
  });

  it('🔴 un marqueur SANS ligne « De : » ne donne rien non plus', () => {
    expect(expediteurTransfere('---------- Message transféré ----------\nObjet : Devis\nBonjour')).toBeNull();
  });

  it('🔴 une ligne « De : » sans adresse lisible ne donne rien', () => {
    expect(expediteurTransfere('---------- Message transféré ----------\nDe : Service client\n')).toBeNull();
  });

  it('« Demande de devis » n’est pas une ligne « De : »', () => {
    expect(expediteurTransfere('---------- Message transféré ----------\nDemande de devis : a@fictif.fr\n')).toBeNull();
  });

  it('on ne lit que le PREMIER bloc — un fil transféré plusieurs fois en contient plusieurs', () => {
    const corps = '---------- Message transféré ----------\nDe : premier@fictif.fr\n\nBlabla\n'
      + '---------- Message transféré ----------\nDe : second@fictif.fr\n';
    expect(expediteurTransfere(corps)?.adresse).toBe('premier@fictif.fr');
  });

  it('une adresse qui traîne LOIN après le marqueur n’est pas prise pour l’expéditeur', () => {
    const corps = `---------- Message transféré ----------\nObjet : x\n${'texte '.repeat(400)}\nDe : tardif@fictif.fr`;
    expect(expediteurTransfere(corps)).toBeNull();
  });

  it('un corps vide ou absent ne casse rien', () => {
    expect(expediteurTransfere('')).toBeNull();
    expect(expediteurTransfere('   ')).toBeNull();
  });

  it('le transfert entre dans le relevé, avec son rôle propre', () => {
    const r = releverAdresses({
      de: 'gestion@criterimmo.fr', destA: ['jean@fictif.fr'], destCc: [], repondreA: [],
      corps: '---------- Message transféré ----------\nDe : artisan@fictif.fr\n',
    }, GESTION);
    expect(r.find((x) => x.role === 'transfere')?.adresse).toBe('artisan@fictif.fr');
  });
});

describe('🔴 ④ la DATE du mail décide du bien', () => {
  const contacts: ContactConnu[] = [
    { email: 'alice@fictif.fr', role: 'locataire', sujetId: 10 },
    { email: 'jean@fictif.fr', role: 'proprietaire', sujetId: 1, proprietaireCle: 'P1' },
  ];
  const occupations: OccupationConnue[] = [
    { locataireId: 10, lotCle: '100', proprietaireCle: 'P1', entree: '2019-02-01', sortie: '2022-08-31' },
    { locataireId: 10, lotCle: '101', proprietaireCle: 'P1', entree: '2023-03-01', sortie: null },
  ];
  const adr = (adresse: string, interne = false): AdresseRelevee =>
    ({ adresse, adresseBrute: adresse, role: 'expediteur', interne });

  it('un mail de 2021 rattache au bien occupé EN 2021', () => {
    const r = reconnaitre(adr('alice@fictif.fr'), '2021-05-04', contacts, occupations);
    expect(r).toMatchObject({ partie: 'locataire', lotCle: '100', locataireId: 10 });
    expect(r.motif).toContain('occupait ce bien à la date du mail');
  });

  it('un mail de 2024 rattache à l’autre bien', () => {
    expect(reconnaitre(adr('alice@fictif.fr'), '2024-06-15', contacts, occupations).lotCle).toBe('101');
  });

  it('🔴 un mail ENTRE les deux baux ne rattache à AUCUN lot, et le dit', () => {
    const r = reconnaitre(adr('alice@fictif.fr'), '2022-11-20', contacts, occupations);
    expect(r.partie).toBe('locataire');
    expect(r.lotCle).toBeNull();
    expect(r.motif).toContain('aucun bail en cours à la date du mail');
  });

  it('🔴 deux baux à la même date : aucun lot n’est tranché, mais le propriétaire commun est retenu', () => {
    const deux: OccupationConnue[] = [
      { locataireId: 10, lotCle: '100', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null },
      { locataireId: 10, lotCle: '101', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null },
    ];
    const r = reconnaitre(adr('alice@fictif.fr'), '2024-06-15', contacts, deux);
    expect(r.lotCle).toBeNull();
    expect(r.proprietaireCle).toBe('P1');
    expect(r.motif).toContain('2 biens');
  });

  it('un propriétaire est reconnu sans dépendre d’une date', () => {
    const r = reconnaitre(adr('jean@fictif.fr'), '1999-01-01', contacts, occupations);
    expect(r).toMatchObject({ partie: 'proprietaire', proprietaireCle: 'P1', lotCle: null });
  });

  it('🔴 une adresse INTERNE n’est jamais reconnue comme une partie, et le motif le dit', () => {
    const contactsPiege: ContactConnu[] = [{ email: GESTION, role: 'proprietaire', sujetId: 9, proprietaireCle: 'P9' }];
    const r = reconnaitre(adr(GESTION, true), '2024-01-01', contactsPiege, occupations);
    expect(r.partie).toBeNull();
    expect(r.motif).toContain('jamais employée comme clé');
  });

  it('une adresse inconnue de l’annuaire le dit, sans rien inventer', () => {
    const r = reconnaitre(adr('inconnu@ailleurs.fr'), '2024-01-01', contacts, occupations);
    expect(r).toMatchObject({ partie: null, lotCle: null, proprietaireCle: null });
    expect(r.motif).toContain('inconnue de l’annuaire');
  });
});
