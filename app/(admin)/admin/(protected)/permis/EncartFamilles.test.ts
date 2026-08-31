import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EncartFamilles, SousSectionsPermis, type FamilleRendu } from './EncartFamilles';
import { LIBELLE_FAMILLE, type FamilleEncart, type OngletEncart } from '../../../../lib/permis/encartFamilles';

describe('LOT 30 (①) — titre de famille renommé', () => {
  it('« Complétude des pièces & relance mail » (libellé FIXE, source canonique unique)', () => {
    expect(LIBELLE_FAMILLE.completude).toBe('Complétude des pièces & relance mail');
  });
});

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

describe('UNIF-1 — SousSectionsPermis : 1 permis direct, N permis en sous-plis lazy', () => {
  const dossiers = (n: number) => Array.from({ length: n }, (_, i) => ({ dossierId: 100 + i, numDau: `PC${100 + i}` }));
  const rendreMarque = (id: number) => createElement('span', null, `RENDU_${id}`);
  const rendu = (n: number) => renderToStaticMarkup(createElement(SousSectionsPermis, { dossiers: dossiers(n), rendre: rendreMarque }));

  it('0 permis → rien', () => {
    expect(rendu(0)).toBe('');
  });
  it('1 permis → contenu DIRECT (aucun pli superflu, une seule requête au dépliage de la famille)', () => {
    const h = rendu(1);
    expect(h).toContain('RENDU_100'); // rendre appelé tout de suite
    expect(h).not.toContain('PC100'); // pas de titre de sous-pli
  });
  it('N permis → un sous-pli PAR permis (titre = n° permis), contenu NON rendu tant que non déplié (paresse)', () => {
    const h = rendu(3);
    expect(h).toContain('PC100'); expect(h).toContain('PC101'); expect(h).toContain('PC102'); // 3 titres
    expect(h).not.toContain('RENDU_100'); // rendre NON appelé → aucun appel lourd d'un coup
    expect(h).not.toContain('RENDU_101');
    expect(h).not.toContain('RENDU_102');
  });
});
