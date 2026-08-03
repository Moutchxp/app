import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelecteurCanal, ChampsProtocole } from './ContactRendu';

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

describe('S18 — ChampsProtocole (protocole par commune)', () => {
  const rnd = (tel: string, resp: string, date: string | null) =>
    renderToStaticMarkup(createElement(ChampsProtocole, { telephone: tel, responsableNom: resp, protocoleVerifieLe: date, onTelephone: () => {}, onResponsable: () => {} }));

  it('date de vérification en lecture seule quand présente + saisies téléphone/responsable pré-remplies', () => {
    const h = rnd('01 23 45 67 89', 'Charles Chenel', '2026-08-03');
    expect(h).toContain('Protocole vérifié le');
    expect(h).toContain('2026-08-03');
    expect(h).toContain('01 23 45 67 89');
    expect(h).toContain('Charles Chenel');
    expect(h).toContain('aria-label="Téléphone du service urbanisme"');
    expect(h).toContain('aria-label="Responsable du service"');
  });

  it('sans date de vérification → aucune ligne « vérifié le »', () => {
    expect(rnd('', '', null)).not.toContain('Protocole vérifié le');
  });
});
