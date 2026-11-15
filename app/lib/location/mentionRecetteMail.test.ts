import { describe, expect, it } from 'vitest';
import { mentionRecette } from './mentionRecetteMail';

/**
 * 🔴 Arno (15/11/2026) — en recette, la carte du récapitulatif dit ce qui part VRAIMENT : « adresse remplacée en recette : envoyé à … au lieu
 * de l'adresse du locataire » (verrou du préavis de test), intercepté (garde de la recette), rien en production.
 */
const TEST = { testId: 7, createurEmail: 'a.jorel@sansvisavis.com' };
const REEL = { actif: true as const, adresse: 'a.jorel@sansvisavis.com' };
const SANS = { actif: false as const, demande: false as const };

describe('mention de recette sur une carte', () => {
  it('préavis de test en recette : la carte du locataire dit l’adresse réellement servie', () => {
    expect(mentionRecette({ a: ['a.jorel@sansvisavis.com'], cc: [] }, 'locataire', { perimetre: TEST, recette: true, envoiReel: REEL }))
      .toBe('Adresse remplacée en recette : envoyé à a.jorel@sansvisavis.com au lieu de l’adresse du locataire.');
  });
  it('préavis de test : le mail interne n’atteint que le créateur (les autres retirés) ; adressé sans lui : il ne part pas', () => {
    expect(mentionRecette({ a: ['a.jorel@sansvisavis.com', 'jb@sansvisavis.com'], cc: [] }, 'interne', { perimetre: TEST, recette: true, envoiReel: REEL }))
      .toBe('En recette : seul a.jorel@sansvisavis.com le reçoit (les autres destinataires sont retirés).');
    expect(mentionRecette({ a: ['jb@sansvisavis.com'], cc: [] }, 'interne', { perimetre: TEST, recette: true, envoiReel: REEL })).toContain('ne part pas');
  });
  it('vrai préavis en recette : le mail du locataire est intercepté ; celui adressé à la seule adresse permise part', () => {
    expect(mentionRecette({ a: ['locataire@exemple.test'], cc: [] }, 'locataire', { perimetre: null, recette: true, envoiReel: REEL }))
      .toBe('En recette : intercepté (boîte de test) — il n’atteint pas l’adresse du locataire.');
    expect(mentionRecette({ a: ['a.jorel@sansvisavis.com'], cc: [] }, 'interne', { perimetre: null, recette: true, envoiReel: REEL })).toBeNull();
    expect(mentionRecette({ a: ['a.jorel@sansvisavis.com'], cc: [] }, 'interne', { perimetre: null, recette: true, envoiReel: SANS })).toContain('intercepté');
  });
  it('production, aucun préavis de test : rien à dire', () => {
    expect(mentionRecette({ a: ['locataire@exemple.test'], cc: [] }, 'locataire', { perimetre: null, recette: false, envoiReel: SANS })).toBeNull();
  });
});
