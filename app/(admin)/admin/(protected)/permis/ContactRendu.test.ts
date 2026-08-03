import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelecteurCanal } from './ContactRendu';

const rendu = (canal: 'formulaire' | 'email' | 'courrier' | 'inconnu', suggestion: boolean) =>
  renderToStaticMarkup(createElement(SelecteurCanal, { canal, suggestionTeleservice: suggestion, onCanal: () => {} }));

describe('S17 — SelecteurCanal (rendu)', () => {
  it('les options sont dans l’ordre demandé : formulaire → email → courrier → inconnu', () => {
    const h = rendu('email', false);
    const iForm = h.indexOf('value="formulaire"');
    const iMail = h.indexOf('value="email"');
    const iCour = h.indexOf('value="courrier"');
    const iInc = h.indexOf('value="inconnu"');
    expect(iForm).toBeGreaterThanOrEqual(0);
    expect(iForm).toBeLessThan(iMail);
    expect(iMail).toBeLessThan(iCour);
    expect(iCour).toBeLessThan(iInc);
  });

  it('téléservice connu → mention de présélection visible (suggestion, pas verrou)', () => {
    const h = rendu('formulaire', true);
    expect(h).toContain('Un téléservice est connu pour cette commune');
    expect(h).toContain('présélectionné');
  });

  it('pas de téléservice connu → aucune mention de présélection', () => {
    expect(rendu('inconnu', false)).not.toContain('Un téléservice est connu');
  });

  it('l’aide contextuelle rappelle que courrier/inconnu ne produisent aucune demande', () => {
    expect(rendu('email', false)).toContain('ne produisent aucune demande');
  });
});
