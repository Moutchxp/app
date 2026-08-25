import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, fmtM2 } from './TraceEmpriseRendu';
import type { VerdictCalage, VerdictVraisemblance, Boite } from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';
import { verdictProjectionBatiments } from '../../../../lib/permis/projectionBatiments';

const emprise = (over: Partial<EmpriseReconstruite> = {}): EmpriseReconstruite => ({
  id: 1, dossierId: 11434, corpsId: 1, libelle: '2D1', anneau: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  surfaceM2: 100, pieceId: 55, page: 2, calage: null, residuM: 0.3, creeLe: null, ...over,
});

describe('PROJ-2 — rendu pur', () => {
  it('BandeauCalage : sans calage → invite ; douteux → affiche « douteux » + raisons + résidu (jamais masqué)', () => {
    expect(renderToStaticMarkup(h(BandeauCalage, { calage: null, nbPaires: 0 }))).toContain('posez 2 points');
    const vc: VerdictCalage = { residuFitM: 0, ratioImplicite: 100, ratioDeclare: 1000, residuEchelleM: 3.2, ecartEchelleRelatif: 0.9, douteux: true, raisons: ['échelle du calage (1:100) éloignée de l’échelle déclarée (1:1000) de 90 %'] };
    const html = renderToStaticMarkup(h(BandeauCalage, { calage: vc, nbPaires: 2 }));
    expect(html).toContain('douteux');
    expect(html).toContain('data-douteux="true"');
    expect(html).toContain('1:100');
    expect(html).toContain('éloignée de l’échelle déclarée');
    expect(html).toContain('calage exact sur 2 points'); // on DIT que le résidu de fit est nul par construction
  });

  it('BandeauVraisemblance : 🔴 dépassement du terrain rendu en évidence, aire vive', () => {
    const v: VerdictVraisemblance = { depasseTerrain: true, empriseVsPlancher: 'grande', empriseAttendueM2: 300, messages: ['🔴 emprise 3000 m² SUPÉRIEURE au terrain 2887 m² : impossible, à revoir'] };
    const html = renderToStaticMarkup(h(BandeauVraisemblance, { aireM2: 3000, v }));
    expect(html).toContain(fmtM2(3000));
    expect(html).toContain('SUPÉRIEURE au terrain');
  });

  it('ListeEmprises : étiquette « reconstitution » + surface + résidu ; vide → message', () => {
    expect(renderToStaticMarkup(h(ListeEmprises, { emprises: [] }))).toContain('Aucune emprise reconstituée');
    const html = renderToStaticMarkup(h(ListeEmprises, { emprises: [emprise()] }));
    expect(html).toContain('2D1');
    expect(html).toContain('reconstitution');   // 🔴 jamais présentée comme une mesure
    expect(html).toContain('100 m²');
    expect(html).toContain('résidu');
  });

  it('statutBatiment : tracée prime sur ignorée, sinon en attente', () => {
    const emprises = [emprise({ corpsId: 1 })];
    expect(statutBatiment(1, emprises, [])).toBe('tracee');
    expect(statutBatiment(2, emprises, [{ corpsId: 2, motif: 'x' }])).toBe('ignoree');
    expect(statutBatiment(3, emprises, [])).toBe('attente');
    expect(statutBatiment(1, emprises, [{ corpsId: 1, motif: 'x' }])).toBe('tracee'); // tracée l'emporte
  });

  it('BandeauProjection : bloquant nomme le manquant ; passant en vert', () => {
    const bloque = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }, { corpsId: 2, repere: '2D2' }], [1], []);
    const hb = renderToStaticMarkup(h(BandeauProjection, { verdict: bloque }));
    expect(hb).toContain('data-peut-valider="false"');
    expect(hb).toContain('1 emprise tracée · 1 en attente');
    expect(hb).toContain('2D2'); // le manquant nommé
    const passe = verdictProjectionBatiments([{ corpsId: 1, repere: '2D1' }], [1], []);
    expect(renderToStaticMarkup(h(BandeauProjection, { verdict: passe }))).toContain('data-peut-valider="true"');
  });

  it('SchemaParcelleTrace : parcelle + emprise dessinées ; parcelle absente → motif', () => {
    expect(renderToStaticMarkup(h(SchemaParcelleTrace, { boite: null, parcelle: [], emprises: [], calageLambert: [] }))).toContain('Parcelle du permis absente');
    const boite: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: { minX: 0, maxX: 20, minY: 0, maxY: 20 } };
    const html = renderToStaticMarkup(h(SchemaParcelleTrace, { boite, parcelle: [[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]], emprises: [emprise()], calageLambert: [{ x: 5, y: 5 }] }));
    expect(html).toContain('<svg');
    expect(html).toContain('data-emprise="1"'); // l'emprise reconstituée est tracée
    expect((html.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2); // parcelle + emprise
  });
});
