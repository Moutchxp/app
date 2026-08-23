import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableauSources, GrilleCouverture, LigneContexte } from './SourcesRendu';
import { construireEtatSources, type LectureSource, type LectureDetection } from '../../../../lib/admin/sourcesFraicheur';

/**
 * FRAÎCHEUR DES DONNÉES — rendu PUR. Vérifie que l'écran AFFICHE fidèlement les règles d'honnêteté du modèle :
 * une ligne par source dans l'ordre, LiDAR « millésime inconnu » + « aucune procédure de réingestion », source vide
 * explicite, substitut jamais déguisé en millésime, couverture par département, ligne de contexte sur le verdict.
 */

const MAINTENANT = new Date('2026-08-23T09:00:00Z');

function lignes(over: Partial<Record<string, Partial<LectureSource>>> = {}, detections: LectureDetection[] = []) {
  const base: LectureSource[] = [
    { cle: 'lidar', millesime: null, substitut: 'millésime inconnu — 64 dalles MNT + 64 MNS', dateReference: null, vide: false, partielsParDept: ['92'] },
    { cle: 'bdtopo_bati', millesime: '2026-06-15', substitut: null, dateReference: '2026-06-15', vide: false, comptesParDept: { '75': 1, '77': 1, '92': 1 } },
    { cle: 'bdtopo_adresse', millesime: null, substitut: 'aucun millésime — dernière modification : 2026-03-20', dateReference: '2026-03-20', vide: false, comptesParDept: { '92': 169484 } },
    { cle: 'cadastre', millesime: '2026-06-01', substitut: null, dateReference: '2026-06-01', vide: false, comptesParDept: { '75': 78154, '93': 232874 } },
    { cle: 'sitadel', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false, comptesParDept: { '92': 5782 } },
    { cle: 'dila', millesime: '2026-08-03', substitut: null, dateReference: '2026-08-03', vide: false },
    { cle: 'prada', millesime: '2026-07', substitut: null, dateReference: '2026-07-01', vide: false },
    { cle: 'bdnb', millesime: null, substitut: 'aucun millésime en base — 191262 lignes (année de construction)', dateReference: null, vide: false },
  ];
  const lectures = base.map((l) => (over[l.cle] ? { ...l, ...over[l.cle] } : l));
  return construireEtatSources(lectures, MAINTENANT, detections);
}

const D = (o: Partial<LectureDetection>): LectureDetection =>
  ({ source: 'x', actif: true, verifieLe: '2026-08-22T09:00:00Z', succes: true, dernierSuccesLe: '2026-08-22T09:00:00Z', editionDistante: null, dateDistante: null, motif: null, ...o });

describe('TableauSources — une ligne par source, dans l’ordre', () => {
  it('affiche les 8 sources, LiDAR en tête', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    for (const nom of ['LiDAR HD', 'BD TOPO® bâtiment', 'BD TOPO® adresse', 'Cadastre', 'Sitadel', 'DILA', 'PRADA', 'BDNB']) {
      expect(h).toContain(nom);
    }
    expect(h.indexOf('LiDAR HD')).toBeLessThan(h.indexOf('BD TOPO® bâtiment'));
    expect(h.indexOf('Sitadel')).toBeLessThan(h.indexOf('BDNB'));
  });

  it('LiDAR → « millésime inconnu » + « aucune procédure de réingestion » (honnêteté principale)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('millésime inconnu');
    expect(h).toContain('aucune procédure de réingestion');
  });

  it('un substitut est signalé comme tel, jamais présenté en millésime', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('substitut, pas un millésime');
  });

  it('Sitadel surveillée (oui), les autres non ; réingestion automatique visible', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('oui');
    expect(h).toContain('npm run veille:run');
    expect(h).toContain('npm run bdtopo:import');
  });

  it('source vide → « aucune donnée en base », âge « — »', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({ lidar: { vide: true, partielsParDept: [] } }) }));
    expect(h).toContain('aucune donnée en base');
  });

  it('l’âge affiché est calculé (bâti 2026-06-15 → 69 j au 2026-08-23)', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('69 j');
    expect(h).toContain('inconnu'); // LiDAR / BDNB : aucune date
  });
});

describe('GrilleCouverture — présent / partiel / absent par département', () => {
  it('LiDAR partiel sur le 92, absent ailleurs ; libellés accessibles (pas la couleur seule)', () => {
    const h = renderToStaticMarkup(createElement(GrilleCouverture, { lignes: lignes() }));
    expect(h).toContain('92 : partiel');
    expect(h).toContain('75 : absent');
    expect(h).toContain('75 : présent'); // cadastre couvre le 75
  });

  it('ne montre QUE les sources spatiales (pas DILA/PRADA/BDNB)', () => {
    const h = renderToStaticMarkup(createElement(GrilleCouverture, { lignes: lignes() }));
    expect(h).toContain('LiDAR HD');
    expect(h).toContain('Cadastre');
    expect(h).not.toContain('PRADA');
  });
});

describe('LigneContexte — le verdict ne vit que là où le LiDAR existe', () => {
  it('énonce que seul le LiDAR entre dans le verdict', () => {
    const h = renderToStaticMarkup(createElement(LigneContexte, { lignes: lignes() }));
    expect(h).toContain('Seul le LiDAR entre dans le verdict');
    expect(h).toContain('92');
  });
});

describe('TableauSources — colonne « édition distante » (lot 2)', () => {
  it('mise à jour disponible → affiche le millésime distant', () => {
    const det = [D({ source: 'bdtopo_adresse', editionDistante: '2026-06-15', dateDistante: '2026-06-15' })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('mise à jour disponible');
    expect(h).toContain('2026-06-15');
  });

  it('ÉCHEC → « non vérifié depuis N j », JAMAIS « à jour »', () => {
    const det = [D({ source: 'cadastre', succes: false, verifieLe: '2026-08-23T09:00:00Z', dernierSuccesLe: '2026-08-16T09:00:00Z', motif: 'HTTP 500' })];
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes({}, det) }));
    expect(h).toContain('non vérifié depuis 7 j');
    // La cellule cadastre ne doit pas dire « à jour » sur un échec. (Le mot « jour » du texte « depuis 7 j » est admis ;
    // on interdit la locution « à jour ».)
    expect(h).not.toContain('à jour');
  });

  it('source non détectable (LiDAR) → « non vérifiable » avec motif', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('non vérifiable');
    expect(h).toContain('passage unique');
  });

  it('sources détectables portent un interrupteur « surveiller » ; les non détectables non', () => {
    const h = renderToStaticMarkup(createElement(TableauSources, { lignes: lignes() }));
    expect(h).toContain('Surveiller BD TOPO® bâtiment');
    expect(h).not.toContain('Surveiller LiDAR HD'); // non détectable → aucun interrupteur
  });
});
