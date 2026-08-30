import { describe, it, expect } from 'vitest';
import { apparierSortant, type SortantComplet, type FilCible } from './captureSortants';

/**
 * FIL-C — logique PURE d'appariement d'un sortant à un fil suivi. RÈGLE = LES DEUX conditions (fil ET destinataire mairie), jamais
 * une seule ; en cas de doute on ne capture pas (→ null).
 */
const sortant = (over: Partial<SortantComplet> = {}): SortantComplet => ({
  messageId: '<out-1@nous.fr>', inReplyTo: '<m7@mairie.fr>', references: [], destinataires: ['urba@mairie.fr'],
  objet: 'Re: complément', corpsTexte: 'voici les pièces', envoyeLe: '2026-08-20T10:00:00.000Z', ...over,
});
const fil = (over: Partial<FilCible> = {}): FilCible => ({
  demandeId: 154, messageIds: ['<m7@mairie.fr>', '<init@nous.fr>'], mairieAdresses: ['urba@mairie.fr', 'dest@mairie.fr'], ...over,
});

describe('FIL-C — apparierSortant (pur)', () => {
  it('sortant apparié au fil ET adressé à la mairie → capturé (demandeId + destinataire apparié)', () => {
    expect(apparierSortant(sortant(), [fil()])).toEqual({ demandeId: 154, destinataire: 'urba@mairie.fr' });
  });

  it('apparié via References (pas In-Reply-To) → capturé', () => {
    expect(apparierSortant(sortant({ inReplyTo: null, references: ['<autre@x>', '<m7@mairie.fr>'] }), [fil()])).toEqual({ demandeId: 154, destinataire: 'urba@mairie.fr' });
  });

  it('adressé à un TIERS (fil correct, mais To sans la mairie) → ignoré (null)', () => {
    expect(apparierSortant(sortant({ destinataires: ['tiers@autre.fr'] }), [fil()])).toBeNull();
  });

  it('sans en-tête de fil (ni In-Reply-To ni References) → ignoré (null)', () => {
    expect(apparierSortant(sortant({ inReplyTo: null, references: [] }), [fil()])).toBeNull();
  });

  it('en-tête de fil qui ne cite aucun Message-ID du fil → ignoré (null)', () => {
    expect(apparierSortant(sortant({ inReplyTo: '<inconnu@x>', references: [] }), [fil()])).toBeNull();
  });

  it('appariement via une adresse mairie DÉRIVÉE d’un reçu (pas le dest_email) → capturé', () => {
    const f = fil({ mairieAdresses: ['dest@mairie.fr', 'lauriane.pangui@mairie.fr'] });
    expect(apparierSortant(sortant({ destinataires: ['lauriane.pangui@mairie.fr'] }), [f])).toEqual({ demandeId: 154, destinataire: 'lauriane.pangui@mairie.fr' });
  });

  it('insensible à la casse et aux chevrons (Message-ID + adresse)', () => {
    expect(apparierSortant(sortant({ inReplyTo: 'm7@mairie.fr', destinataires: ['URBA@Mairie.FR'] }), [fil()])).toEqual({ demandeId: 154, destinataire: 'urba@mairie.fr' });
  });

  it('plusieurs fils : renvoie CELUI qui matche fil ET mairie', () => {
    const autre = fil({ demandeId: 999, messageIds: ['<zzz@x>'], mairieAdresses: ['x@x.fr'] });
    expect(apparierSortant(sortant(), [autre, fil()])).toEqual({ demandeId: 154, destinataire: 'urba@mairie.fr' });
  });

  it('aucun fil → null', () => {
    expect(apparierSortant(sortant(), [])).toBeNull();
  });
});
