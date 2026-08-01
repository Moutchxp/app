import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BandeauEligibilite, LigneCollaborateur, type CollaborateurLigne, type Eligibilite } from './CollaborateursRendu';

const tr = (c: CollaborateurLigne) => renderToStaticMarkup(createElement('table', null, createElement('tbody', null, createElement(LigneCollaborateur, { c, onToggle: () => {} }))));
const base: CollaborateurLigne = { id: 1, nom: 'Dupont', prenom: 'Jean', fonction: 'chargé de recherche', email: 'jean@x.fr', actif: true, nbPC: 0, nbPD: 0, nbEnAttente: 0 };

describe('S8a — rendu Collaborateurs', () => {
  it('compteurs à ZÉRO rendus « 0 », jamais absents (rappel S12b) ; actif → bouton « désactiver »', () => {
    const h = tr(base);
    expect(h).toContain('Jean Dupont');
    expect(h).toContain('>0<'); // un décompte 0 est bien rendu
    expect(h).toContain('désactiver');
  });

  it('fonction absente (facultative) → « non renseignée », jamais un tiret muet', () => {
    const h = tr({ ...base, fonction: '' });
    expect(h).toContain('non renseignée');
    expect(h).toContain('Jean Dupont');
  });

  it('collaborateur désactivé → badge « désactivé » + bouton « réactiver »', () => {
    const h = tr({ ...base, actif: false, nbPC: 12, nbPD: 3 });
    expect(h).toContain('désactivé');
    expect(h).toContain('réactiver');
    expect(h).toContain('12');
  });

  it('bandeau d’éligibilité : compte les éligibles et NOMME les inaptes', () => {
    const e: Eligibilite = { nbEligibles: 1, nbTotal: 2, inaptes: [{ id: 2, nom: 'Claire Martin', raisons: ['e-mail : format invalide'] }] };
    const h = renderToStaticMarkup(createElement(BandeauEligibilite, { eligibilite: e }));
    expect(h).toContain('1 collaborateur(s) éligible(s)');
    expect(h).toContain('Claire Martin');
    expect(h).toContain('e-mail : format invalide');
  });

  it('bandeau tout éligible → vert, sans liste d’inaptes', () => {
    const h = renderToStaticMarkup(createElement(BandeauEligibilite, { eligibilite: { nbEligibles: 3, nbTotal: 3, inaptes: [] } }));
    expect(h).toContain('3 collaborateur(s) éligible(s)');
    expect(h).toContain('var(--color-svv-green-ink)');
  });
});
