import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { RecapProjectionRattachement } from './ProjectionRecapRattachement';
import type { EmpriseReconstruite, PolygoneBdTopo, ProvenanceEmprise } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';

// Parcelle carrée (≥ 3 sommets) → cadre calculable → schéma dessiné.
const PARCELLE = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
const carre = (dx: number, dy: number) => [{ x: dx, y: dy }, { x: dx + 20, y: dy }, { x: dx + 20, y: dy + 20 }, { x: dx, y: dy + 20 }];
// Bâti BD TOPO existant (∩ empreinte).
const POLYGONES: PolygoneBdTopo[] = [{ cleabs: 'BATI-1', anneau: carre(10, 10), etat: 'En service' }];

const emp = (over: Partial<EmpriseReconstruite> = {}): EmpriseReconstruite => ({
  id: 1, dossierId: 900, corpsId: 10, libelle: 'bâtiment A', anneau: carre(40, 40), anneaux: [carre(40, 40)],
  surfaceM2: 120, pieceId: null, page: 2, calage: null, residuM: 0.5, provenance: 'trace_manuel', creeLe: null, ...over,
});
const props = (etat: EtatSuivi, emprises: EmpriseReconstruite[], batiments = [{ corpsId: 10, repere: 'A' }]) =>
  ({ etat, emprises, parcelle: PARCELLE, polygones: POLYGONES, batiments });
const nb = (s: string, sub: string) => s.split(sub).length - 1;

describe('PROJ-4a — récap (lecture seule) de l’emprise projetée dans le Rattachement', () => {
  it('permis avec emprises « en attente de bâti » → les TROIS couches (parcelle · bâti BD TOPO · emprise) + légende', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [emp()])));
    expect(html).toContain('schéma de la parcelle, du bâti BD TOPO et des emprises reconstituées'); // le schéma est dessiné
    expect(html).toContain('data-etat="En service"');   // couche bâti BD TOPO existant
    expect(html).toContain('data-emprise="1"');           // couche emprise projetée
    // Légende reprise de l'écran de projection (les trois catégories nommées).
    expect(html).toContain('Bâti existant (BD TOPO)');
    expect(html).toContain('En projet (donnée IGN)');
    expect(html).toContain('Emprise tracée (reconstitution — jamais une mesure)');
  });

  it('permis « en attente de bâti » SANS emprise → message explicite, JAMAIS un schéma vide', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [])));
    expect(html).toContain('aucune emprise projetée n’a été enregistrée');
    expect(html).not.toContain('role="img"'); // pas de <svg> schéma
    expect(html).not.toContain('data-emprise');
  });

  it('permis HORS « en attente de bâti » (rattaché) → rien du tout', () => {
    for (const etat of ['valide', 'arbitrage_demande', 'refuse', 'suivi_aucun_signal'] as EtatSuivi[]) {
      expect(renderToStaticMarkup(h(RecapProjectionRattachement, props(etat, [emp()])))).toBe('');
    }
  });

  it('un bâtiment à PLUSIEURS emprises → toutes listées et toutes dessinées', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [
      emp({ id: 1, libelle: 'bâtiment A (1)' }), emp({ id: 2, libelle: 'bâtiment A (2)', anneau: carre(70, 70), anneaux: [carre(70, 70)] }),
    ])));
    // NOM-1 — ListeEmprises affiche le nom RÉSOLU du corps (repere « A »), qui PRIME sur le libellé stocké par emprise (vestigial).
    expect(html).not.toContain('bâtiment A (1)');
    expect(html).not.toContain('bâtiment A (2)');
    expect(html).toContain('data-emprise="1"'); // les deux emprises restent listées ET dessinées
    expect(html).toContain('data-emprise="2"');
  });

  it('emprise MULTI-PARTIES (MultiPolygon) → chaque partie est dessinée', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [
      emp({ id: 7, anneaux: [carre(40, 40), carre(70, 40)] }),
    ])));
    // Les contours dessinés portent « data-emprise="7" data-provenance » (le <li> de la liste, lui, ne porte pas data-provenance
    //   accolé) → on compte les PARTIES tracées dans le schéma, pas l'entrée de liste.
    expect(nb(html, 'data-emprise="7" data-provenance')).toBe(2); // deux contours pour la même emprise
  });

  // AFF-2 — la liste des EMPRISES (provenance, orphelines) est REVENUE dans ce récap (perdue par AFF-1, restaurée à sa place).
  it('AFF-2 — la PROVENANCE des emprises est de nouveau affichée (les trois valeurs)', () => {
    const trois: ProvenanceEmprise[] = ['trace_manuel', 'ign_adopte', 'ign_retouche'];
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati',
      trois.map((p, i) => emp({ id: i + 1, libelle: `bâtiment ${i}`, provenance: p })))));
    expect(html).toContain('tracé à la main');
    expect(html).toContain('issue de l’IGN');
    expect(html).toContain('IGN retouchée à la main');
  });

  it('AFF-2 — les emprises orphelines (corpsId null) sont de nouveau listées à part, jamais perdues', () => {
    const html = renderToStaticMarkup(h(RecapProjectionRattachement, props('en_attente_bati', [emp({ id: 3, corpsId: null, libelle: 'ancienne emprise' })])));
    expect(html).toContain('Emprises non rattachées à un bâtiment');
    expect(html).toContain('ancienne emprise');
    expect(html).toContain('data-emprise="3"');
  });
});
