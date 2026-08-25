import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { BandeauCalage, BandeauVraisemblance, ListeEmprises, SchemaParcelleTrace, BandeauProjection, statutBatiment, fmtM2, affichageTrace, SelecteurPiecePlan, grouperPieces, etiquettePiecePlan, construireBandePlans, bornerIndex, indexSuivant, indexPrecedent, libellePlan, travailEnCours, BandePlans, type PiecePlan } from './TraceEmpriseRendu';
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

describe('PROJ-3d — sélecteur de pièce : plans de masse proposés en tête, repli garanti', () => {
  const pieces: PiecePlan[] = [
    { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', propose: true, pagePlan: 1, echelle: '1:1000', confirme: true },
    { id: 60, nomFichier: 'PC2.2_Plan_de_masse_existant.pdf', propose: true, pagePlan: 1, echelle: null, confirme: true },
    { id: 70, nomFichier: 'PC4_Notice.pdf', propose: false },
    { id: 71, nomFichier: 'CERFA.pdf', propose: false },
  ];
  it('grouperPieces sépare proposées / autres', () => {
    const { proposees, autres } = grouperPieces(pieces);
    expect(proposees.map((p) => p.id)).toEqual([55, 60]);
    expect(autres.map((p) => p.id)).toEqual([70, 71]);
  });
  it('etiquettePiecePlan ajoute page + échelle si confirmées', () => {
    expect(etiquettePiecePlan(pieces[0])).toContain('p.1');
    expect(etiquettePiecePlan(pieces[0])).toContain('1:1000');
    expect(etiquettePiecePlan(pieces[2])).toBe('PC4_Notice.pdf'); // pas de page → nom seul
  });
  it('rend DEUX optgroups ; TOUTES les pièces restent présentes (repli)', () => {
    const html = renderToStaticMarkup(h(SelecteurPiecePlan, { pieces, pieceId: 55, onChoisir: () => {} }));
    expect(html).toContain('Plans de masse proposés');
    expect(html).toContain('Toutes les autres pièces');
    // la page proposée figure dans le libellé du plan
    expect(html).toContain('p.1');
    // aucune pièce n'est masquée : les 4 ids sont là
    for (const id of [55, 60, 70, 71]) expect(html).toContain(`value="${id}"`);
    // le plan de masse est bien AVANT la notice dans le markup (proposées en tête)
    expect(html.indexOf('value="55"')).toBeLessThan(html.indexOf('value="70"'));
  });
  it('liste vide → option « aucune pièce PDF »', () => {
    const html = renderToStaticMarkup(h(SelecteurPiecePlan, { pieces: [], pieceId: null, onChoisir: () => {} }));
    expect(html).toContain('aucune pièce PDF');
  });
});

describe('PROJ-3e — bande de plans : feuilleter (fonctions pures)', () => {
  const pieces: PiecePlan[] = [
    { id: 55, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', propose: true, pagePlan: 1, echelle: '1:1000', confirme: true },
    { id: 60, nomFichier: 'PC2.2_Plan_de_masse_existant.pdf', propose: true, pagePlan: null, echelle: null, confirme: false },
    { id: 70, nomFichier: 'PC4_Notice.pdf', propose: false },
  ];
  it('construireBandePlans : uniquement les proposées, ordre conservé, page = pagePlan ?? 1', () => {
    const b = construireBandePlans(pieces);
    expect(b.map((p) => p.pieceId)).toEqual([55, 60]);     // la notice (non proposée) n'est PAS dans la bande
    expect(b[0].page).toBe(1);
    expect(b[1].page).toBe(1);                              // pagePlan null → page 1 (n'invente rien)
    expect(b[1].confirme).toBe(false);
  });
  it('navigation bornée : premier, suivant, précédent, un seul plan, liste vide', () => {
    expect(indexSuivant(0, 7)).toBe(1);
    expect(indexSuivant(6, 7)).toBe(6);                     // borne haute
    expect(indexPrecedent(0, 7)).toBe(0);                   // borne basse
    expect(indexPrecedent(3, 7)).toBe(2);
    expect(bornerIndex(5, 1)).toBe(0);                      // un seul plan
    expect(bornerIndex(0, 0)).toBe(0);                      // liste vide
  });
  it('libellePlan : nom + échelle si présente', () => {
    expect(libellePlan({ pieceId: 1, page: 1, nomFichier: 'PC2.pdf', echelle: '1:500', confirme: true })).toBe('PC2.pdf · échelle 1:500');
    expect(libellePlan({ pieceId: 1, page: 1, nomFichier: 'PC2.pdf', echelle: null, confirme: true })).toBe('PC2.pdf');
  });
  it('travailEnCours : un calage OU un tracé commencé ⇒ confirmation requise', () => {
    expect(travailEnCours(0, 0)).toBe(false);
    expect(travailEnCours(1, 0)).toBe(true);   // un point de calage posé
    expect(travailEnCours(0, 2)).toBe(true);   // un tracé commencé
  });
  it('BandePlans : indicateur « plan i sur n », bornes désactivées, bande vide → repli', () => {
    const bande = construireBandePlans(pieces);
    const h0 = renderToStaticMarkup(h(BandePlans, { bande, index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(h0).toContain('plan 1 sur 2');
    expect(h0).toMatch(/‹ précédent<\/button>/);           // rendu
    // au premier plan, « précédent » est désactivé
    expect(h0).toMatch(/disabled[^>]*aria-label="Plan précédent"|aria-label="Plan précédent"[^>]*disabled/);
    const vide = renderToStaticMarkup(h(BandePlans, { bande: [], index: 0, onPrecedent: () => {}, onSuivant: () => {} }));
    expect(vide).toContain('voir toutes les pièces du dossier');
  });
});

describe('PROJ-3b-fix — affichageTrace : « aucun bâtiment » n’est PAS un échec de chargement (pur)', () => {
  it('chargement en cours → jamais « 0 bâtiment »', () => {
    expect(affichageTrace('chargement', 0)).toBe('chargement');
    expect(affichageTrace('chargement', 3)).toBe('chargement');
  });
  it('échec → « indisponible », quel que soit le compte (jamais « aucun-batiment »)', () => {
    expect(affichageTrace('erreur', 0)).toBe('indisponible');
    expect(affichageTrace('erreur', 2)).toBe('indisponible');
  });
  it('succès + liste vide → « aucun-batiment » (le SEUL cas légitime)', () => {
    expect(affichageTrace('ok', 0)).toBe('aucun-batiment');
  });
  it('succès + liste non vide → « pret »', () => {
    expect(affichageTrace('ok', 2)).toBe('pret');
  });
});
