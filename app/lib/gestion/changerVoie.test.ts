import { describe, expect, it } from 'vitest';
import { changerDeVoie, estBasculable, type OrigineVoies } from './changerVoie';
import { preparerBrouillon, type ContexteRedaction } from './redaction';

/**
 * LOT REPONDRE-TRANSFERER-SANS-PERTE — la règle pure du changement de mode. Le garde-fou À L'ÉCRAN (texte, pièce,
 * destinataire manuel, enchaînement des quatre modes) vit dans `Redaction.changerVoie.test.ts`.
 */
const CTX: ContexteRedaction = { adresseGestion: 'gestion@exemple.test', signature: 'Service Gestion' };
const ORIGINE: OrigineVoies = {
  message: {
    messageId: 7, de: 'locataire@exemple.test', deNom: 'Mme Locataire', objet: 'Fuite salle de bain',
    corps: 'Bonjour, il y a une fuite.',
    destA: [{ adresse: 'gestion@exemple.test' }, { adresse: 'proprio@exemple.test' }],
    destCc: [{ adresse: 'syndic@exemple.test' }],
  },
};
const ne = (voie: 'repondre' | 'repondre_tous' | 'transferer') => preparerBrouillon(voie, ORIGINE.message, CTX);

describe('changerDeVoie — la part de l’application est recalculée, celle de la personne est gardée', () => {
  it('Répondre → Répondre à tous : l’expéditeur reste, les autres destinataires arrivent en Cc, sans nous', () => {
    const r = changerDeVoie(ne('repondre'), 'repondre_tous', ORIGINE, CTX);
    expect(r.a).toEqual(['locataire@exemple.test']);
    expect(r.cc).toEqual(['proprio@exemple.test', 'syndic@exemple.test']);
    expect(r.objet).toBe('Re: Fuite salle de bain');
  });

  it('Répondre à tous → Transférer : destinataires automatiques vidés, objet « Tr: », citation gardée', () => {
    const tous = ne('repondre_tous');
    const r = changerDeVoie(tous, 'transferer', ORIGINE, CTX);
    expect([...r.a, ...r.cc, ...r.cci]).toEqual([]);
    expect(r.objet).toBe('Tr: Fuite salle de bain');
    expect(r.citation).toBe(tous.citation);
  });

  it('🔴 les destinataires ajoutés à la main restent À LEUR PLACE, dans tous les modes', () => {
    let b = { ...ne('repondre'), a: ['locataire@exemple.test', 'artisan@exemple.test'], cci: ['avocat@exemple.test'] };
    for (const voie of ['repondre_tous', 'transferer', 'repondre', 'transferer', 'repondre_tous'] as const) {
      b = { ...b, ...changerDeVoie(b, voie, ORIGINE, CTX) };
      expect(b.a).toContain('artisan@exemple.test');
      expect(b.cci).toEqual(['avocat@exemple.test']);
    }
    expect(b.a).toEqual(['locataire@exemple.test', 'artisan@exemple.test']);
    expect(b.cc).toEqual(['proprio@exemple.test', 'syndic@exemple.test']);
  });

  it('🔴 revenir à Répondre ne retire que ce que l’application avait ajouté', () => {
    const tous = { ...ne('repondre_tous'), cc: ['proprio@exemple.test', 'syndic@exemple.test', 'notaire@exemple.test'] };
    const r = changerDeVoie(tous, 'repondre', ORIGINE, CTX);
    expect(r.a).toEqual(['locataire@exemple.test']);
    expect(r.cc).toEqual(['notaire@exemple.test']);
  });

  it('🔴 une adresse automatique RETIRÉE à la main ne revient jamais, même après plusieurs changements', () => {
    let b = { ...ne('repondre_tous'), cc: ['proprio@exemple.test'] }; // le syndic a été retiré exprès
    for (const voie of ['transferer', 'repondre', 'repondre_tous'] as const) {
      b = { ...b, ...changerDeVoie(b, voie, ORIGINE, CTX) };
      expect([...b.a, ...b.cc, ...b.cci]).not.toContain('syndic@exemple.test');
    }
    expect(b.cc).toEqual(['proprio@exemple.test']);
  });

  it('une adresse retirée puis remise à la main sort des retraits', () => {
    const b = { ...ne('repondre_tous'), cc: ['proprio@exemple.test'] };
    const t = { ...b, ...changerDeVoie(b, 'transferer', ORIGINE, CTX) };
    expect(t.retiresALaMain).toEqual(['syndic@exemple.test']);
    const remis = { ...t, cc: ['syndic@exemple.test'] };
    expect(changerDeVoie(remis, 'repondre_tous', ORIGINE, CTX).retiresALaMain).toEqual([]);
  });

  it('🔴 un objet retouché est gardé : seul le préfixe posé par l’application change', () => {
    const b = { ...ne('repondre'), objet: 'Re: Fuite salle de bain — devis joint' };
    const t = changerDeVoie(b, 'transferer', ORIGINE, CTX);
    expect(t.objet).toBe('Tr: Fuite salle de bain — devis joint');
    expect(changerDeVoie({ ...b, ...t }, 'repondre', ORIGINE, CTX).objet).toBe('Re: Fuite salle de bain — devis joint');
  });

  it('un objet d’origine qui porte déjà « RE: » fait l’aller-retour sans dommage', () => {
    const o: OrigineVoies = { message: { ...ORIGINE.message, objet: 'RE: Fuite' } };
    const b = { ...preparerBrouillon('repondre', o.message, CTX), objet: 'RE: Fuite urgente' };
    const t = { ...b, ...changerDeVoie(b, 'transferer', o, CTX) };
    expect(t.objet).toBe('Tr: RE: Fuite urgente');
    expect(changerDeVoie(t, 'repondre', o, CTX).objet).toBe('RE: Fuite urgente');
  });

  it('seuls Répondre, Répondre à tous et Transférer se basculent', () => {
    expect(['repondre', 'repondre_tous', 'transferer'].every((v) => estBasculable(v as never))).toBe(true);
    expect(estBasculable('nouveau')).toBe(false);
    expect(estBasculable('transferer_piece')).toBe(false);
  });
});
