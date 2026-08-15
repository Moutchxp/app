import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PastilleOrigineValeur, PastilleConfiance, ChampMesureEditeur, EditeurParking, FaitsPermisBloc, MESSAGE_AUCUN_CORPS } from './CaracteristiquesRendu';
import { MESURES, type FaitsPermis } from './caracteristiquesForm';
import type { JournalRetenu } from '../../../../lib/permis/journalLecture';

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

describe('N5-D — confiance, réserve et provenance à côté de la valeur extraite', () => {
  const RESERVE = 'la cote la plus haute des planches peut appartenir à un bâtiment voisin — les coupes et façades figurent le contexte bâti';
  const journal = (over: Partial<JournalRetenu> = {}): JournalRetenu => ({
    confiance: 'a_verifier', reserve: RESERVE, provenances: [{ piece: 'PC3.pdf', page: 2 }], ...over,
  });
  const rendre = (props: Parameters<typeof ChampMesureEditeur>[0]) => renderToStaticMarkup(createElement(ChampMesureEditeur, props));
  const base = { mesure: sommet, bornes: { min: -50, max: 500 }, valeur: '89.46', onValeur: noop } as const;

  it('PastilleConfiance : deux libellés distincts', () => {
    expect(renderToStaticMarkup(createElement(PastilleConfiance, { confiance: 'a_verifier' }))).toContain('à vérifier');
    expect(renderToStaticMarkup(createElement(PastilleConfiance, { confiance: 'confirmee' }))).toContain('corroborée');
  });

  it("extraite + a_verifier + réserve → origine, confiance ET réserve affichées, distinctement", () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal() });
    expect(h).toContain('extraite');       // origine (pastille pleine)
    expect(h).toContain('à vérifier');     // confiance (pastille contour) — axe différent
    expect(h).toContain('appartenir à un bâtiment voisin'); // réserve en toutes lettres
  });

  it('extraite + confirmee SANS réserve → confiance affichée, aucune réserve inventée', () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal({ confiance: 'confirmee', reserve: null }) });
    expect(h).toContain('corroborée');
    expect(h).not.toContain('appartenir à un bâtiment voisin');
    expect(h).not.toContain('à vérifier');
  });

  it("valeur 'saisie' → NI confiance NI réserve, même si un journal est fourni", () => {
    const h = rendre({ ...base, origine: 'saisie', journal: journal() });
    expect(h).toContain('saisie à la main');
    expect(h).not.toContain('à vérifier');
    expect(h).not.toContain('corroborée');
    expect(h).not.toContain('appartenir à un bâtiment voisin');
  });

  it('champ VIDE (origine null, aucun journal) → rien, surtout pas de pastille de confiance orpheline', () => {
    const h = rendre({ ...base, valeur: '', origine: null });
    expect(h).toContain('non renseignée');
    expect(h).not.toContain('à vérifier');
    expect(h).not.toContain('corroborée');
    expect(h).not.toContain('provenance');
  });

  it('provenance (pièce, page) atteignable et exacte', () => {
    const h = rendre({ ...base, origine: 'extraite', journal: journal({ provenances: [{ piece: 'PC3.pdf', page: 2 }, { piece: 'PC5.pdf', page: 4 }] }) });
    expect(h).toContain('provenance (2 pièces)');
    expect(h).toContain('PC3.pdf p.2');
    expect(h).toContain('PC5.pdf p.4');
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
