import { describe, it, expect } from 'vitest';
import { composerDestinatairesCommune, type SourcesAdressesCommune } from './destinatairesCommune';

/**
 * LOT 20 — cœur PUR de la composition des destinataires (sans réseau, point 11). On prouve : dest_email toujours en tête, dédup
 * insensible à la casse, exclusion des no-reply / mailer-daemon / postmaster / non-adresses. AUCUN envoi.
 */
const src = (over: Partial<SourcesAdressesCommune> = {}): SourcesAdressesCommune => ({ destEmail: null, contactsConfirmes: [], prada: [], repondants: [], ...over });

describe('composerDestinatairesCommune', () => {
  it('cas Aubervilliers : dest_email + répondant réel = 2 adresses, dest_email en tête', () => {
    const l = composerDestinatairesCommune(src({
      destEmail: 'urba-reglementaire@mairie-aubervilliers.fr',
      contactsConfirmes: ['urba-reglementaire@mairie-aubervilliers.fr'], // même que dest → dédupliqué
      repondants: ['lauriane.pangui@mairie-aubervilliers.fr'],
    }));
    expect(l).toEqual(['urba-reglementaire@mairie-aubervilliers.fr', 'lauriane.pangui@mairie-aubervilliers.fr']);
  });

  it('dest_email TOUJOURS en première position, même s’il apparaît aussi dans une autre source', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'a@m.fr', contactsConfirmes: ['b@m.fr', 'a@m.fr'] }));
    expect(l[0]).toBe('a@m.fr');
    expect(l).toEqual(['a@m.fr', 'b@m.fr']);
  });

  it('dédup INSENSIBLE à la casse (A@M.fr == a@m.fr) — l’adresse déjà vue n’est pas re-servie', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'A@M.fr', repondants: ['a@m.fr'] }))).toEqual(['A@M.fr']);
  });

  it('exclut no-reply / donotreply / ne-pas-repondre', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', repondants: ['noreply@m.fr', 'ne-pas-repondre@m.fr', 'donotreply@m.fr', 'agent@m.fr'] }));
    expect(l).toEqual(['urba@m.fr', 'agent@m.fr']);
  });

  it('exclut mailer-daemon / postmaster (expéditeurs de rebond)', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', repondants: ['MAILER-DAEMON@m.fr', 'postmaster@m.fr'] }))).toEqual(['urba@m.fr']);
  });

  it('exclut ce qui n’est pas une adresse e-mail (URL de formulaire, vide, espaces)', () => {
    expect(composerDestinatairesCommune(src({ destEmail: 'urba@m.fr', contactsConfirmes: ['https://teleservice.fr/urba', '', '   '] }))).toEqual(['urba@m.fr']);
  });

  it('aucune source exploitable → liste vide', () => {
    expect(composerDestinatairesCommune(src())).toEqual([]);
    expect(composerDestinatairesCommune(src({ destEmail: '  ' }))).toEqual([]);
  });

  it('ordre des sources : dest_email → contacts confirmés → prada → répondants', () => {
    const l = composerDestinatairesCommune(src({ destEmail: 'd@m.fr', contactsConfirmes: ['c@m.fr'], prada: ['p@m.fr'], repondants: ['r@m.fr'] }));
    expect(l).toEqual(['d@m.fr', 'c@m.fr', 'p@m.fr', 'r@m.fr']);
  });
});
