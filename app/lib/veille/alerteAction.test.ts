import { describe, it, expect } from 'vitest';
import { sujetAction, composerCorpsAction, type ContexteAction } from './alerteAction';

/**
 * T7-B (cas ③) — logique PURE de l'alerte « ce message appelle une réponse ». Aucun réseau, aucune base : on éprouve seulement
 * le sujet et le corps composés.
 */
const CTX_RATTACHE: ContexteAction = { numDau: '0930012500081', autresPermis: [], communeNom: 'Aubervilliers' };
const CTX_NON_RATTACHE: ContexteAction = { numDau: null, autresPermis: [], communeNom: null };
const baseCorps = { deAdresse: 'urba@mairie.fr', deNom: 'Service urbanisme', objet: 'Complément d’information', recuLe: '2026-08-12T09:00:00.000Z', corpsTexte: 'Merci de préciser la surface.' };

describe('T7-B — sujetAction', () => {
  it('rattaché → le n° de permis dans l’objet', () => {
    expect(sujetAction(CTX_RATTACHE)).toContain('N°0930012500081');
    expect(sujetAction(CTX_RATTACHE)).toContain('appelle une réponse');
  });
  it('non rattaché → « permis à identifier », jamais de n° inventé', () => {
    const s = sujetAction(CTX_NON_RATTACHE);
    expect(s).toContain('permis à identifier');
    expect(s).not.toMatch(/N°\d/);
  });
});

describe('T7-B — composerCorpsAction', () => {
  it('dit que ce n’est ni un accusé ni des documents, et invite à répondre à la mairie', () => {
    const c = composerCorpsAction({ ctx: CTX_RATTACHE, ...baseCorps });
    expect(c).toContain('ni un accusé de réception ni l’envoi des documents');
    expect(c).toContain('RÉPONSE de votre part');
    expect(c).toContain('Permis concerné : N°0930012500081 (Aubervilliers)');
  });
  it('reproduit le message d’origine (de / objet / reçu le / corps)', () => {
    const c = composerCorpsAction({ ctx: CTX_RATTACHE, ...baseCorps });
    expect(c).toContain('Message d’origine de la mairie');
    expect(c).toContain('Service urbanisme <urba@mairie.fr>');
    expect(c).toContain('Objet : Complément d’information');
    expect(c).toContain('Merci de préciser la surface.');
  });
  it('autres permis de la même demande listés dans le corps', () => {
    const c = composerCorpsAction({ ctx: { numDau: 'A', autresPermis: ['B', 'C'], communeNom: null }, ...baseCorps });
    expect(c).toContain('Autres permis de la même demande : N°B, N°C');
  });
  it('non rattaché → invite à identifier/rattacher, aucun permis affirmé', () => {
    const c = composerCorpsAction({ ctx: CTX_NON_RATTACHE, ...baseCorps });
    expect(c).toContain('n’a PAS pu être rattaché à un permis');
    expect(c).not.toContain('Permis concerné');
  });
  it('corps vide → mention explicite (HTML à consulter), jamais un blanc muet', () => {
    const c = composerCorpsAction({ ctx: CTX_RATTACHE, ...baseCorps, corpsTexte: null });
    expect(c).toContain('message d’origine en HTML');
  });
});
