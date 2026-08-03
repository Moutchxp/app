import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelecteurCanal, ChampsProtocole, SelecteurEmailType, BoutonOuvrirLien } from './ContactRendu';

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
  const rnd = (tel: string, resp: string, date: string | null, telStd = '') =>
    renderToStaticMarkup(createElement(ChampsProtocole, { telephone: tel, telephoneStandard: telStd, responsableNom: resp, protocoleVerifieLe: date, onTelephone: () => {}, onTelephoneStandard: () => {}, onResponsable: () => {} }));

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

describe('S19 — ChampsProtocole : deux téléphones DISTINCTS', () => {
  it('rend « Téléphone du service urbanisme » ET « Standard de la mairie » séparément', () => {
    const h = renderToStaticMarkup(createElement(ChampsProtocole, { telephone: '01 11 11 11 11', telephoneStandard: '01 22 22 22 22', responsableNom: 'Nom', protocoleVerifieLe: null, onTelephone: () => {}, onTelephoneStandard: () => {}, onResponsable: () => {} }));
    expect(h).toContain('aria-label="Téléphone du service urbanisme"');
    expect(h).toContain('aria-label="Standard de la mairie"');
    expect(h).toContain('Standard de la mairie');
    expect(h).toContain('01 11 11 11 11');
    expect(h).toContain('01 22 22 22 22');
  });
});

describe('S19 — SelecteurEmailType (nature de l’adresse)', () => {
  const r = (v: string) => renderToStaticMarkup(createElement(SelecteurEmailType, { emailType: v, onEmailType: () => {} }));
  it('rend les 4 valeurs (+ option « non renseignée ») en libellés français', () => {
    const h = r('');
    for (const val of ['urbanisme', 'accueil', 'prada', 'inconnu']) expect(h).toContain(`value="${val}"`);
    expect(h).toContain('service urbanisme');
    expect(h).toContain('accueil général de la mairie');
    expect(h).toContain('non renseignée');
  });
  it('« accueil » → mention d’information (jamais bloquante) ; autre valeur → pas de mention', () => {
    expect(r('accueil')).toContain('accueil général');
    expect(r('accueil')).toContain('moins bien orientée');
    expect(r('urbanisme')).not.toContain('moins bien orientée');
  });
});

describe('S19 — BoutonOuvrirLien', () => {
  it('URL valide → lien cliquable nouvel onglet (rel noopener noreferrer)', () => {
    const h = renderToStaticMarkup(createElement(BoutonOuvrirLien, { url: 'https://teleservice.paris.fr' }));
    expect(h).toContain('href="https://teleservice.paris.fr"');
    expect(h).toContain('target="_blank"');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).not.toContain('disabled');
  });
  it('URL vide → bouton DÉSACTIVÉ + raison affichée (jamais un bouton mort)', () => {
    const h = renderToStaticMarkup(createElement(BoutonOuvrirLien, { url: '' }));
    expect(h).toContain('disabled');
    expect(h).toContain('aucune URL de téléservice');
  });
  it('URL invalide → désactivé + raison', () => {
    const h = renderToStaticMarkup(createElement(BoutonOuvrirLien, { url: 'pas-une-url' }));
    expect(h).toContain('disabled');
    expect(h).toContain('URL invalide');
  });
});
