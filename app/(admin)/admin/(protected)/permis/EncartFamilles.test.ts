import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EncartFamilles, type FamilleRendu } from './EncartFamilles';
import type { FamilleEncart, OngletEncart } from '../../../../lib/permis/encartFamilles';

/** Famille de test : titre reconnaissable + contenu marqué (pour prouver la PARESSE : le contenu ne doit PAS être rendu replié). */
const fam = (cle: FamilleEncart, nonVide: boolean): FamilleRendu => ({
  cle, nonVide, titre: `TITRE_${cle}`, contenu: () => createElement('span', null, `CONTENU_${cle}`),
});
const rendu = (onglet: OngletEncart, familles: FamilleRendu[]) =>
  renderToStaticMarkup(createElement(EncartFamilles, { onglet, familles }));

describe('UNIF-0 — EncartFamilles : applique la règle d’affichage + reproduit l’encart replié', () => {
  const TOUTES: FamilleEncart[] = ['suivi_actions', 'completude', 'historique', 'caracteristiques', 'batiments', 'pieces'];

  it('En cours, tout vide → seul « Suivi et actions » (remplissable) est rendu ; les familles vides sont ABSENTES', () => {
    const h = rendu('en_cours', TOUTES.map((f) => fam(f, false)));
    expect(h).toContain('TITRE_suivi_actions');
    for (const f of ['completude', 'historique', 'caracteristiques', 'batiments', 'pieces']) {
      expect(h).not.toContain(`TITRE_${f}`); // ni grisée, ni « (vide) » : totalement absente
    }
  });

  it('En cours, une famille non vide → elle apparaît en plus du suivi', () => {
    const h = rendu('en_cours', [fam('suivi_actions', true), fam('completude', true), fam('historique', false)]);
    expect(h).toContain('TITRE_suivi_actions');
    expect(h).toContain('TITRE_completude');
    expect(h).not.toContain('TITRE_historique');
  });

  it('Analyse : « Suivi et actions » (absente) n’est JAMAIS rendu, même non vide ; le contenu remplissable oui', () => {
    const h = rendu('analyse', [fam('suivi_actions', true), fam('completude', false)]);
    expect(h).not.toContain('TITRE_suivi_actions');
    expect(h).toContain('TITRE_completude'); // remplissable → affichée même vide
  });

  it('PARESSE (PERF-1) : replié, le CONTENU des familles n’est pas rendu (seuls les titres)', () => {
    const h = rendu('en_cours', [fam('suivi_actions', true), fam('completude', true)]);
    expect(h).toContain('TITRE_suivi_actions');
    expect(h).not.toContain('CONTENU_suivi_actions'); // render-prop non évaluée tant que le bloc n’est pas déplié
    expect(h).not.toContain('CONTENU_completude');
  });

  it('aucune famille à afficher → rend null (pas d’encart vide)', () => {
    expect(rendu('en_cours', [fam('completude', false)])).toBe(''); // completude vide en En cours → rien
  });
});
