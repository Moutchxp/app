import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoutonCopierVue, apparenceBoutonCopier } from './BoutonCopier';

/**
 * CADA lot A — composant PARTAGÉ « Copier » (carte CADA + BlocDepot). L'interaction (clic → presse-papiers) n'est pas testable
 * en environnement node ; on éprouve le RENDU PUR (BoutonCopierVue) et l'apparence PURE : deux états visuels, le marquage « déjà
 * copié » ne dépendant PAS de la seule couleur (coche « ✓ » + mot « Copié » + aria-pressed).
 */
const h = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('CADA lot A — apparenceBoutonCopier (pure)', () => {
  it('non copié → libellé fourni, aria-pressed false', () => {
    expect(apparenceBoutonCopier(false, false, 'Copier ce champ')).toMatchObject({ texte: 'Copier ce champ', ariaPressed: false, marque: false });
  });
  it('copié → mot « Copié » (le mot porte l’info, la coche ✓ est décorative aria-hidden hors `texte`), aria-pressed true', () => {
    expect(apparenceBoutonCopier(true, false, 'Copier ce champ')).toMatchObject({ texte: 'Copié', ariaPressed: true, marque: true });
  });
  it('DEPOT-1 — libellé marqué configurable (« Texte copié » / « Numéro copié »)', () => {
    expect(apparenceBoutonCopier(true, false, 'Copier le texte', 'Texte copié').texte).toBe('Texte copié');
    expect(apparenceBoutonCopier(true, false, 'Copier le numéro de permis', 'Numéro copié').texte).toBe('Numéro copié');
    expect(apparenceBoutonCopier(false, false, 'Copier le texte', 'Texte copié').texte).toBe('Copier le texte'); // non marqué → libellé neutre
  });
});

describe('CADA lot A — BoutonCopierVue (rendu, identique partout où il est utilisé)', () => {
  it('état NEUTRE : libellé, aria-pressed="false", pas de coche', () => {
    const m = h(createElement(BoutonCopierVue, { marque: false, disabled: false, libelle: 'Copier le texte' }));
    expect(m).toContain('Copier le texte');
    expect(m).toContain('aria-pressed="false"');
    expect(m).not.toContain('✓');
  });
  it('état MARQUÉ : coche « ✓ » aria-hidden + mot « Copié » + aria-pressed="true" (accessible sans la couleur)', () => {
    const m = h(createElement(BoutonCopierVue, { marque: true, disabled: false, libelle: 'Copier le texte' }));
    expect(m).toContain('Copié');                    // le MOT porte l'information
    expect(m).toContain('aria-hidden="true"');       // la coche ✓ est décorative (non annoncée)
    expect(m).toContain('✓');
    expect(m).toContain('aria-pressed="true"');
  });
  it('DEPOT-1 — libellé marqué personnalisé rendu (pastille « Numéro copié »)', () => {
    const m = h(createElement(BoutonCopierVue, { marque: true, disabled: false, libelle: 'Copier le numéro de permis', libelleMarque: 'Numéro copié' }));
    expect(m).toContain('Numéro copié');
  });
  it('champ indisponible → bouton désactivé', () => {
    const m = h(createElement(BoutonCopierVue, { marque: false, disabled: true, libelle: 'Copier ce champ' }));
    expect(m).toContain('disabled');
  });
});
