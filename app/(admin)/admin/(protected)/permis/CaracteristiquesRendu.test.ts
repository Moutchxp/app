import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PastilleOrigineValeur, ChampMesureEditeur, EditeurParking, FaitsPermisBloc, MESSAGE_AUCUN_CORPS } from './CaracteristiquesRendu';
import { MESURES, type FaitsPermis } from './caracteristiquesForm';

/** N3-C — rendu PUR (node pur, renderToStaticMarkup) : origines, bornes lues de la base, NULL affiché vide, mention du sommet. */
const noop = () => {};
const sommet = MESURES.find((m) => m.estSommet)!;
const nbEtages = MESURES.find((m) => m.cle === 'nbEtages')!;

describe('N3-C — PastilleOrigineValeur : trois libellés distincts', () => {
  it('saisie / extraite / non renseignée', () => {
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: 'saisie' }))).toContain('saisie à la main');
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: 'extraite' }))).toContain('extraite');
    expect(renderToStaticMarkup(createElement(PastilleOrigineValeur, { origine: null }))).toContain('non renseignée');
  });
});

describe('N3-C — ChampMesureEditeur', () => {
  it('valeur VIDE → input vide (jamais 0), bornes lues de la base affichées, origine « non renseignée »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('value=""');            // vide, pas 0
    expect(h).not.toContain('value="0"');
    expect(h).toContain('0 et 70');             // bornes de la base
    expect(h).toContain('non renseignée');
  });

  it('valeur 0 → affichée « 0 » avec origine « saisie »', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '0', origine: 'saisie', onValeur: noop }));
    expect(h).toContain('value="0"');
    expect(h).toContain('saisie à la main');
  });

  it('le SOMMET est signalé (★) et dit ce qu’il désigne (acrotère/faîtage, pas le dernier plancher)', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: sommet, bornes: { min: -50, max: 500 }, valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('★');
    expect(h).toContain('acrotère');
    expect(h).toContain('faîtage');
  });

  it('erreur au niveau du champ (role=alert)', () => {
    const h = renderToStaticMarkup(createElement(ChampMesureEditeur, { mesure: nbEtages, bornes: { min: 0, max: 70 }, valeur: '100', origine: null, erreur: 'valeur attendue entre 0 et 70', onValeur: noop }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('entre 0 et 70');
  });
});

describe('N3-C — EditeurParking : trois états dont « non renseigné »', () => {
  it('select à trois options', () => {
    const h = renderToStaticMarkup(createElement(EditeurParking, { valeur: '', origine: null, onValeur: noop }));
    expect(h).toContain('non renseigné');
    expect(h).toContain('>oui<');
    expect(h).toContain('>non<');
  });
});

describe('N3-C — FaitsPermisBloc : lecture seule, surface seulement si présente', () => {
  const faits = (over: Partial<FaitsPermis> = {}): FaitsPermis => ({
    numDau: '07512025V0035', type: 'PC', communeNom: 'Paris', codeInsee: '75056', adresse: '3 av. Benoît Frachon',
    natureTravaux: 'Construction neuve', dateAutorisation: '2026-03-13', surfaceCreee: null, ...over,
  });
  it('affiche les faits ; PAS de ligne surface si absente', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits() }));
    expect(h).toContain('07512025V0035');
    expect(h).toContain('Construction neuve');
    expect(h).toContain('lecture seule');
    expect(h).not.toContain('Surface créée');
  });
  it('affiche la surface quand elle existe', () => {
    const h = renderToStaticMarkup(createElement(FaitsPermisBloc, { faits: faits({ surfaceCreee: '13032' }) }));
    expect(h).toContain('Surface créée');
    expect(h).toContain('13032 m²');
  });
  it('message « aucun corps » exporté', () => {
    expect(MESSAGE_AUCUN_CORPS).toContain('Aucun corps');
  });
});
