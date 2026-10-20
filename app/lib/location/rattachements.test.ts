import { describe, expect, it } from 'vitest';
import { classerReprise, motRattachement, verifierRattachements } from './rattachements';

/**
 * 🔴 Arno (20/10/2026, migration 393) — garants et contacts rattachés aux locataires ; la reprise des cartes existantes.
 */
const G = { qualite: 'Garant' };
const C = { qualite: 'Conjoint' };

describe('verifierRattachements — « Garantit : » et « Contact de : »', () => {
  it('un seul locataire : tout lui est rattaché d’office, quoi que dise l’écran', () => {
    expect(verifierRattachements(undefined, [G, C], 1)).toEqual({ ok: true, valeurs: [
      { garant: true, garantit: [0], locataire: null }, { garant: false, garantit: [], locataire: 0 }] });
  });
  it('plusieurs : le garant garantit ceux qui sont cochés ; le contact suit le locataire choisi', () => {
    expect(verifierRattachements([{ garantit: [1, 0, 1] }, { locataire: 1 }], [G, C], 2)).toEqual({ ok: true, valeurs: [
      { garant: true, garantit: [0, 1], locataire: null }, { garant: false, garantit: [], locataire: 1 }] });
  });
  it('plusieurs, rien de reçu (écran d’avant) : rien n’est deviné — la carte restera « à rattacher »', () => {
    expect(verifierRattachements(undefined, [G, C], 2)).toEqual({ ok: true, valeurs: [
      { garant: true, garantit: [], locataire: null }, { garant: false, garantit: [], locataire: null }] });
  });
  it('un garant sans case cochée, ou un rang inconnu : refusé avant toute écriture', () => {
    expect(verifierRattachements([{ garantit: [] }], [G], 2)).toEqual({ ok: false, motif: 'Contact 1 : cochez au moins un locataire garanti.' });
    expect(verifierRattachements([{ garantit: [2] }], [G], 2)).toMatchObject({ ok: false });
    expect(verifierRattachements([{ locataire: 5 }], [C], 2)).toMatchObject({ ok: false });
  });
});

describe('motRattachement', () => {
  it('garantit / contact de / à rattacher à un locataire', () => {
    expect(motRattachement({ garant: true, locataires: ['A', 'B'] })).toBe('garantit A, B');
    expect(motRattachement({ garant: false, locataires: ['A'] })).toBe('contact de A');
    expect(motRattachement({ garant: true, locataires: [] })).toBe('à rattacher à un locataire');
  });
});

describe('classerReprise — proposée seulement pour UN bail en cours avec UN locataire', () => {
  it('le seul cas proposé', () => {
    expect(classerReprise({ lotId: 7, qualite: 'Garant' }, [{ bailId: 3, locataires: [9, 9] }]))
      .toEqual({ sorte: 'proposee', bailId: 3, locataireId: 9, garant: true });
  });
  it('tout le reste à la main : colocation, plusieurs baux, bien libre, carte sans bien', () => {
    expect(classerReprise({ lotId: 7, qualite: null }, [{ bailId: 3, locataires: [9, 10] }])).toEqual({ sorte: 'main', motif: 'colocation' });
    expect(classerReprise({ lotId: 7, qualite: null }, [{ bailId: 3, locataires: [9] }, { bailId: 4, locataires: [8] }])).toEqual({ sorte: 'main', motif: 'plusieurs_baux' });
    expect(classerReprise({ lotId: 7, qualite: null }, [])).toEqual({ sorte: 'main', motif: 'bien_libre' });
    expect(classerReprise({ lotId: null, qualite: null }, [])).toEqual({ sorte: 'main', motif: 'sans_bien' });
  });
});
